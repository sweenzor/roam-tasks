import test from "node:test";
import assert from "node:assert/strict";
import {
  activeGraphName,
  roamBlockUrl,
  roamPageUrl,
  setRoamLinkTarget
} from "../public/roam-links.js";

test("Roam links resolve selected nicknames to graph names", () => {
  const context = {
    graph: "daily",
    graphs: [{ name: "My Graph", nickname: "daily" }]
  };

  assert.equal(activeGraphName(context.graphs, context.graph), "My Graph");
  assert.equal(
    roamBlockUrl("abc 123", context),
    "roam://#/app/My%20Graph/page/abc%20123"
  );
});

test("Roam page links prefer page uid when available", () => {
  const context = {
    graph: "demo",
    graphs: [{ name: "Graph", nickname: "demo" }]
  };

  assert.equal(roamPageUrl("Project A", "uid-1", context), "roam://#/app/Graph/page/uid-1");
  assert.equal(roamPageUrl("Project A", "", context), "roam://#/app/Graph/page/Project%20A");
});

test("Roam link dataset targets are mutually exclusive", () => {
  const node = { dataset: {} };

  setRoamLinkTarget(node, "Project A", "");
  assert.deepEqual(node.dataset, { roamTitle: "Project A" });

  setRoamLinkTarget(node, "Project A", "uid-1");
  assert.deepEqual(node.dataset, { roamUid: "uid-1" });
});
