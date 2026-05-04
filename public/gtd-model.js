import { isTaskSince, taskDateIso } from "./task-view-model.js";

export const gtdViewIds = ["inbox", "next", "waiting", "scheduled", "someday", "projects", "review"];

export const gtdStatusLabels = {
  inbox: "Inbox",
  next: "Next",
  waiting: "Waiting",
  scheduled: "Scheduled",
  someday: "Someday"
};

export function effectiveTasks(roamTasks = [], localTasks = [], localState = {}) {
  const byUid = new Map();
  for (const task of [...roamTasks, ...localTasks]) {
    const overlay = localState[task.uid] || {};
    if (overlay.deleted) continue;
    byUid.set(task.uid, applyLocalState(task, overlay));
  }
  return [...byUid.values()];
}

export function applyLocalState(task, overlay = {}) {
  const localText = own(overlay, "text") ? overlay.text : task.text;
  const localDone = own(overlay, "done") ? overlay.done : task.done;
  const localStatus = own(overlay, "status") ? overlay.status : task.status;
  const dueDate = own(overlay, "dueDate") ? overlay.dueDate || null : task.dueDate;
  const project = own(overlay, "project") ? String(overlay.project || "").trim() : inferProject(task);
  const context = own(overlay, "context") ? String(overlay.context || "").trim() : inferContext(task);
  const waitingFor = own(overlay, "waitingFor") ? String(overlay.waitingFor || "").trim() : inferWaitingFor(task);
  const base = {
    ...task,
    text: localText,
    raw: own(overlay, "text") ? localText : task.raw,
    done: Boolean(localDone),
    status: localStatus,
    dueDate,
    completedDate: own(overlay, "completedDate") ? overlay.completedDate : task.completedDate,
    editedTime: own(overlay, "editedTime") ? overlay.editedTime : task.editedTime,
    project,
    context,
    waitingFor
  };
  base.gtdStatus = own(overlay, "gtdStatus") ? overlay.gtdStatus : inferGtdStatus(base);
  return base;
}

export function updateLocalTaskState(previous = {}, changes = {}, { now = Date.now(), today = todayIso() } = {}) {
  const next = { ...previous, ...changes, editedTime: now };

  if (own(changes, "text")) {
    next.text = String(changes.text || "").trim() || "Untitled task";
  }

  if (own(changes, "done")) {
    next.done = Boolean(changes.done);
    next.status = next.done ? "done" : "todo";
    next.completedDate = next.done ? today : null;
  }

  return next;
}

export function removeLocalTaskFromStore({ localTasks = [], localState = {} } = {}, task, { now = Date.now() } = {}) {
  if (task.local) {
    const nextLocalState = { ...localState };
    delete nextLocalState[task.uid];
    return {
      localTasks: localTasks.filter((candidate) => candidate.uid !== task.uid),
      localState: nextLocalState
    };
  }

  return {
    localTasks,
    localState: {
      ...localState,
      [task.uid]: {
        ...(localState[task.uid] || {}),
        deleted: true,
        editedTime: now
      }
    }
  };
}

export function filterGtdTasks(tasks, options = {}) {
  const {
    view = "inbox",
    query = "",
    showCompleted = false,
    sinceDate = "",
    today = todayIso()
  } = options;
  const reviewTasks =
    view === "review"
      ? new Set(
          tasks
            .filter((task) => isReviewTask(task, tasks, { today, includeDone: showCompleted }))
            .map((task) => task.uid)
        )
      : new Set();
  const normalizedQuery = query.trim().toLowerCase();

  return tasks.filter((task) => {
    if (task.done && !(view === "review" && showCompleted)) return false;
    if (view === "inbox" && task.gtdStatus !== "inbox") return false;
    if (view === "next" && task.gtdStatus !== "next") return false;
    if (view === "waiting" && task.gtdStatus !== "waiting") return false;
    if (view === "scheduled" && !isScheduledTask(task)) return false;
    if (view === "someday" && task.gtdStatus !== "someday") return false;
    if (view === "someday" && sinceDate && !isTaskSince(task, sinceDate)) return false;
    if (view === "projects" && !projectName(task)) return false;
    if (view === "review" && !reviewTasks.has(task.uid)) return false;

    if (!normalizedQuery) return true;
    return taskSearchText(task).includes(normalizedQuery);
  });
}

export function getGtdCounts(tasks, { sinceDate = "", today = todayIso() } = {}) {
  const openTasks = tasks.filter((task) => !task.done);
  const projects = new Set(openTasks.map(projectName).filter(Boolean));
  return {
    inbox: openTasks.filter((task) => task.gtdStatus === "inbox").length,
    next: openTasks.filter((task) => task.gtdStatus === "next").length,
    waiting: openTasks.filter((task) => task.gtdStatus === "waiting").length,
    scheduled: openTasks.filter(isScheduledTask).length,
    someday: openTasks.filter((task) => {
      return task.gtdStatus === "someday" && (!sinceDate || isTaskSince(task, sinceDate));
    }).length,
    projects: projects.size,
    review: openTasks.filter((task) => isReviewTask(task, tasks, { today })).length
  };
}

export function bulkChangesFromInput(input = {}) {
  const changes = {};
  const status = String(input.status || "");
  const project = String(input.project || "").trim();
  const context = String(input.context || "").trim();
  const dueDate = String(input.dueDate || "");
  const waitingFor = String(input.waitingFor || "").trim();

  if (status) changes.gtdStatus = status;
  if (project) changes.project = project;
  if (context) changes.context = normalizeContext(context);
  if (dueDate) {
    changes.dueDate = dueDate;
    if (!changes.gtdStatus) changes.gtdStatus = "scheduled";
  }
  if (waitingFor) {
    changes.waitingFor = waitingFor;
    if (!changes.gtdStatus) changes.gtdStatus = "waiting";
  }

  return changes;
}

export function sortTasks(tasks, mode) {
  const copy = [...tasks];
  if (mode === "recent") {
    return copy.sort(compareRecentTasks);
  }
  if (mode === "due") {
    return copy.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  }
  if (mode === "project" || mode === "page") {
    return copy.sort((a, b) => {
      return projectName(a).localeCompare(projectName(b)) || a.text.localeCompare(b.text);
    });
  }
  if (mode === "updated") {
    return copy.sort((a, b) => (b.editedTime || 0) - (a.editedTime || 0));
  }
  return copy.sort(compareRecentTasks);
}

export function compareRecentTasks(a, b) {
  const aDate = taskDateIso(a);
  const bDate = taskDateIso(b);
  if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return (b.editedTime || 0) - (a.editedTime || 0) || a.text.localeCompare(b.text);
}

export function inferGtdStatus(task) {
  if (task.waitingFor) return "waiting";
  if (hasRelation(task, ["waiting", "waiting for"])) return "waiting";
  if (hasRelation(task, ["someday", "maybe", "someday/maybe"])) return "someday";
  if (hasRelation(task, ["next", "next action", "next actions"])) return "next";
  if (task.dueDate || hasRelation(task, ["scheduled", "calendar"])) return "scheduled";
  return "inbox";
}

export function inferProject(task) {
  const pageTitle = cleanRoamInlineText(task.pageTitle || "");
  if (isProjectLikeTitle(pageTitle)) return pageTitle;

  for (const page of task.pages || []) {
    const title = cleanRoamInlineText(page);
    if (isProjectLikeTitle(title)) return title;
  }

  return "";
}

export function inferContext(task) {
  const relations = relationTitles(task);
  const context = relations.find((title) => /^@/.test(title));
  if (context) return context;

  const known = relations.find((title) => {
    return ["calls", "computer", "email", "errands", "home", "office", "online", "work"].includes(
      normalizeRelationTitle(title)
    );
  });
  return known ? normalizeContext(known) : "";
}

export function inferWaitingFor(task) {
  const source = `${task.text || ""} ${(task.details || []).map((detail) => detail.string).join(" ")}`;
  const match = source.match(/waiting(?:\s+for|::)\s+([^#\[\]\n]+)/i);
  return match ? cleanRoamInlineText(match[1]) : "";
}

export function projectName(task) {
  return (task.project || "").trim();
}

export function isProjectLikeTitle(title = "") {
  const normalized = normalizeRelationTitle(title);
  if (!normalized || normalized === "untitled" || normalized === "local gtd") return false;
  if (isDailyNoteTitle(title) || isRoamDateTitle(title)) return false;
  if (
    [
      ...Object.keys(gtdStatusLabels),
      "done",
      "todo",
      "abandoned",
      "p1",
      "p2",
      "p3",
      "maybe",
      "someday/maybe",
      "next action",
      "next actions",
      "waiting for",
      "calendar"
    ].includes(normalized)
  ) {
    return false;
  }
  return true;
}

export function isScheduledTask(task) {
  return task.gtdStatus === "scheduled" || Boolean(task.dueDate);
}

export function isReviewTask(task, tasks, { today = todayIso(), includeDone = false } = {}) {
  if (task.done) return includeDone;
  if (task.gtdStatus === "inbox") return true;
  if (task.gtdStatus === "waiting") return true;
  if (task.dueDate && task.dueDate <= today) return true;

  const project = projectName(task);
  if (!project) return false;
  const projectHasNextAction = tasks.some((candidate) => {
    return !candidate.done && projectName(candidate) === project && candidate.gtdStatus === "next";
  });
  return !projectHasNextAction;
}

export function hasRelation(task, aliases) {
  const wanted = new Set(aliases.map(normalizeRelationTitle));
  return relationTitles(task).some((title) => wanted.has(normalizeRelationTitle(title)));
}

export function relationTitles(task) {
  return [
    task.pageTitle,
    ...(task.pages || []),
    ...(task.tags || []),
    ...(task.breadcrumb || []).map((parent) => cleanRoamInlineText(parent.string))
  ].filter(Boolean);
}

export function normalizeRelationTitle(value = "") {
  return cleanRoamInlineText(value)
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
}

export function normalizeContext(value = "") {
  const context = value.trim();
  if (!context) return "";
  return context.startsWith("@") ? context : `@${context.replace(/^#/, "")}`;
}

export function isRoamDateTitle(value = "") {
  return parseRoamDateTitle(value) !== "";
}

export function isDailyNoteTitle(value = "") {
  return isRoamDateTitle(value) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(value.trim());
}

export function parseRoamDateTitle(value = "") {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?$/i
  );
  return match ? trimmed : "";
}

export function cleanRoamInlineText(value = "") {
  return String(value)
    .replace(/\{\{\s*\[\[(?:TODO|DONE|Abandoned)\]\]\s*\}\}/gi, "")
    .replace(/\{\{\s*(?:TODO|DONE|Abandoned)\s*\}\}/gi, "")
    .replace(/\[([^\]\n]+)\]\(\[\[([^\]\n]+)\]\]\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
    .replace(/#\[\[([^\]\n]+)\]\]/g, "#$1")
    .replace(/\[\[([^\]\n]+)\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function taskSearchText(task) {
  return [
    task.text,
    task.pageTitle,
    task.gtdStatus,
    projectName(task),
    task.context,
    task.waitingFor,
    ...(task.tags || []),
    ...(task.pages || []),
    ...(task.breadcrumb || []).map((parent) => parent.string),
    ...(task.details || []).map((detail) => detail.string)
  ]
    .join(" ")
    .toLowerCase();
}

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
