import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaskCounts,
  isTaskSinceViewMatch,
  timestampIso
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

test("since count can be empty when only completed tasks match and completed tasks are hidden", () => {
  const completedOnlyTasks = [task("done-new", { createdDate: "2026-04-11", done: true })];
  const options = {
    today: "2026-04-12",
    sinceDate: "2026-04-01",
    sinceHideDone: true
  };
  const visible = completedOnlyTasks.filter((candidate) => isTaskSinceViewMatch(candidate, options));
  const counts = getTaskCounts(completedOnlyTasks, options);

  assert.deepEqual(visible, []);
  assert.equal(counts.since, 0);
});

test("since count shows completed-only matches when completed tasks are included", () => {
  const completedOnlyTasks = [task("done-new", { createdDate: "2026-04-11", done: true })];
  const options = {
    today: "2026-04-12",
    sinceDate: "2026-04-01",
    sinceHideDone: false
  };
  const visible = completedOnlyTasks.filter((candidate) => isTaskSinceViewMatch(candidate, options));
  const counts = getTaskCounts(completedOnlyTasks, options);

  assert.deepEqual(visible.map((candidate) => candidate.uid), ["done-new"]);
  assert.equal(counts.since, 1);
});

test("timestamp fallback dates use the local calendar day", () => {
  withTimeZone("America/Los_Angeles", () => {
    const latePacificMay1 = Date.UTC(2026, 4, 2, 6, 30);
    assert.equal(timestampIso(latePacificMay1), "2026-05-01");
  });
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

function withTimeZone(timeZone, callback) {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    callback();
  } finally {
    if (previousTimeZone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimeZone;
    }
  }
}
