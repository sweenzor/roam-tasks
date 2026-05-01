import test from "node:test";
import assert from "node:assert/strict";
import {
  detectTaskStatus,
  ensureTodoString,
  extractBlockRefs,
  extractTags,
  mergePathRelations,
  normalizeTasks,
  parseRoamDate,
  taskStringWithStatus,
  taskStringWithText
} from "../server/task-utils.mjs";

test("detects Roam task markers", () => {
  assert.equal(detectTaskStatus("{{[[TODO]]}} Ship the thing"), "todo");
  assert.equal(detectTaskStatus("{{[[DONE]]}} Ship the thing"), "done");
  assert.equal(detectTaskStatus("{{[[Abandoned]]}} Ship the thing"), "abandoned");
  assert.equal(detectTaskStatus("Ship the thing"), null);
  assert.equal(detectTaskStatus("`{{[[TODO]]}}`"), null);
});

test("updates task status while preserving the body", () => {
  assert.equal(
    taskStringWithStatus("{{[[TODO]]}} Send invoice [[May 1st, 2026]]", true),
    "{{[[DONE]]}} Send invoice [[May 1st, 2026]]"
  );
  assert.equal(
    taskStringWithStatus("{{[[Abandoned]]}} Send invoice [[May 1st, 2026]]", false),
    "{{[[TODO]]}} Send invoice [[May 1st, 2026]]"
  );
  assert.equal(taskStringWithStatus("Send invoice", false), "{{[[TODO]]}} Send invoice");
});

test("updates task text with the current marker", () => {
  assert.equal(taskStringWithText("{{[[DONE]]}} Old", "New copy"), "{{[[DONE]]}} New copy");
  assert.equal(
    taskStringWithText("{{[[Abandoned]]}} Old", "New copy"),
    "{{[[Abandoned]]}} New copy"
  );
  assert.equal(taskStringWithText("{{[[TODO]]}} Old", "New copy", true), "{{[[DONE]]}} New copy");
});

test("normalizes rows into sorted tasks with metadata", () => {
  const createdApr29 = Date.UTC(2026, 3, 29, 12);
  const createdApr30 = Date.UTC(2026, 3, 30, 12);
  const completedMay1 = Date.UTC(2026, 4, 1, 12);
  const tasks = normalizeTasks([
    ["abc123", "{{[[TODO]]}} Send invoice [[May 1st, 2026]] #admin", "April 30th, 2026", "pageabc12", createdApr29, 2],
    ["older1", "{{[[TODO]]}} Older task", "January 1st, 2025", "pageold12", createdApr30, 2],
    ["done01", "{{[[DONE]]}} Finished work", "Projects", "pagedone1", createdApr29, completedMay1],
    ["gone01", "{{[[Abandoned]]}} Skip this [[Abandoned]] #Abandoned", "Projects", "pagegone1", createdApr29, completedMay1],
    ["def456", "A note mentioning TODO but not a task", "Notes", 1, 2]
  ]);

  assert.equal(tasks.length, 4);

  const invoice = tasks.find((task) => task.uid === "abc123");
  assert.equal(invoice.pageUid, "pageabc12");
  assert.equal(invoice.pageUids["April 30th, 2026"], "pageabc12");
  assert.equal(invoice.createdDate, "2026-04-29");
  assert.equal(invoice.dueDate, "2026-05-01");
  assert.deepEqual(invoice.tags, ["admin"]);

  const older = tasks.find((task) => task.uid === "older1");
  assert.equal(older.createdDate, "2026-04-30");
  assert.equal(older.dueDate, null);

  const done = tasks.find((task) => task.uid === "done01");
  assert.equal(done.status, "done");
  assert.equal(done.done, true);
  assert.equal(done.completedDate, "2026-05-01");
  assert.equal(done.abandonedDate, null);

  const abandoned = tasks.find((task) => task.uid === "gone01");
  assert.equal(abandoned.status, "abandoned");
  assert.equal(abandoned.done, true);
  assert.equal(abandoned.completedDate, null);
  assert.equal(abandoned.abandonedDate, "2026-05-01");
  assert.deepEqual(abandoned.pages, []);
  assert.deepEqual(abandoned.tags, []);
});

test("extracts block refs and Roam hashtag page links", () => {
  assert.deepEqual(extractBlockRefs("Review ((DXWejNn9_)) and ((DXWejNn9_))"), ["DXWejNn9_"]);
  assert.deepEqual(extractTags("Archive #[[Reporting Startup Losses]] #admin"), [
    "Reporting Startup Losses",
    "admin"
  ]);
});

test("merges page and tag relations from the parent path", () => {
  const task = normalizeTasks([
    ["abc123", "{{[[TODO]]}} Follow up [[Existing]] #TaskTag", "Projects", "pageabc12", 1, 2]
  ])[0];

  task.breadcrumb = [
    { uid: "parent1", string: "Staff meeting with [[Acme]] #PathTag" },
    {
      uid: "parent2",
      string: "Budget #[[Path Tag Page]] with [[Existing]] {{[[DONE]]}} [[New Page]]"
    }
  ];

  mergePathRelations(task);

  assert.deepEqual(task.pages, ["Existing", "Acme", "Path Tag Page", "New Page"]);
  assert.deepEqual(task.tags, ["TaskTag", "PathTag", "Path Tag Page"]);
});

test("parses common Roam date titles", () => {
  assert.equal(parseRoamDate("May 1st, 2026"), "2026-05-01");
  assert.equal(parseRoamDate("2026-05-01"), "2026-05-01");
  assert.equal(parseRoamDate("05/01/26"), "2026-05-01");
});

test("ensures a task marker exists", () => {
  assert.equal(ensureTodoString("Plan launch"), "{{[[TODO]]}} Plan launch");
  assert.equal(ensureTodoString("{{[[TODO]]}} Plan launch"), "{{[[TODO]]}} Plan launch");
});
