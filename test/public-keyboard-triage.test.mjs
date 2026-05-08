import test from "node:test";
import assert from "node:assert/strict";
import {
  isKeyboardShortcutEditableTarget,
  nextKeyboardTaskIndex,
  resolveGtdTriageShortcut,
  shortcutKey,
  taskIdsForKeyboardTriage,
  triageChangesForBucket
} from "../public/keyboard-triage.js";
import { applyLocalState, filterGtdTasks } from "../public/gtd-model.js";

test("GTD triage keyboard prefixes bind view switching and task moves", () => {
  assert.deepEqual(resolveGtdTriageShortcut("g", "i"), { action: "view", bucket: "inbox" });
  assert.deepEqual(resolveGtdTriageShortcut("g", "n"), { action: "view", bucket: "next" });
  assert.deepEqual(resolveGtdTriageShortcut("g", "w"), { action: "view", bucket: "waiting" });
  assert.deepEqual(resolveGtdTriageShortcut("g", "s"), { action: "view", bucket: "scheduled" });
  assert.deepEqual(resolveGtdTriageShortcut("m", "I"), { action: "move", bucket: "inbox" });
  assert.deepEqual(resolveGtdTriageShortcut("m", "N"), { action: "move", bucket: "next" });
  assert.deepEqual(resolveGtdTriageShortcut("m", "W"), { action: "move", bucket: "waiting" });
  assert.deepEqual(resolveGtdTriageShortcut("m", "S"), { action: "move", bucket: "scheduled" });
  assert.equal(resolveGtdTriageShortcut("g", "p"), null);
  assert.equal(resolveGtdTriageShortcut("x", "n"), null);
});

test("GTD triage move changes clear conflicting bucket metadata", () => {
  assert.deepEqual(triageChangesForBucket("inbox"), {
    gtdStatus: "inbox",
    dueDate: null,
    waitingFor: ""
  });
  assert.deepEqual(triageChangesForBucket("next"), {
    gtdStatus: "next",
    dueDate: null,
    waitingFor: ""
  });
  assert.deepEqual(triageChangesForBucket("waiting"), {
    gtdStatus: "waiting",
    dueDate: null
  });
  assert.deepEqual(triageChangesForBucket("scheduled"), {});
  assert.deepEqual(triageChangesForBucket("scheduled", { dueDate: "2026-05-10" }), {
    gtdStatus: "scheduled",
    dueDate: "2026-05-10",
    waitingFor: ""
  });
  assert.deepEqual(triageChangesForBucket("review"), {});
});

test("GTD triage move changes remove tasks from their previous bucket filters", () => {
  const movedToInbox = applyLocalState(
    task("scheduled-inbox", { dueDate: "2026-05-10", gtdStatus: "scheduled" }),
    triageChangesForBucket("inbox")
  );
  assert.equal(movedToInbox.dueDate, null);
  assert.deepEqual(filterGtdTasks([movedToInbox], { view: "scheduled" }).map(uid), []);
  assert.deepEqual(filterGtdTasks([movedToInbox], { view: "inbox" }).map(uid), ["scheduled-inbox"]);

  const movedToNext = applyLocalState(
    task("scheduled", { dueDate: "2026-05-10", gtdStatus: "scheduled" }),
    triageChangesForBucket("next")
  );
  assert.equal(movedToNext.dueDate, null);
  assert.deepEqual(filterGtdTasks([movedToNext], { view: "scheduled" }).map(uid), []);
  assert.deepEqual(filterGtdTasks([movedToNext], { view: "next" }).map(uid), ["scheduled"]);

  const movedToScheduled = applyLocalState(
    task("waiting", { waitingFor: "Dana", gtdStatus: "waiting" }),
    triageChangesForBucket("scheduled", { dueDate: "2026-05-10" })
  );
  assert.equal(movedToScheduled.waitingFor, "");
  assert.equal(movedToScheduled.dueDate, "2026-05-10");
  assert.deepEqual(filterGtdTasks([movedToScheduled], { view: "waiting" }).map(uid), []);
  assert.deepEqual(filterGtdTasks([movedToScheduled], { view: "scheduled" }).map(uid), ["waiting"]);
});

test("GTD triage shortcuts ignore editable targets and reserved modifier chords", () => {
  assert.equal(isKeyboardShortcutEditableTarget({ tagName: "INPUT" }), true);
  assert.equal(isKeyboardShortcutEditableTarget({ tagName: "select" }), true);
  assert.equal(isKeyboardShortcutEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isKeyboardShortcutEditableTarget({ isContentEditable: true, tagName: "DIV" }), true);
  assert.equal(isKeyboardShortcutEditableTarget({ tagName: "ARTICLE" }), false);

  assert.equal(shortcutKey({ key: "N" }), "n");
  assert.equal(shortcutKey({ key: "Escape" }), "escape");
  assert.equal(shortcutKey({ key: "n", metaKey: true }), "");
  assert.equal(shortcutKey({ key: "n", ctrlKey: true }), "");
  assert.equal(shortcutKey({ key: "n", altKey: true }), "");
  assert.equal(shortcutKey({ key: "n", defaultPrevented: true }), "");
});

test("GTD triage targets selected visible tasks before the focused task", () => {
  assert.deepEqual(
    taskIdsForKeyboardTriage({
      selectedTaskIds: new Set(["selected-a", "selected-b"]),
      focusedTaskId: "focused",
      visibleTaskIds: new Set(["selected-a", "selected-b", "focused"])
    }),
    ["selected-a", "selected-b"]
  );
});

test("GTD triage falls back to focused visible tasks and filters stale selections", () => {
  assert.deepEqual(
    taskIdsForKeyboardTriage({
      selectedTaskIds: new Set(["hidden"]),
      focusedTaskId: "focused",
      visibleTaskIds: new Set(["focused"])
    }),
    ["focused"]
  );

  assert.deepEqual(
    taskIdsForKeyboardTriage({
      selectedTaskIds: new Set(["selected", "pending"]),
      focusedTaskId: "focused",
      visibleTaskIds: new Set(["selected", "pending", "focused"]),
      pendingRemovalIds: new Set(["pending"])
    }),
    ["selected"]
  );

  assert.deepEqual(
    taskIdsForKeyboardTriage({
      focusedTaskId: "pending",
      visibleTaskIds: new Set(["pending"]),
      pendingRemovalIds: new Set(["pending"])
    }),
    []
  );
});

test("keyboard task navigation clamps j/k focus movement", () => {
  assert.equal(nextKeyboardTaskIndex(0, -1, 1), -1);
  assert.equal(nextKeyboardTaskIndex(3, -1, 1), 0);
  assert.equal(nextKeyboardTaskIndex(3, -1, -1), 2);
  assert.equal(nextKeyboardTaskIndex(3, 1, 1), 2);
  assert.equal(nextKeyboardTaskIndex(3, 1, -1), 0);
  assert.equal(nextKeyboardTaskIndex(3, 2, 1), 2);
  assert.equal(nextKeyboardTaskIndex(3, 0, -1), 0);
});

function task(uid, options = {}) {
  return {
    uid,
    raw: uid,
    text: uid,
    status: "todo",
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
