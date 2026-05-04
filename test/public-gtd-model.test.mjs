import test from "node:test";
import assert from "node:assert/strict";
import {
  bulkChangesFromInput,
  cleanRoamInlineText,
  effectiveTasks,
  filterGtdTasks,
  getGtdCounts,
  inferContext,
  inferGtdStatus,
  inferProject,
  inferWaitingFor,
  isDailyNoteTitle,
  isProjectLikeTitle,
  isRoamDateTitle,
  removeLocalTaskFromStore,
  sortTasks,
  updateLocalTaskState
} from "../public/gtd-model.js";

test("effective GTD tasks merge local overlays, inferred fields, and local replacements", () => {
  const tasks = effectiveTasks(
    [
      task("roam-next", {
        text: "{{[[TODO]]}} Call [[Acme]]",
        pageTitle: "Project Alpha",
        pages: ["Next Actions", "@calls"]
      }),
      task("roam-deleted", { pages: ["Someday"] }),
      task("same", { text: "Roam copy", pageTitle: "Project Old" })
    ],
    [task("same", { text: "Local replacement", pageTitle: "Project Local", local: true })],
    {
      "roam-next": { context: "laptop", dueDate: "2026-05-10" },
      "roam-deleted": { deleted: true }
    }
  );

  assert.deepEqual(tasks.map((candidate) => candidate.uid), ["roam-next", "same"]);
  assert.equal(tasks[0].project, "Project Alpha");
  assert.equal(tasks[0].context, "laptop");
  assert.equal(tasks[0].dueDate, "2026-05-10");
  assert.equal(tasks[0].gtdStatus, "next");
  assert.equal(tasks[1].text, "Local replacement");
  assert.equal(tasks[1].project, "Project Local");
});

test("local GTD updates normalize edits and done transitions", () => {
  const done = updateLocalTaskState(
    { gtdStatus: "next" },
    { text: "   ", done: true },
    { now: 1000, today: "2026-05-04" }
  );

  assert.equal(done.text, "Untitled task");
  assert.equal(done.done, true);
  assert.equal(done.status, "done");
  assert.equal(done.completedDate, "2026-05-04");
  assert.equal(done.editedTime, 1000);

  const open = updateLocalTaskState(done, { done: false }, { now: 2000, today: "2026-05-04" });
  assert.equal(open.done, false);
  assert.equal(open.status, "todo");
  assert.equal(open.completedDate, null);
  assert.equal(open.editedTime, 2000);
});

test("local removal deletes local-only tasks and overlays Roam tasks", () => {
  const localStore = removeLocalTaskFromStore(
    {
      localTasks: [task("local-1", { local: true })],
      localState: { "local-1": { gtdStatus: "inbox" }, "roam-1": { gtdStatus: "next" } }
    },
    task("local-1", { local: true }),
    { now: 5000 }
  );

  assert.deepEqual(localStore.localTasks, []);
  assert.deepEqual(localStore.localState, { "roam-1": { gtdStatus: "next" } });

  const roamStore = removeLocalTaskFromStore(
    {
      localTasks: [task("local-2", { local: true })],
      localState: { "roam-2": { project: "Alpha" } }
    },
    task("roam-2"),
    { now: 6000 }
  );

  assert.deepEqual(roamStore.localTasks.map((candidate) => candidate.uid), ["local-2"]);
  assert.deepEqual(roamStore.localState["roam-2"], {
    project: "Alpha",
    deleted: true,
    editedTime: 6000
  });
});

test("bulk edits derive GTD status from the entered categorization", () => {
  assert.deepEqual(
    bulkChangesFromInput({ project: " Alpha ", context: "email", dueDate: "2026-05-10" }),
    {
      project: "Alpha",
      context: "@email",
      dueDate: "2026-05-10",
      gtdStatus: "scheduled"
    }
  );
  assert.deepEqual(bulkChangesFromInput({ waitingFor: "Dana" }), {
    waitingFor: "Dana",
    gtdStatus: "waiting"
  });
  assert.deepEqual(bulkChangesFromInput({ status: "next", waitingFor: "Dana", dueDate: "2026-05-10" }), {
    gtdStatus: "next",
    dueDate: "2026-05-10",
    waitingFor: "Dana"
  });
});

test("GTD filters handle Review, Someday since dates, completed tasks, and query text", () => {
  const tasks = [
    task("inbox", { gtdStatus: "inbox", text: "Loose capture" }),
    task("next-a", {
      gtdStatus: "next",
      text: "Send proposal",
      project: "Alpha",
      context: "@computer",
      breadcrumb: [{ string: "Work" }]
    }),
    task("waiting", { gtdStatus: "waiting", project: "Beta", waitingFor: "Jordan" }),
    task("due", { gtdStatus: "scheduled", project: "Gamma", dueDate: "2026-05-04" }),
    task("someday-old", { gtdStatus: "someday", createdDate: "2026-03-01" }),
    task("someday-new", { gtdStatus: "someday", createdDate: "2026-05-01" }),
    task("project-stuck", { gtdStatus: "scheduled", project: "Delta", dueDate: "2026-06-01" }),
    task("done-next", { gtdStatus: "next", project: "Alpha", done: true })
  ];

  assert.deepEqual(filterGtdTasks(tasks, { view: "next", showCompleted: true }).map(uid), ["next-a"]);
  assert.deepEqual(filterGtdTasks(tasks, { view: "review", today: "2026-05-04" }).map(uid), [
    "inbox",
    "waiting",
    "due",
    "project-stuck"
  ]);
  assert.deepEqual(
    filterGtdTasks(tasks, { view: "review", showCompleted: true, today: "2026-05-04" }).map(uid),
    ["inbox", "waiting", "due", "project-stuck", "done-next"]
  );
  assert.deepEqual(filterGtdTasks(tasks, { view: "someday" }).map(uid), ["someday-old", "someday-new"]);
  assert.deepEqual(filterGtdTasks(tasks, { view: "someday", sinceDate: "2026-04-01" }).map(uid), ["someday-new"]);
  assert.deepEqual(filterGtdTasks(tasks, { view: "projects", query: "computer" }).map(uid), ["next-a"]);
});

test("GTD counts share the same open-task rules as the tab filters", () => {
  const tasks = [
    task("inbox", { gtdStatus: "inbox" }),
    task("next-a", { gtdStatus: "next", project: "Alpha" }),
    task("waiting", { gtdStatus: "waiting", project: "Beta" }),
    task("due", { gtdStatus: "scheduled", project: "Gamma", dueDate: "2026-05-04" }),
    task("someday-old", { gtdStatus: "someday", createdDate: "2026-03-01" }),
    task("someday-new", { gtdStatus: "someday", createdDate: "2026-05-01" }),
    task("project-stuck", { gtdStatus: "scheduled", project: "Delta", dueDate: "2026-06-01" }),
    task("done-next", { gtdStatus: "next", project: "Alpha", done: true })
  ];

  assert.deepEqual(getGtdCounts(tasks, { today: "2026-05-04", sinceDate: "2026-04-01" }), {
    inbox: 1,
    next: 1,
    waiting: 1,
    scheduled: 2,
    someday: 1,
    projects: 4,
    review: 4
  });
});

test("GTD sorting supports recent, due, project, updated, and page alias modes", () => {
  const tasks = [
    task("beta", { text: "Beta", project: "Beta", createdDate: "2026-04-01", dueDate: "2026-05-10", editedTime: 2 }),
    task("alpha", { text: "Alpha", project: "Alpha", createdDate: "2026-05-01", dueDate: "2026-05-08", editedTime: 1 }),
    task("none", { text: "None", createdDate: null, dueDate: null, editedTime: 3 })
  ];

  assert.deepEqual(sortTasks(tasks, "recent").map(uid), ["alpha", "beta", "none"]);
  assert.deepEqual(sortTasks(tasks, "due").map(uid), ["alpha", "beta", "none"]);
  assert.deepEqual(sortTasks(tasks, "project").map(uid), ["none", "alpha", "beta"]);
  assert.deepEqual(sortTasks(tasks, "page").map(uid), ["none", "alpha", "beta"]);
  assert.deepEqual(sortTasks(tasks, "updated").map(uid), ["none", "beta", "alpha"]);
  assert.deepEqual(sortTasks(tasks, "unknown").map(uid), ["alpha", "beta", "none"]);
});

test("GTD inference cleans Roam text and avoids treating GTD buckets as projects", () => {
  assert.equal(cleanRoamInlineText("{{[[TODO]]}} - #[[Next Actions]] **Call** [Dana]([[People]])"), "#Next Actions Call Dana");
  assert.equal(isRoamDateTitle("2026-05-04"), true);
  assert.equal(isDailyNoteTitle("5-4-2026"), true);
  assert.equal(isProjectLikeTitle("Someday/Maybe"), false);
  assert.equal(
    inferProject(task("infer-project", { pageTitle: "May 4th, 2026", pages: ["Next Actions", "Project Orion"] })),
    "Project Orion"
  );
  assert.equal(inferProject(task("no-project", { pageTitle: "Inbox", pages: ["Someday/Maybe"] })), "");
  assert.equal(inferContext(task("infer-context", { tags: ["Email"] })), "@Email");
  assert.equal(inferWaitingFor(task("infer-waiting", { text: "Waiting:: Dana #waiting" })), "Dana");
  assert.equal(inferGtdStatus(task("infer-status", { pages: ["Someday/Maybe"] })), "someday");
});

function task(uid, options = {}) {
  const text = options.text || uid;
  return {
    uid,
    raw: text,
    text,
    status: options.done ? "done" : "todo",
    done: false,
    local: false,
    pageTitle: "Inbox",
    pageUid: null,
    pageUids: {},
    pages: [],
    tags: [],
    blockRefs: [],
    blockStrings: {},
    breadcrumb: [],
    details: [],
    createdDate: null,
    completedDate: null,
    abandonedDate: null,
    dueDate: null,
    priority: null,
    createdTime: 0,
    editedTime: 0,
    project: "",
    context: "",
    waitingFor: "",
    gtdStatus: "inbox",
    ...options
  };
}

function uid(task) {
  return task.uid;
}
