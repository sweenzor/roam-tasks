import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWindowState } from "../electron/window-state.mjs";

test("window state falls back to default bounds", () => {
  assert.deepEqual(normalizeWindowState(null), {
    bounds: { width: 960, height: 860 },
    isMaximized: false,
    isFullScreen: false
  });
});

test("window state restores visible bounds and display state", () => {
  assert.deepEqual(
    normalizeWindowState(
      {
        bounds: { x: 40, y: 60, width: 1200, height: 900 },
        isMaximized: true,
        isFullScreen: true
      },
      [{ x: 0, y: 0, width: 1440, height: 1000 }]
    ),
    {
      bounds: { x: 40, y: 60, width: 1200, height: 900 },
      isMaximized: true,
      isFullScreen: true
    }
  );
});

test("window state drops offscreen positions", () => {
  assert.deepEqual(
    normalizeWindowState({ bounds: { x: 1800, y: 1200, width: 960, height: 860 } }, [
      { x: 0, y: 0, width: 1440, height: 1000 }
    ]),
    {
      bounds: { width: 960, height: 860 },
      isMaximized: false,
      isFullScreen: false
    }
  );
});

test("window state keeps restored bounds within the visible work area", () => {
  assert.deepEqual(
    normalizeWindowState({ bounds: { x: 1320, y: 900, width: 960, height: 860 } }, [
      { x: 0, y: 0, width: 1440, height: 1000 }
    ]),
    {
      bounds: { x: 480, y: 140, width: 960, height: 860 },
      isMaximized: false,
      isFullScreen: false
    }
  );
});

test("window state enforces minimum size", () => {
  assert.deepEqual(
    normalizeWindowState({ bounds: { x: 10, y: 20, width: 100, height: 100 } }, [
      { x: 0, y: 0, width: 1440, height: 1000 }
    ]),
    {
      bounds: { x: 10, y: 20, width: 420, height: 640 },
      isMaximized: false,
      isFullScreen: false
    }
  );
});
