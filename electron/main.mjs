import { join } from "node:path";
import { app, BrowserWindow, Menu, dialog, shell, screen } from "electron";
import { startServer } from "../server/index.mjs";
import { defaultWindowBounds, loadWindowState, minimumWindowSize, watchWindowState } from "./window-state.mjs";

app.setName("Roam Tasks");

let mainWindow;
let serverInfo;

async function createWindow() {
  if (!serverInfo) {
    serverInfo = await startServer({
      host: "127.0.0.1",
      port: Number(process.env.ELECTRON_PORT) || 0,
      localStorePath: join(app.getPath("userData"), "gtd-state.json")
    });
    await waitForServer(serverInfo.url);
  }

  const windowState = loadWindowState(app, screen.getAllDisplays());

  mainWindow = new BrowserWindow({
    title: "Roam Tasks",
    ...defaultWindowBounds,
    ...windowState.bounds,
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    backgroundColor: "#171a18",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  watchWindowState(app, mainWindow);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Failed to load ${validatedUrl}: ${errorDescription} (${errorCode})`);
  });

  mainWindow.once("ready-to-show", () => {
    if (windowState.isMaximized) mainWindow.maximize();
    mainWindow.show();
    if (windowState.isFullScreen) mainWindow.setFullScreen(true);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedNavigation(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedNavigation(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  await loadAppUrl(mainWindow, serverInfo.url);
}

function isAppUrl(url) {
  if (!serverInfo) return false;

  try {
    return new URL(url).origin === new URL(serverInfo.url).origin;
  } catch {
    return false;
  }
}

function isAllowedNavigation(url) {
  return isAppUrl(url) || url.startsWith("data:text/html,") || url === "about:blank";
}

async function waitForServer(url) {
  const deadline = Date.now() + 5000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Local server did not become ready at ${url}: ${lastError?.message || "unknown error"}`);
}

async function loadAppUrl(window, url) {
  try {
    await window.loadURL(url);
  } catch (error) {
    console.error(error);
    await window.loadURL(
      `data:text/html,${encodeURIComponent(renderLoadFailurePage(url, error.message || String(error)))}`
    );
  }
}

function renderLoadFailurePage(url, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Roam Tasks</title>
    <style>
      body {
        align-items: center;
        background: #171a18;
        color: #f2f4ef;
        display: flex;
        font: 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
      }
      main {
        max-width: 560px;
        padding: 32px;
      }
      h1 {
        font-size: 24px;
        margin: 0 0 12px;
      }
      p {
        color: #c7ccc4;
        line-height: 1.5;
      }
      code {
        background: #252a27;
        border-radius: 6px;
        color: #f8df72;
        padding: 2px 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Roam Tasks could not load</h1>
      <p>The local server started at <code>${escapeHtml(url)}</code>, but Electron could not load the window.</p>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
}).catch((error) => {
  dialog.showErrorBox("Roam Tasks could not start", error.message || String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverInfo?.server?.listening) serverInfo.server.close();
});
