import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaskCounts,
  isTaskSinceViewMatch
} from "../public/task-view-model.js";

const tasks = [
  task("open-new", { createdDate: "2026-04-10" }),
  task("done-new", { createdDate: "2026-04-11", done: true }),
  task("open-old", { createdDate: "2026-03-15" }),
  task("due-new", { dueDate: "2026-04-12" })
];

test("since count hides completed tasks when the Since toggle is enabled", () => {
  const options = {
    today: "2026-04-12",
    sinceDate: "2026-04-01",
    sinceHideDone: true
  };
  const visible = tasks.filter((candidate) => isTaskSinceViewMatch(candidate, options));
  const counts = getTaskCounts(tasks, options);

  assert.deepEqual(visible.map((candidate) => candidate.uid), ["open-new", "due-new"]);
  assert.equal(counts.since, visible.length);
});

test("since count includes completed tasks when the Since toggle is disabled", () => {
  const options = {
    today: "2026-04-12",
    sinceDate: "2026-04-01",
    sinceHideDone: false
  };
  const visible = tasks.filter((candidate) => isTaskSinceViewMatch(candidate, options));
  const counts = getTaskCounts(tasks, options);

  assert.deepEqual(visible.map((candidate) => candidate.uid), ["open-new", "done-new", "due-new"]);
  assert.equal(counts.since, visible.length);
});

test("since row matching uses the same completed-task toggle as the count", () => {
  const completedSinceTask = tasks.find((candidate) => candidate.uid === "done-new");

  assert.equal(
    isTaskSinceViewMatch(completedSinceTask, {
      sinceDate: "2026-04-01",
      sinceHideDone: true
    }),
    false
  );
  assert.equal(
    isTaskSinceViewMatch(completedSinceTask, {
      sinceDate: "2026-04-01",
      sinceHideDone: false
    }),
    true
  );
});

function task(uid, options = {}) {
  return {
    uid,
    done: false,
    createdDate: null,
    dueDate: null,
    createdTime: 0,
    editedTime: 0,
    ...options
  };
}
