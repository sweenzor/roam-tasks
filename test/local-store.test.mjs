import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonLocalStore } from "../server/local-store.mjs";

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

    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      version: 1,
      localTasks: [{ uid: "local-1", text: "Local task" }],
      localState: { "roam-1": { gtdStatus: "next" } }
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
