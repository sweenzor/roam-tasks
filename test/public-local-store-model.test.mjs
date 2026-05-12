import test from "node:test";
import assert from "node:assert/strict";
import {
  hasLocalStoreData,
  normalizeLocalStore,
  normalizeLocalStoreInfo
} from "../public/local-store-model.js";

test("local store normalization keeps valid fragments and drops malformed overlays", () => {
  const store = normalizeLocalStore({
    localTasks: [{ uid: "local-1", text: "Keep me" }],
    localState: {
      "task-1": { gtdStatus: "next" },
      "task-2": null,
      "task-3": "bad",
      "task-4": []
    }
  });

  assert.deepEqual(store, {
    localTasks: [{ uid: "local-1", text: "Keep me" }],
    localState: {
      "task-1": { gtdStatus: "next" }
    }
  });
  assert.equal(hasLocalStoreData(store), true);
  assert.equal(hasLocalStoreData(normalizeLocalStore({ localTasks: "bad", localState: null })), false);
});

test("local store diagnostics normalize untrusted server values to strings", () => {
  assert.deepEqual(
    normalizeLocalStoreInfo({
      storePath: "/tmp/state.json",
      recovery: {
        error: "Bad JSON",
        errorName: "SyntaxError",
        preservedPath: "/tmp/state.bad.json",
        recoveredAt: "2026-05-12T10:00:00.000Z"
      },
      degraded: {
        error: "Server unavailable",
        fallback: "localStorage",
        fallbackError: 42,
        degradedAt: "2026-05-12T10:01:00.000Z"
      }
    }),
    {
      storePath: "/tmp/state.json",
      recovery: {
        error: "Bad JSON",
        errorName: "SyntaxError",
        preservedPath: "/tmp/state.bad.json",
        recoveredAt: "2026-05-12T10:00:00.000Z"
      },
      degraded: {
        error: "Server unavailable",
        fallback: "localStorage",
        fallbackError: "",
        degradedAt: "2026-05-12T10:01:00.000Z"
      }
    }
  );

  assert.deepEqual(normalizeLocalStoreInfo({ recovery: [], degraded: "bad", storePath: 1 }), {
    storePath: "",
    recovery: null,
    degraded: null
  });
});
