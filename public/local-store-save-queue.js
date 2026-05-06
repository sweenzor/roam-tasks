export function createLocalStoreSaveQueue({ saveSnapshot }) {
  let queue = Promise.resolve(true);
  let pendingCount = 0;
  let lastResult = true;

  function enqueue(snapshot) {
    const queuedSnapshot = cloneJson(snapshot);
    pendingCount += 1;

    queue = queue
      .catch(() => false)
      .then(async () => {
        try {
          lastResult = Boolean(await saveSnapshot(queuedSnapshot));
          return lastResult;
        } catch {
          lastResult = false;
          return false;
        } finally {
          pendingCount -= 1;
        }
      });

    return queue;
  }

  async function flush() {
    while (pendingCount > 0) {
      const pendingQueue = queue;
      await pendingQueue.catch(() => false);
      if (pendingQueue === queue) break;
    }

    return lastResult;
  }

  function hasPending() {
    return pendingCount > 0;
  }

  return {
    enqueue,
    flush,
    hasPending
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
