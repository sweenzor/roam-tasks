import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("quick-add form is visible once a graph is available", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<form id="addForm" class="quick-add">/);
  assert.doesNotMatch(html, /<form id="addForm" class="quick-add hidden">/);
});

test("renderer only requests completed tasks for views that need them", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(script, /function shouldLoadDoneTasks\(\)/);
  assert.match(script, /includeDone: String\(includeDone\)/);
  assert.doesNotMatch(script, /includeDone: "true"/);
});
