import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  legacyProfilePathFor,
  legacyProfileMigrationUserMessage,
  mergeLocalStores,
  migrateLegacyProfile,
  profileMigrationFilename
} from "../electron/profile-migration.mjs";
import { createSandboxTempDir } from "./helpers/temp-dir.mjs";

test("Electron runs the legacy profile migration before creating the app window", async () => {
  const main = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  const migrationIndex = main.indexOf("await migrateLegacyProfileBeforeStart()");
  const windowIndex = main.indexOf("await createWindow()");

  assert.notEqual(migrationIndex, -1);
  assert.notEqual(windowIndex, -1);
  assert.ok(migrationIndex < windowIndex);
});

test("legacy profile path is the old app-name sibling of the current profile", () => {
  assert.equal(
    legacyProfilePathFor("/Users/sweeney/Library/Application Support/Roam Tasks"),
    "/Users/sweeney/Library/Application Support/roam-tasks"
  );
});

test("legacy profile migration copies useful Electron state without overwriting current files", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-profile-migration");
  if (!dir) return;

  const legacy = join(dir, "roam-tasks");
  const current = join(dir, "Roam Tasks");
  await mkdir(join(legacy, "Local Storage", "leveldb"), { recursive: true });
  await mkdir(current, { recursive: true });
  await writeFile(join(legacy, "window-state.json"), JSON.stringify({ bounds: { width: 800 } }), "utf8");
  await writeFile(join(legacy, "Preferences"), "legacy preferences", "utf8");
  await writeFile(join(legacy, "Local Storage", "leveldb", "000003.log"), "legacy local storage", "utf8");
  await writeFile(join(current, "Preferences"), "current preferences", "utf8");

  const summary = await migrateLegacyProfile({
    currentUserDataPath: current,
    legacyUserDataPath: legacy,
    now: () => new Date("2026-05-07T12:00:00.000Z")
  });

  assert.equal(summary.status, "needs-attention");
  assert.equal(summary.requiresAttention, true);
  assert.deepEqual(summary.copied.sort(), ["Local Storage", "window-state.json"].sort());
  assert.equal(summary.archive.status, "archived");
  assert.equal(await pathExists(legacy), false);
  assert.equal(await readFile(join(current, "window-state.json"), "utf8"), "{\"bounds\":{\"width\":800}}");
  assert.equal(await readFile(join(current, "Preferences"), "utf8"), "current preferences");
  assert.equal(await readFile(join(current, "Local Storage", "leveldb", "000003.log"), "utf8"), "legacy local storage");
  assert.equal(await readFile(join(summary.archive.path, "Preferences"), "utf8"), "legacy preferences");

  const marker = JSON.parse(await readFile(join(current, profileMigrationFilename), "utf8"));
  assert.equal(marker.migratedAt, "2026-05-07T12:00:00.000Z");
  assert.equal(marker.archive.path, summary.archive.path);
  assert.deepEqual(marker.attention[0], {
    reason: "destination-exists",
    entries: ["Preferences"],
    message: "Current profile files were kept; legacy versions were preserved in the archived legacy profile."
  });
  assert.deepEqual(marker.skipped.find((entry) => entry.entry === "Preferences"), {
    entry: "Preferences",
    status: "destination-exists"
  });

  const secondSummary = await migrateLegacyProfile({
    currentUserDataPath: current,
    legacyUserDataPath: legacy
  });
  assert.equal(secondSummary.reason, "already-migrated");
  assert.equal(await readFile(join(current, "window-state.json"), "utf8"), "{\"bounds\":{\"width\":800}}");
});

test("legacy profile migration reconciles an old marker when the legacy profile still exists", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-profile-lingering");
  if (!dir) return;

  const legacy = join(dir, "roam-tasks");
  const current = join(dir, "Roam Tasks");
  await mkdir(legacy, { recursive: true });
  await mkdir(current, { recursive: true });
  await writeFile(join(legacy, "Preferences"), "legacy preferences", "utf8");
  await writeFile(join(current, "Preferences"), "current preferences", "utf8");
  await writeFile(
    join(current, profileMigrationFilename),
    `${JSON.stringify({ version: 1, status: "migrated" })}\n`,
    "utf8"
  );

  const summary = await migrateLegacyProfile({
    currentUserDataPath: current,
    legacyUserDataPath: legacy,
    now: () => new Date("2026-05-07T12:30:00.000Z")
  });

  assert.equal(summary.status, "needs-attention");
  assert.equal(summary.reason, "legacy-profile-still-present");
  assert.equal(summary.previousMigrationMarker, join(current, profileMigrationFilename));
  assert.equal(summary.archive.status, "archived");
  assert.equal(await pathExists(legacy), false);
  assert.equal(await readFile(join(current, "Preferences"), "utf8"), "current preferences");
  assert.equal(await readFile(join(summary.archive.path, "Preferences"), "utf8"), "legacy preferences");

  const marker = JSON.parse(await readFile(join(current, profileMigrationFilename), "utf8"));
  assert.equal(marker.reason, "legacy-profile-still-present");
  assert.equal(marker.archive.path, summary.archive.path);
});

test("legacy GTD state merges into the current profile without replacing newer entries", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-profile-store-migration");
  if (!dir) return;

  const legacy = join(dir, "roam-tasks");
  const current = join(dir, "Roam Tasks");
  await mkdir(legacy, { recursive: true });
  await mkdir(current, { recursive: true });
  await writeFile(
    join(legacy, "gtd-state.json"),
    `${JSON.stringify({
      version: 1,
      localTasks: [
        { uid: "old-local", text: "Old local task" },
        { uid: "shared-local", text: "Old shared local task" }
      ],
      localState: {
        "old-roam": { gtdStatus: "waiting" },
        "shared-roam": { gtdStatus: "someday" }
      }
    })}\n`,
    "utf8"
  );
  await writeFile(
    join(current, "gtd-state.json"),
    `${JSON.stringify({
      version: 1,
      localTasks: [
        { uid: "new-local", text: "New local task" },
        { uid: "shared-local", text: "New shared local task" }
      ],
      localState: {
        "new-roam": { gtdStatus: "next" },
        "shared-roam": { gtdStatus: "next" }
      }
    })}\n`,
    "utf8"
  );

  const summary = await migrateLegacyProfile({
    currentUserDataPath: current,
    legacyUserDataPath: legacy
  });
  const stored = JSON.parse(await readFile(join(current, "gtd-state.json"), "utf8"));

  assert.equal(summary.localStore.status, "merged");
  assert.equal(summary.localStore.importedLocalTasks, 1);
  assert.equal(summary.localStore.importedLocalState, 1);
  assert.deepEqual(stored.localTasks.map((task) => [task.uid, task.text]), [
    ["new-local", "New local task"],
    ["shared-local", "New shared local task"],
    ["old-local", "Old local task"]
  ]);
  assert.deepEqual(stored.localState, {
    "old-roam": { gtdStatus: "waiting" },
    "shared-roam": { gtdStatus: "next" },
    "new-roam": { gtdStatus: "next" }
  });
});

test("legacy profile migration message makes preserved conflicts obvious", () => {
  const message = legacyProfileMigrationUserMessage({
    currentUserDataPath: "/Users/sweeney/Library/Application Support/Roam Tasks",
    legacyUserDataPath: "/Users/sweeney/Library/Application Support/roam-tasks",
    requiresAttention: true,
    skipped: [{ entry: "Preferences", status: "destination-exists" }],
    localStore: { status: "merged", importedLocalTasks: 1, importedLocalState: 2 },
    archive: {
      status: "archived",
      path: "/Users/sweeney/Library/Application Support/Roam Tasks/legacy-profile-archive/roam-tasks-2026-05-07T12-00-00-000Z"
    },
    errors: []
  });

  assert.equal(message.type, "warning");
  assert.equal(message.message, "Legacy Roam Tasks profile data needs review");
  assert.match(message.detail, /Preserved legacy profile:/);
  assert.match(message.detail, /Current files already existed for: Preferences/);
  assert.match(message.detail, /Imported local GTD state: 1 task\(s\), 2 overlay\(s\)/);

  assert.equal(legacyProfileMigrationUserMessage({ requiresAttention: false }), null);
});

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("local GTD store merge helper keeps current conflicts and imports missing legacy data", () => {
  const { store, importedLocalTasks, importedLocalState } = mergeLocalStores(
    {
      localTasks: [{ uid: "current" }, { uid: "shared", text: "Current" }],
      localState: { current: { gtdStatus: "next" }, shared: { gtdStatus: "next" } }
    },
    {
      localTasks: [{ uid: "legacy" }, { uid: "shared", text: "Legacy" }],
      localState: { legacy: { gtdStatus: "waiting" }, shared: { gtdStatus: "someday" } }
    }
  );

  assert.equal(importedLocalTasks, 1);
  assert.equal(importedLocalState, 1);
  assert.deepEqual(store.localTasks, [{ uid: "current" }, { uid: "shared", text: "Current" }, { uid: "legacy" }]);
  assert.deepEqual(store.localState, {
    legacy: { gtdStatus: "waiting" },
    shared: { gtdStatus: "next" },
    current: { gtdStatus: "next" }
  });
});
