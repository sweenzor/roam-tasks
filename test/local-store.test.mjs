import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createJsonLocalStore, normalizeLocalStore } from "../server/local-store.mjs";
import { createSandboxTempDir } from "./helpers/temp-dir.mjs";

test("JSON local store reads missing files as an empty GTD store", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-store");
  if (!dir) return;

  const store = createJsonLocalStore(join(dir, "gtd-state.json"));
  assert.deepEqual(await store.read(), {
    version: 1,
    localTasks: [],
    localState: {}
  });
});

test("JSON local store writes normalized GTD state to disk", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-store");
  if (!dir) return;

  const path = join(dir, "nested", "gtd-state.json");
  const store = createJsonLocalStore(path);

  await store.write({
    localTasks: [{ uid: "local-1", text: "Local task" }, "bad local task"],
    localState: { "roam-1": { gtdStatus: "next" }, "roam-2": "bad overlay" },
    ignored: true
  });

  const stored = {
    version: 1,
    localTasks: [{ uid: "local-1", text: "Local task" }],
    localState: { "roam-1": { gtdStatus: "next" } }
  };

  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), stored);
  assert.deepEqual(await store.read(), stored);
});

test("JSON local store preserves malformed JSON and recovers to a clean GTD store", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-store");
  if (!dir) return;

  const path = join(dir, "gtd-state.json");
  await writeFile(path, "{ bad json", "utf8");
  const store = createJsonLocalStore(path);

  assert.deepEqual(await store.read(), {
    version: 1,
    localTasks: [],
    localState: {}
  });
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    version: 1,
    localTasks: [],
    localState: {}
  });

  const info = store.info();
  assert.equal(info.filePath, path);
  assert.equal(info.recovery.errorName, "SyntaxError");
  assert.equal(typeof info.recovery.error, "string");
  assert.notEqual(info.recovery.error, "");
  assert.match(info.recovery.preservedPath, /gtd-state\.json\.corrupt-/);
  assert.equal(await readFile(info.recovery.preservedPath, "utf8"), "{ bad json");
});

test("JSON local store recovers malformed roots with preserved fragments", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-store");
  if (!dir) return;

  const path = join(dir, "gtd-state.json");
  await writeFile(path, JSON.stringify({ localTasks: "bad tasks root", localState: ["bad state root"] }), "utf8");
  const store = createJsonLocalStore(path);

  assert.deepEqual(await store.read(), {
    version: 1,
    localTasks: [],
    localState: {}
  });
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    version: 1,
    localTasks: [],
    localState: {}
  });

  const info = store.info();
  assert.equal(info.recovery.errorName, "LocalStoreStructureError");
  assert.match(info.recovery.error, /localTasks/);
  assert.match(info.recovery.error, /localState/);
  assert.match(info.recovery.preservedPath, /gtd-state\.json\.invalid-/);

  const preserved = JSON.parse(await readFile(info.recovery.preservedPath, "utf8"));
  assert.equal(preserved.storePath, path);
  assert.deepEqual(preserved.invalidFragments, [
    {
      path: "localTasks",
      reason: "Expected localTasks to be an array.",
      value: "bad tasks root"
    },
    {
      path: "localState",
      reason: "Expected localState to be an object.",
      value: ["bad state root"]
    }
  ]);
});

test("JSON local store keeps valid data while preserving malformed partial fragments", async (t) => {
  const dir = await createSandboxTempDir(t, "roam-tasks-store");
  if (!dir) return;

  const path = join(dir, "gtd-state.json");
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      localTasks: [{ uid: "local-1", text: "Keep local task" }, "bad local task"],
      localState: {
        "roam-1": { gtdStatus: "next", project: "Launch" },
        "roam-2": "bad overlay"
      }
    }),
    "utf8"
  );
  const store = createJsonLocalStore(path);

  const recovered = {
    version: 1,
    localTasks: [{ uid: "local-1", text: "Keep local task" }],
    localState: {
      "roam-1": { gtdStatus: "next", project: "Launch" }
    }
  };

  assert.deepEqual(await store.read(), recovered);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), recovered);

  const info = store.info();
  assert.equal(info.recovery.errorName, "LocalStoreStructureError");
  assert.match(info.recovery.error, /localTasks\[1\]/);
  assert.match(info.recovery.error, /localState\["roam-2"\]/);
  assert.match(info.recovery.preservedPath, /gtd-state\.json\.invalid-/);

  const preserved = JSON.parse(await readFile(info.recovery.preservedPath, "utf8"));
  assert.equal(preserved.storePath, path);
  assert.deepEqual(preserved.invalidFragments, [
    {
      path: "localTasks[1]",
      reason: "Expected local task entries to be objects.",
      value: "bad local task"
    },
    {
      path: 'localState["roam-2"]',
      reason: "Expected localState overlay entries to be objects.",
      value: "bad overlay"
    }
  ]);
});

test("JSON local store normalization rejects malformed roots and overlays", () => {
  assert.deepEqual(normalizeLocalStore({ localTasks: "bad", localState: [] }), {
    version: 1,
    localTasks: [],
    localState: {}
  });
  assert.deepEqual(
    normalizeLocalStore({
      localTasks: [{ uid: "local-1" }, null, ["bad"]],
      localState: { "roam-1": { gtdStatus: "next" }, "roam-2": null, "roam-3": [] }
    }),
    {
      version: 1,
      localTasks: [{ uid: "local-1" }],
      localState: { "roam-1": { gtdStatus: "next" } }
    }
  );
});
