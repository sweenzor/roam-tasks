import { cp, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { normalizeLocalStore } from "../server/local-store.mjs";

export const legacyProfileName = "roam-tasks";
export const profileMigrationFilename = "legacy-profile-migration.json";

const migrationVersion = 1;
const profileArchiveDirectoryName = "legacy-profile-archive";
const copiedProfileEntries = Object.freeze([
  "window-state.json",
  "Local Storage",
  "Session Storage",
  "IndexedDB",
  "File System",
  "databases",
  "Preferences"
]);

export function legacyProfilePathFor(currentUserDataPath) {
  return join(dirname(currentUserDataPath), legacyProfileName);
}

export async function migrateLegacyProfile({
  currentUserDataPath,
  legacyUserDataPath,
  now = () => new Date()
} = {}) {
  if (!currentUserDataPath) {
    throw new Error("currentUserDataPath is required for legacy profile migration.");
  }
  const resolvedLegacyUserDataPath = legacyUserDataPath || legacyProfilePathFor(currentUserDataPath);

  const summary = {
    version: migrationVersion,
    migratedAt: now().toISOString(),
    currentUserDataPath,
    legacyUserDataPath: resolvedLegacyUserDataPath,
    status: "skipped",
    copied: [],
    skipped: [],
    localStore: null,
    archive: null,
    requiresAttention: false,
    attention: [],
    errors: []
  };

  if (samePath(currentUserDataPath, resolvedLegacyUserDataPath)) {
    summary.reason = "same-profile";
    return summary;
  }

  const markerPath = join(currentUserDataPath, profileMigrationFilename);
  const markerExists = await pathExists(markerPath);
  const legacyProfileExists = await pathExists(resolvedLegacyUserDataPath);

  if (!legacyProfileExists) {
    summary.reason = markerExists ? "already-migrated" : "legacy-profile-missing";
    return summary;
  }

  await mkdir(currentUserDataPath, { recursive: true });
  if (markerExists) {
    summary.previousMigrationMarker = markerPath;
    summary.reason = "legacy-profile-still-present";
  }

  for (const entry of copiedProfileEntries) {
    const result = await copyProfileEntryIfMissing({
      currentUserDataPath,
      entry,
      legacyUserDataPath: resolvedLegacyUserDataPath
    });
    if (result.status === "copied") {
      summary.copied.push(entry);
    } else {
      summary.skipped.push(result);
    }
  }

  summary.localStore = await mergeLegacyLocalStore({
    currentUserDataPath,
    legacyUserDataPath: resolvedLegacyUserDataPath
  });
  if (summary.localStore.error) summary.errors.push(summary.localStore.error);

  summary.archive = await archiveLegacyProfile({
    currentUserDataPath,
    legacyUserDataPath: resolvedLegacyUserDataPath,
    migratedAt: summary.migratedAt
  });
  if (summary.archive.error) summary.errors.push(summary.archive.error);

  finalizeMigrationSummary(summary);

  await writeFile(markerPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

async function copyProfileEntryIfMissing({ currentUserDataPath, entry, legacyUserDataPath }) {
  const sourcePath = join(legacyUserDataPath, entry);
  const destinationPath = join(currentUserDataPath, entry);

  if (!(await pathExists(sourcePath))) return { entry, status: "source-missing" };
  if (await pathExists(destinationPath)) return { entry, status: "destination-exists" };

  await cp(sourcePath, destinationPath, {
    errorOnExist: true,
    force: false,
    preserveTimestamps: true,
    recursive: true
  });
  return { entry, status: "copied" };
}

async function archiveLegacyProfile({ currentUserDataPath, legacyUserDataPath, migratedAt }) {
  if (!(await pathExists(legacyUserDataPath))) return { status: "source-missing" };

  const archiveRoot = join(currentUserDataPath, profileArchiveDirectoryName);
  const archivePath = await nextProfileArchivePath(archiveRoot, migratedAt);

  try {
    await mkdir(archiveRoot, { recursive: true });
    await rename(legacyUserDataPath, archivePath);
    return { status: "archived", path: archivePath };
  } catch (error) {
    return {
      status: "failed",
      path: archivePath,
      error: profileMigrationError("archive-legacy-profile", legacyUserDataPath, error)
    };
  }
}

async function mergeLegacyLocalStore({ currentUserDataPath, legacyUserDataPath }) {
  const legacyPath = join(legacyUserDataPath, "gtd-state.json");
  const currentPath = join(currentUserDataPath, "gtd-state.json");

  if (!(await pathExists(legacyPath))) return { status: "source-missing" };

  let legacyStore;
  try {
    legacyStore = normalizeLocalStore(JSON.parse(await readFile(legacyPath, "utf8")));
  } catch (error) {
    return {
      status: "source-unreadable",
      error: localStoreMigrationError("legacy", legacyPath, error)
    };
  }

  let currentStore = normalizeLocalStore();
  const currentExists = await pathExists(currentPath);
  if (currentExists) {
    try {
      currentStore = normalizeLocalStore(JSON.parse(await readFile(currentPath, "utf8")));
    } catch (error) {
      return {
        status: "destination-unreadable",
        error: localStoreMigrationError("current", currentPath, error)
      };
    }
  }

  const { store, importedLocalTasks, importedLocalState } = mergeLocalStores(currentStore, legacyStore);
  if (!hasLocalStoreData(store) || storesEqual(currentStore, store)) {
    return {
      status: "unchanged",
      importedLocalTasks,
      importedLocalState
    };
  }

  await mkdir(dirname(currentPath), { recursive: true });
  await writeFile(currentPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  return {
    status: "merged",
    importedLocalTasks,
    importedLocalState
  };
}

export function mergeLocalStores(currentStore, legacyStore) {
  const current = normalizeLocalStore(currentStore);
  const legacy = normalizeLocalStore(legacyStore);
  const seenTaskIds = new Set(current.localTasks.map(taskUid).filter(Boolean));
  const importedTasks = [];

  for (const task of legacy.localTasks) {
    const uid = taskUid(task);
    if (uid && seenTaskIds.has(uid)) continue;
    importedTasks.push(task);
    if (uid) seenTaskIds.add(uid);
  }

  const importedStateEntries = Object.fromEntries(
    Object.entries(legacy.localState).filter(([uid]) => !Object.hasOwn(current.localState, uid))
  );

  return {
    store: normalizeLocalStore({
      localTasks: [...current.localTasks, ...importedTasks],
      localState: {
        ...legacy.localState,
        ...current.localState
      }
    }),
    importedLocalTasks: importedTasks.length,
    importedLocalState: Object.keys(importedStateEntries).length
  };
}

export function legacyProfileMigrationUserMessage(summary) {
  if (!summary?.requiresAttention) return null;

  const destinationConflicts = destinationConflictEntries(summary);
  const detail = [
    "Roam Tasks kept the current profile data and preserved the old profile for review.",
    `Current profile: ${summary.currentUserDataPath}`,
    `Legacy profile: ${summary.legacyUserDataPath}`
  ];

  if (summary.archive?.status === "archived") {
    detail.push(`Preserved legacy profile: ${summary.archive.path}`);
  } else if (summary.archive?.status === "failed") {
    detail.push(`Legacy profile is still in place because it could not be archived: ${summary.legacyUserDataPath}`);
  }

  if (destinationConflicts.length > 0) {
    detail.push(`Current files already existed for: ${formatList(destinationConflicts)}`);
  }

  if (summary.localStore?.status === "merged") {
    detail.push(
      `Imported local GTD state: ${summary.localStore.importedLocalTasks} task(s), ${summary.localStore.importedLocalState} overlay(s)`
    );
  } else if (summary.localStore?.status && summary.localStore.status !== "source-missing") {
    detail.push(`Local GTD state migration: ${summary.localStore.status}`);
  }

  if (summary.errors?.length > 0) {
    detail.push(`Migration warnings: ${summary.errors.map((error) => error.message).join("; ")}`);
  }

  return {
    type: "warning",
    title: "Roam Tasks profile migration",
    message: "Legacy Roam Tasks profile data needs review",
    detail: detail.join("\n")
  };
}

function localStoreMigrationError(profile, path, error) {
  return {
    profile,
    path,
    errorName: error?.name || "Error",
    message: error?.message || String(error)
  };
}

function profileMigrationError(operation, path, error) {
  return {
    operation,
    path,
    errorName: error?.name || "Error",
    message: error?.message || String(error)
  };
}

async function nextProfileArchivePath(archiveRoot, migratedAt) {
  const basePath = join(archiveRoot, `${legacyProfileName}-${timestampForPath(migratedAt)}`);

  if (!(await pathExists(basePath))) return basePath;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${basePath}-${suffix}`;
    if (!(await pathExists(candidate))) return candidate;
  }
}

function finalizeMigrationSummary(summary) {
  const destinationConflicts = destinationConflictEntries(summary);
  if (destinationConflicts.length > 0) {
    summary.attention.push({
      reason: "destination-exists",
      entries: destinationConflicts,
      message: "Current profile files were kept; legacy versions were preserved in the archived legacy profile."
    });
  }

  if (summary.archive?.status === "failed") {
    summary.attention.push({
      reason: "archive-failed",
      path: summary.archive.path,
      message: "The legacy profile could not be moved into the current profile archive."
    });
  }

  if (summary.errors.length > 0) {
    summary.attention.push({
      reason: "migration-errors",
      count: summary.errors.length,
      message: "One or more profile migration steps could not be completed."
    });
  }

  summary.requiresAttention = summary.attention.length > 0;
  if (summary.requiresAttention) {
    summary.status = "needs-attention";
    if (!summary.reason) summary.reason = "manual-review-required";
    return;
  }

  if (
    summary.copied.length > 0 ||
    summary.localStore?.status === "merged" ||
    summary.archive?.status === "archived"
  ) {
    summary.status = "migrated";
    return;
  }

  summary.status = "skipped";
  if (!summary.reason) summary.reason = "nothing-to-migrate";
}

function destinationConflictEntries(summary) {
  return (summary.skipped || []).filter((entry) => entry.status === "destination-exists").map((entry) => entry.entry);
}

function formatList(values) {
  return values.join(", ");
}

function timestampForPath(value) {
  return String(value).replace(/[:.]/g, "-");
}

function hasLocalStoreData(store) {
  return store.localTasks.length > 0 || Object.keys(store.localState).length > 0;
}

function storesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function taskUid(task) {
  return typeof task.uid === "string" && task.uid ? task.uid : "";
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function samePath(a, b) {
  return resolve(a) === resolve(b);
}
