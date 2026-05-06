const defaultFlushTimeoutMs = 5000;

export const rendererLocalStoreFlushExpression = `
  globalThis.roamTasks?.flushLocalStoreSaves
    ? globalThis.roamTasks.flushLocalStoreSaves()
    : true
`;

export function installShutdownFlush({ app, getWindow, getServerInfo, timeoutMs = defaultFlushTimeoutMs }) {
  let isFlushComplete = false;
  let isFlushing = false;

  app.on("before-quit", (event) => {
    if (isFlushComplete) return;

    event.preventDefault();
    if (isFlushing) return;

    isFlushing = true;
    flushBeforeShutdown({
      window: getWindow(),
      serverInfo: getServerInfo(),
      timeoutMs
    }).finally(() => {
      isFlushComplete = true;
      app.quit();
    });
  });
}

export function installWindowCloseFlush(window, { timeoutMs = defaultFlushTimeoutMs } = {}) {
  let isFlushComplete = false;
  let isFlushing = false;

  window.on("close", (event) => {
    if (isFlushComplete || !hasFlushableWebContents(window)) return;

    event.preventDefault();
    if (isFlushing) return;

    isFlushing = true;
    flushRendererLocalStore(window, { timeoutMs }).finally(() => {
      isFlushComplete = true;
      if (!window.isDestroyed?.()) window.close();
    });
  });
}

export function installReloadFlush(window, { timeoutMs = defaultFlushTimeoutMs } = {}) {
  let isReloading = false;

  window.webContents.on("before-input-event", (event, input) => {
    if (isReloading || !isReloadShortcut(input)) return;

    event.preventDefault();
    isReloading = true;
    flushRendererLocalStore(window, { timeoutMs }).finally(() => {
      isReloading = false;
      if (hasFlushableWebContents(window)) window.webContents.reload();
    });
  });
}

export async function flushBeforeShutdown({ window, serverInfo, timeoutMs = defaultFlushTimeoutMs } = {}) {
  await flushRendererLocalStore(window, { timeoutMs });
  await closeServer(serverInfo?.server, { timeoutMs });
}

export async function flushRendererLocalStore(window, { timeoutMs = defaultFlushTimeoutMs } = {}) {
  if (!hasFlushableWebContents(window)) return true;

  try {
    return Boolean(
      await withTimeout(
        window.webContents.executeJavaScript(rendererLocalStoreFlushExpression, true),
        timeoutMs
      )
    );
  } catch (error) {
    console.warn(`Could not flush local GTD state before shutdown: ${error.message || String(error)}`);
    return false;
  }
}

export async function closeServer(server, { timeoutMs = defaultFlushTimeoutMs } = {}) {
  if (!server?.listening) return;

  await withTimeout(
    new Promise((resolve) => {
      server.close((error) => {
        if (error) {
          console.warn(`Could not close local server cleanly: ${error.message || String(error)}`);
        }
        resolve();
      });
    }),
    timeoutMs
  ).catch((error) => {
    console.warn(`Timed out closing local server: ${error.message || String(error)}`);
  });
}

export function isReloadShortcut(input = {}) {
  if (input.type !== "keyDown") return false;
  if (input.key === "F5") return true;
  return String(input.key || "").toLowerCase() === "r" && Boolean(input.meta || input.control);
}

function hasFlushableWebContents(window) {
  const webContents = window?.webContents;
  return Boolean(webContents && !window.isDestroyed?.() && !webContents.isDestroyed?.());
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
