import test from "node:test";
import assert from "node:assert/strict";
import { createLocalStoreSaveQueue } from "../public/local-store-save-queue.js";

test("local store save queue flush waits for every queued snapshot", async () => {
  const releases = [];
  const saved = [];
  const queue = createLocalStoreSaveQueue({
    saveSnapshot: async (snapshot) => {
      saved.push(snapshot);
      await new Promise((resolve) => releases.push(resolve));
      return true;
    }
  });

  queue.enqueue({ localTasks: [{ uid: "local-1" }], localState: {} });
  queue.enqueue({ localTasks: [{ uid: "local-2" }], localState: {} });

  let didFlush = false;
  const flush = queue.flush().then((result) => {
    didFlush = true;
    return result;
  });

  await waitForTurn();
  assert.equal(saved.length, 1);
  assert.equal(didFlush, false);
  assert.equal(queue.hasPending(), true);

  releases[0]();
  await waitForTurn();
  assert.equal(saved.length, 2);
  assert.equal(didFlush, false);

  releases[1]();
  assert.equal(await flush, true);
  assert.equal(didFlush, true);
  assert.equal(queue.hasPending(), false);
  assert.deepEqual(saved.map((snapshot) => snapshot.localTasks[0].uid), ["local-1", "local-2"]);
});

test("local store save queue snapshots are isolated from later state mutation", async () => {
  const saved = [];
  const queue = createLocalStoreSaveQueue({
    saveSnapshot: async (snapshot) => {
      saved.push(snapshot);
      return true;
    }
  });
  const snapshot = {
    localTasks: [{ uid: "local-1", text: "Original" }],
    localState: { "local-1": { project: "Inbox" } }
  };

  queue.enqueue(snapshot);
  snapshot.localTasks[0].text = "Mutated";
  snapshot.localState["local-1"].project = "Changed";

  assert.equal(await queue.flush(), true);
  assert.deepEqual(saved, [
    {
      localTasks: [{ uid: "local-1", text: "Original" }],
      localState: { "local-1": { project: "Inbox" } }
    }
  ]);
});

function waitForTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}
