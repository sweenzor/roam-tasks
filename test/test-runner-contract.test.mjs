import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipHelpGraphToggle = "SKIP_ROAM_HELP_GRAPH_INTEGRATION";
const ciHelpGraphToggle = ["RUN_ROAM_HELP_GRAPH", "INTEGRATION"].join("_");
const legacyIntegrationToggle = ["RUN_ROAM", "INTEGRATION_TESTS"].join("_");

test("npm test includes the help-graph integration by default", async () => {
  const { scripts } = await readPackageJson();

  assert.match(scripts.test, /\bnode --test\b/);
  assert.match(scripts.test, /test\/\*\.test\.mjs/);
  assert.match(scripts.test, /test\/integration\/\*\.test\.mjs/);
  assert.doesNotMatch(scripts.test, new RegExp(`${skipHelpGraphToggle}=1`));
});

test("dedicated integration script runs only the help-graph test target", async () => {
  const { scripts } = await readPackageJson();

  assert.match(scripts["test:integration"], /node --test test\/integration\/\*\.test\.mjs/);
  assert.doesNotMatch(scripts["test:integration"], new RegExp(`${skipHelpGraphToggle}=1`));
});

test("coverage runner stays on the fast local suite", async () => {
  const { scripts } = await readPackageJson();

  assert.match(scripts["test:coverage"], /--experimental-test-coverage/);
  assert.match(scripts["test:coverage"], /test\/\*\.test\.mjs/);
  assert.doesNotMatch(scripts["test:coverage"], /test\/integration/);
});

test("help-graph integration test uses only the explicit local skip toggle", async () => {
  const integrationTest = await readRepoFile("test/integration/roam-help-graph.test.mjs");

  assert.match(
    integrationTest,
    new RegExp(`process\\.env\\.${skipHelpGraphToggle} === "1"`)
  );
  assert.doesNotMatch(integrationTest, new RegExp(legacyIntegrationToggle));
});

test("GitHub CI does not try to run the local-only Roam integration", async () => {
  const ciWorkflow = await readRepoFile(".github/workflows/ci.yml");

  assert.doesNotMatch(ciWorkflow, /test:integration/);
  assert.doesNotMatch(ciWorkflow, /self-hosted/);
  assert.doesNotMatch(ciWorkflow, /ROAM_LOCAL_API/);
  assert.doesNotMatch(ciWorkflow, new RegExp(ciHelpGraphToggle));
  assert.doesNotMatch(ciWorkflow, new RegExp(legacyIntegrationToggle));
});

async function readPackageJson() {
  return JSON.parse(await readRepoFile("package.json"));
}

async function readRepoFile(filePath) {
  return readFile(path.join(repoRoot, filePath), "utf8");
}
