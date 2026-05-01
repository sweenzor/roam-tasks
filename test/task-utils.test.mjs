import test from "node:test";
import assert from "node:assert/strict";
import {
  detectTaskStatus,
  ensureTodoString,
  extractBlockRefs,
  extractTags,
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
  const tasks = normalizeTasks([
    ["abc123", "{{[[TODO]]}} Send invoice [[May 1st, 2026]] #admin", "April 30th, 2026", "pageabc12", 1, 2],
    ["older1", "{{[[TODO]]}} Older task", "January 1st, 2025", "pageold12", 1, 2],
    ["gone01", "{{[[Abandoned]]}} Skip this [[Abandoned]] #Abandoned", "Projects", "pagegone1", 1, 3],
    ["def456", "A note mentioning TODO but not a task", "Notes", 1, 2]
  ]);

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].uid, "abc123");
  assert.equal(tasks[0].pageUid, "pageabc12");
  assert.equal(tasks[0].pageUids["April 30th, 2026"], "pageabc12");
  assert.equal(tasks[0].dueDate, "2026-05-01");
  assert.deepEqual(tasks[0].tags, ["admin"]);
  assert.equal(tasks[1].uid, "older1");
  assert.equal(tasks[2].uid, "gone01");
  assert.equal(tasks[2].status, "abandoned");
  assert.equal(tasks[2].done, true);
  assert.deepEqual(tasks[2].pages, []);
  assert.deepEqual(tasks[2].tags, []);
});

test("extracts block refs and Roam hashtag page links", () => {
  assert.deepEqual(extractBlockRefs("Review ((DXWejNn9_)) and ((DXWejNn9_))"), ["DXWejNn9_"]);
  assert.deepEqual(extractTags("Archive #[[Reporting Startup Losses]] #admin"), [
    "Reporting Startup Losses",
    "admin"
  ]);
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
