import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  flushBeforeShutdown,
  installReloadFlush,
  installShutdownFlush,
  isReloadShortcut,
  rendererLocalStoreFlushExpression
} from "../electron/shutdown.mjs";

test("shutdown flush waits for renderer local state before closing the server", async () => {
  const rendererFlush = deferred();
  let didCloseServer = false;
  const window = fakeWindow({
    executeJavaScript: async (script, userGesture) => {
      assert.equal(script, rendererLocalStoreFlushExpression);
      assert.equal(userGesture, true);
      await rendererFlush.promise;
      return true;
    }
  });
  const serverInfo = {
    server: {
      listening: true,
      close(callback) {
        didCloseServer = true;
        this.listening = false;
        callback();
      }
    }
  };

  const shutdown = flushBeforeShutdown({ window, serverInfo });

  await waitForTurn();
  assert.equal(didCloseServer, false);

  rendererFlush.resolve();
  await shutdown;
  assert.equal(didCloseServer, true);
});

test("before-quit is prevented until the local state flush completes", async () => {
  const rendererFlush = deferred();
  const app = new EventEmitter();
  let quitCalls = 0;
  app.quit = () => {
    quitCalls += 1;
  };
  const window = fakeWindow({
    executeJavaScript: async () => {
      await rendererFlush.promise;
      return true;
    }
  });

  installShutdownFlush({
    app,
    getWindow: () => window,
    getServerInfo: () => null
  });

  let wasPrevented = false;
  app.emit("before-quit", {
    preventDefault() {
      wasPrevented = true;
    }
  });

  await waitForTurn();
  assert.equal(wasPrevented, true);
  assert.equal(quitCalls, 0);

  rendererFlush.resolve();
  await waitForTurn();
  assert.equal(quitCalls, 1);
});

test("reload shortcuts flush local state before reloading the window", async () => {
  const rendererFlush = deferred();
  let reloads = 0;
  const window = fakeWindow({
    executeJavaScript: async () => {
      await rendererFlush.promise;
      return true;
    },
    reload: () => {
      reloads += 1;
    }
  });

  installReloadFlush(window);

  let wasPrevented = false;
  window.webContents.emit("before-input-event", {
    preventDefault() {
      wasPrevented = true;
    }
  }, {
    type: "keyDown",
    key: "r",
    meta: true
  });

  await waitForTurn();
  assert.equal(wasPrevented, true);
  assert.equal(reloads, 0);

  rendererFlush.resolve();
  await waitForTurn();
  assert.equal(reloads, 1);
});

test("reload shortcut detection covers common Electron reload keys", () => {
  assert.equal(isReloadShortcut({ type: "keyDown", key: "r", meta: true }), true);
  assert.equal(isReloadShortcut({ type: "keyDown", key: "R", control: true }), true);
  assert.equal(isReloadShortcut({ type: "keyDown", key: "F5" }), true);
  assert.equal(isReloadShortcut({ type: "keyUp", key: "r", meta: true }), false);
  assert.equal(isReloadShortcut({ type: "keyDown", key: "r" }), false);
});

function fakeWindow({ executeJavaScript, reload = () => {} } = {}) {
  const webContents = new EventEmitter();
  webContents.executeJavaScript = executeJavaScript || (async () => true);
  webContents.reload = reload;
  webContents.isDestroyed = () => false;

  return {
    webContents,
    isDestroyed: () => false
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function waitForTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}
