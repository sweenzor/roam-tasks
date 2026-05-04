import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonLocalStore, normalizeLocalStore } from "../server/local-store.mjs";

test("JSON local store reads missing files as an empty GTD store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roam-tasks-store-"));
  try {
    const store = createJsonLocalStore(join(dir, "gtd-state.json"));
    assert.deepEqual(await store.read(), {
      version: 1,
      localTasks: [],
      localState: {}
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("JSON local store writes normalized GTD state to disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roam-tasks-store-"));
  try {
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("JSON local store surfaces malformed JSON instead of replacing it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roam-tasks-store-"));
  try {
    const path = join(dir, "gtd-state.json");
    await writeFile(path, "{ bad json", "utf8");
    const store = createJsonLocalStore(path);

    await assert.rejects(store.read(), SyntaxError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
