import test from "node:test";
import assert from "node:assert/strict";
import {
  degradedLocalStoreInfo,
  localStoreNoticeView,
  normalizeGraphLoadResult
} from "../public/app-view-model.js";

test("graph load result shows setup when no Roam graph is configured", () => {
  assert.deepEqual(normalizeGraphLoadResult({ graphs: [], selectedGraph: null }), {
    graphs: [],
    selectedGraph: null,
    showSetup: true
  });

  assert.deepEqual(
    normalizeGraphLoadResult({
      graphs: [{ name: "demo", nickname: "demo" }],
      selectedGraph: "demo"
    }),
    {
      graphs: [{ name: "demo", nickname: "demo" }],
      selectedGraph: "demo",
      showSetup: false
    }
  );
});

test("local store notice view describes recovery and degraded fallback states", () => {
  assert.deepEqual(
    localStoreNoticeView({
      storePath: "/tmp/gtd-state.json",
      recovery: {
        preservedPath: "/tmp/gtd-state.json.corrupt",
        error: "Unexpected token"
      },
      degraded: null
    }),
    {
      visible: true,
      title: "Local sandbox recovered",
      rows: [
        ["Active store", "/tmp/gtd-state.json"],
        ["Preserved data", "/tmp/gtd-state.json.corrupt"],
        ["Recovery issue", "Unexpected token"]
      ]
    }
  );

  assert.deepEqual(
    localStoreNoticeView({
      storePath: "",
      recovery: null,
      degraded: {
        fallback: "Browser local storage",
        error: "Store unavailable",
        fallbackError: "Quota exceeded"
      }
    }),
    {
      visible: true,
      title: "Local sandbox fallback",
      rows: [
        ["Active store", "Unavailable"],
        ["Fallback", "Browser local storage"],
        ["Persistence issue", "Store unavailable"],
        ["Fallback issue", "Quota exceeded"]
      ]
    }
  );

  assert.deepEqual(localStoreNoticeView({ storePath: "", recovery: null, degraded: null }), {
    visible: false,
    title: "",
    rows: []
  });
});

test("degraded local store info normalizes error objects for rendering", () => {
  const info = degradedLocalStoreInfo(new Error("Disk unavailable"), {
    fallbackError: new Error("Quota exceeded")
  });

  assert.equal(info.error, "Disk unavailable");
  assert.equal(info.fallback, "Browser local storage");
  assert.equal(info.fallbackError, "Quota exceeded");
  assert.match(info.degradedAt, /^\d{4}-\d{2}-\d{2}T/);
});
