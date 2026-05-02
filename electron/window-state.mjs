import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const windowStateFilename = "window-state.json";
const minimumVisibleSize = 80;

export const defaultWindowBounds = Object.freeze({
  width: 960,
  height: 860
});

export const minimumWindowSize = Object.freeze({
  width: 420,
  height: 640
});

export function loadWindowState(app, displays = []) {
  const statePath = getWindowStatePath(app);
  const workAreas = displays.map((display) => display.workArea);

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    return normalizeWindowState(state, workAreas);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`Could not load window state from ${statePath}: ${error.message || String(error)}`);
    }
    return normalizeWindowState(null, workAreas);
  }
}

export function watchWindowState(app, window) {
  let saveTimer;

  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(app, window), 250);
  };

  const saveNow = () => {
    clearTimeout(saveTimer);
    saveWindowState(app, window);
  };

  for (const eventName of ["resize", "move", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    window.on(eventName, scheduleSave);
  }

  window.on("close", saveNow);
  window.on("closed", () => clearTimeout(saveTimer));
}

export function saveWindowState(app, window) {
  if (window.isDestroyed()) return;

  const statePath = getWindowStatePath(app);
  const state = serializeWindowState(window);

  try {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch (error) {
    console.warn(`Could not save window state to ${statePath}: ${error.message || String(error)}`);
  }
}

export function serializeWindowState(window) {
  return {
    bounds: window.getNormalBounds(),
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen()
  };
}

export function normalizeWindowState(state, workAreas = []) {
  const savedBounds = isRecord(state?.bounds) ? state.bounds : {};
  const width = normalizeDimension(savedBounds.width, defaultWindowBounds.width, minimumWindowSize.width);
  const height = normalizeDimension(savedBounds.height, defaultWindowBounds.height, minimumWindowSize.height);
  const normalizedState = {
    bounds: { width, height },
    isMaximized: state?.isMaximized === true,
    isFullScreen: state?.isFullScreen === true
  };

  const x = finiteInteger(savedBounds.x);
  const y = finiteInteger(savedBounds.y);
  if (x === null || y === null) return normalizedState;

  const savedWindowBounds = { x, y, width, height };
  const workArea = findVisibleWorkArea(savedWindowBounds, workAreas);
  if (!workArea) return normalizedState;

  normalizedState.bounds = fitBoundsWithinWorkArea(savedWindowBounds, workArea);
  return normalizedState;
}

function getWindowStatePath(app) {
  return join(app.getPath("userData"), windowStateFilename);
}

function normalizeDimension(value, fallback, minimum) {
  const number = finiteInteger(value);
  if (number === null) return fallback;
  return Math.max(number, minimum);
}

function findVisibleWorkArea(bounds, workAreas) {
  let bestArea = null;
  let bestIntersection = 0;

  for (const workArea of workAreas) {
    if (!isUsableWorkArea(workArea)) continue;

    const intersection = intersectionSize(bounds, workArea);
    const visibleWidth = Math.min(minimumVisibleSize, bounds.width);
    const visibleHeight = Math.min(minimumVisibleSize, bounds.height);
    if (intersection.width < visibleWidth || intersection.height < visibleHeight) continue;

    const area = intersection.width * intersection.height;
    if (area > bestIntersection) {
      bestArea = workArea;
      bestIntersection = area;
    }
  }

  return bestArea;
}

function fitBoundsWithinWorkArea(bounds, workArea) {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  return {
    x: clamp(bounds.x, workArea.x, maxX),
    y: clamp(bounds.y, workArea.y, maxY),
    width,
    height
  };
}

function intersectionSize(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function isUsableWorkArea(workArea) {
  return (
    isRecord(workArea) &&
    finiteInteger(workArea.x) !== null &&
    finiteInteger(workArea.y) !== null &&
    finiteInteger(workArea.width) !== null &&
    finiteInteger(workArea.height) !== null &&
    workArea.width > 0 &&
    workArea.height > 0
  );
}

function finiteInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
