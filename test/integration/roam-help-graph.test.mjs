import test from "node:test";
import assert from "node:assert/strict";

const baseUrl = process.env.ROAM_TASKS_BASE_URL || "http://127.0.0.1:5874";
const graph = process.env.ROAM_PUBLIC_HELP_GRAPH || "roam-official-help-graph";

const runIntegration = process.env.RUN_ROAM_INTEGRATION_TESTS === "1";

(runIntegration ? test : test.skip)("health endpoint works with Roam public help graph", async () => {
  const response = await fetch(`${baseUrl}/api/health?graph=${encodeURIComponent(graph)}`);
  const body = await response.json();

  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.graph.nickname, graph);
  assert.ok(body.port > 0);
});
