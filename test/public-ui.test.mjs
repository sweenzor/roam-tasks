import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("quick-add form stays hidden", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /<form id="addForm" class="quick-add hidden">/);
  assert.match(script, /els\.addForm\.classList\.add\("hidden"\)/);
});

test("renderer only requests completed tasks for views that need them", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(script, /function shouldLoadDoneTasks\(\)/);
  assert.match(script, /includeDone: String\(includeDone\)/);
  assert.doesNotMatch(script, /includeDone: "true"/);
});

test("renderer persists lightweight UI state across relaunches", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(script, /view: loadView\(\)/);
  assert.match(script, /query: loadQuery\(\)/);
  assert.match(script, /sort: loadSort\(\)/);
  assert.match(script, /compact: loadCompact\(\)/);
  assert.match(script, /roamTasksCompact/);
  assert.match(script, /roamTasksTaskDraft/);
  assert.match(script, /localStorage\.setItem\(storageKeys\.view, state\.view\)/);
});

test("since view defaults to hiding completed tasks", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(script, /function loadSinceHideDone\(\)/);
  assert.match(script, /return storedValue === null \? true : storedValue === "true"/);
});

test("since empty state reflects the completed-task toggle", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(script, /function emptyViewMessage\(\)/);
  assert.match(script, /No open tasks since this date\./);
  assert.match(script, /No tasks since this date\./);
});
