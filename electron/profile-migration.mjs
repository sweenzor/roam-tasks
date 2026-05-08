import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { normalizeLocalStore } from "../server/local-store.mjs";

export const legacyProfileName = "roam-tasks";
export const profileMigrationFilename = "legacy-profile-migration.json";

const migrationVersion = 1;
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
    errors: []
  };

  if (samePath(currentUserDataPath, resolvedLegacyUserDataPath)) {
    summary.reason = "same-profile";
    return summary;
  }

  if (!(await pathExists(resolvedLegacyUserDataPath))) {
    summary.reason = "legacy-profile-missing";
    return summary;
  }

  await mkdir(currentUserDataPath, { recursive: true });
  const markerPath = join(currentUserDataPath, profileMigrationFilename);
  if (await pathExists(markerPath)) {
    summary.reason = "already-migrated";
    return summary;
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

  summary.status = summary.copied.length > 0 || summary.localStore.status === "merged" ? "migrated" : "skipped";
  if (summary.status === "skipped") summary.reason = "nothing-to-migrate";

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

function localStoreMigrationError(profile, path, error) {
  return {
    profile,
    path,
    errorName: error?.name || "Error",
    message: error?.message || String(error)
  };
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
