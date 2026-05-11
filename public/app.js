import {
  bulkChangesFromInput,
  cleanRoamInlineText,
  effectiveTasks as deriveEffectiveTasks,
  filterGtdTasks,
  getGtdCounts,
  gtdViewIds,
  gtdStatusLabels,
  isDailyNoteTitle,
  isRoamDateTitle,
  projectName,
  removeLocalTaskFromStore,
  sortTasks,
  updateLocalTaskState
} from "./gtd-model.js";
import {
  gtdTriageBucketKeys,
  gtdTriageShortcutPrefixes,
  gtdTriageViewKeys,
  isKeyboardShortcutEditableTarget,
  nextKeyboardTaskIndex,
  resolveGtdTriageShortcut,
  resolveKeyboardSelectionShortcut,
  shortcutKey,
  taskIdsForKeyboardTriage,
  triageChangesForBucket
} from "./keyboard-triage.js";
import { createLocalStoreSaveQueue } from "./local-store-save-queue.js";
import { timestampIso } from "./task-view-model.js";
import { loadStoredUiState, storageKeys } from "./ui-storage.js";

const storedUiState = loadStoredUiState();

const state = {
  graphs: [],
  graph: null,
  compact: storedUiState.compact,
  roamTasks: [],
  localTasks: [],
  localState: {},
  tasks: [],
  view: storedUiState.view,
  query: storedUiState.query,
  sort: storedUiState.sort,
  sinceDate: storedUiState.sinceDate,
  showCompleted: storedUiState.showCompleted,
  includeDoneLoaded: false,
  loading: false,
  localStoreInfo: { storePath: "", recovery: null },
  pendingRemovals: new Map(),
  selectedTaskIds: new Set(),
  visibleTaskIds: new Set(),
  dragTaskIds: [],
  dragBadge: null,
  taskDragPointer: null,
  suppressNextTaskClick: false
};

let keyboardShortcutPrefix = "";
let keyboardShortcutPrefixTimer = null;
let keyboardShortcutHintTimer = null;
let keyboardShortcutHintFadeTimer = null;
let keyboardScheduleTaskIds = [];
const keyboardShortcutPrefixTimeoutMs = 1200;
const keyboardShortcutHintVisibleMs = 6000;
const keyboardShortcutHintFadeMs = 700;

const els = {
  setupPanel: document.querySelector("#setupPanel"),
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  pageInput: document.querySelector("#pageInput"),
  toolActions: document.querySelector(".tool-actions"),
  searchInput: document.querySelector("#searchInput"),
  sinceInput: document.querySelector("#sinceInput"),
  completedFilter: document.querySelector("#completedFilter"),
  showCompletedToggle: document.querySelector("#showCompletedToggle"),
  compactToggle: document.querySelector("#compactToggle"),
  sortSelect: document.querySelector("#sortSelect"),
  bulkBar: document.querySelector("#bulkBar"),
  selectVisibleButton: document.querySelector("#selectVisibleButton"),
  bulkCount: document.querySelector("#bulkCount"),
  bulkStatusInput: document.querySelector("#bulkStatusInput"),
  bulkProjectInput: document.querySelector("#bulkProjectInput"),
  bulkContextInput: document.querySelector("#bulkContextInput"),
  bulkDateInput: document.querySelector("#bulkDateInput"),
  bulkWaitingInput: document.querySelector("#bulkWaitingInput"),
  bulkApplyButton: document.querySelector("#bulkApplyButton"),
  bulkClearButton: document.querySelector("#bulkClearButton"),
  localStoreNotice: document.querySelector("#localStoreNotice"),
  localStoreNoticeBody: document.querySelector("#localStoreNoticeBody"),
  refreshButton: document.querySelector("#refreshButton"),
  taskList: document.querySelector("#taskList"),
  taskTemplate: document.querySelector("#taskTemplate"),
  shortcutHint: document.querySelector("#shortcutHint"),
  viewTitle: document.querySelector("#viewTitle"),
  counts: {
    inbox: document.querySelector("#countInbox"),
    next: document.querySelector("#countNext"),
    waiting: document.querySelector("#countWaiting"),
    scheduled: document.querySelector("#countScheduled"),
    someday: document.querySelector("#countSomeday"),
    projects: document.querySelector("#countProjects"),
    review: document.querySelector("#countReview")
  }
};

const taskDragMimeType = "application/x-roam-task-ids";

state.tasks = effectiveTasks();

boot();

async function boot() {
  bindEvents();
  await loadLocalStore();
  await loadGraphs();
  render();
  if (state.graph) refreshTasks();
}

function bindEvents() {
  document.querySelectorAll(".view-button").forEach((button) => {
    button.addEventListener("click", async () => {
      await changeView(button.dataset.view);
    });
    bindViewDropTarget(button);
  });

  els.sortSelect.value = state.sort;
  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    localStorage.setItem(storageKeys.sort, state.sort);
    render();
  });

  els.searchInput.value = state.query;
  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    localStorage.setItem(storageKeys.query, state.query);
    render();
  });

  els.sinceInput.value = state.sinceDate;
  els.sinceInput.addEventListener("change", () => {
    state.sinceDate = els.sinceInput.value;
    els.sinceInput.value = state.sinceDate;
    if (state.sinceDate) {
      localStorage.setItem(storageKeys.sinceDate, state.sinceDate);
    } else {
      localStorage.removeItem(storageKeys.sinceDate);
    }
    render();
  });

  els.showCompletedToggle.checked = state.showCompleted;
  els.showCompletedToggle.addEventListener("change", async () => {
    state.showCompleted = els.showCompletedToggle.checked;
    localStorage.setItem(storageKeys.showCompleted, state.showCompleted ? "true" : "false");
    if (shouldLoadDoneTasks() && !state.includeDoneLoaded) {
      await refreshTasks();
      return;
    }
    render();
  });

  els.compactToggle.checked = state.compact;
  els.compactToggle.addEventListener("change", () => {
    state.compact = els.compactToggle.checked;
    localStorage.setItem(storageKeys.compact, state.compact ? "true" : "false");
    render();
  });

  els.refreshButton.addEventListener("click", refreshTasks);

  els.selectVisibleButton.addEventListener("click", () => {
    toggleVisibleSelection(!areAllVisibleTasksSelected());
  });

  els.bulkApplyButton.addEventListener("click", applyBulkChanges);
  els.bulkClearButton.addEventListener("click", () => {
    clearKeyboardScheduleTriage();
    clearSelection();
    render();
  });
  for (const control of bulkControls()) {
    control.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && clearSelectionByKeyboard()) {
        event.preventDefault();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyBulkChanges();
    });
  }

  els.taskInput.value = localStorage.getItem(storageKeys.taskDraft) || "";
  els.taskInput.addEventListener("input", () => {
    localStorage.setItem(storageKeys.taskDraft, els.taskInput.value);
  });

  els.pageInput.value = localStorage.getItem(storageKeys.pageDraft) || "";
  els.pageInput.addEventListener("input", () => {
    localStorage.setItem(storageKeys.pageDraft, els.pageInput.value);
  });

  els.taskList.addEventListener("click", async (event) => {
    const link = event.target.closest("a[data-roam-title], a[data-roam-uid]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    await openRoamTarget({
      title: link.dataset.roamTitle,
      uid: link.dataset.roamUid,
      fallbackHref: link.href
    });
  });

  els.addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = els.taskInput.value.trim();
    if (!text) return;

    createLocalTask(text, els.pageInput.value.trim());

    els.taskInput.value = "";
    localStorage.removeItem(storageKeys.taskDraft);
    render();
  });

  window.addEventListener("keydown", handleGlobalKeydown);

  document.addEventListener("pointermove", moveTaskPointer);
  document.addEventListener("pointerup", endTaskPointer);
  document.addEventListener("pointercancel", cancelTaskPointer);
}

function handleGlobalKeydown(event) {
  if (handleGtdTriageShortcut(event)) return;
  if (handleTaskListKeyboardShortcut(event)) return;

  if (event.key === "/" && document.activeElement === document.body) {
    event.preventDefault();
    els.searchInput.focus();
  }
}

function handleGtdTriageShortcut(event) {
  if (isKeyboardShortcutEditableTarget(event.target)) return false;

  const key = shortcutKey(event);
  if (key === "escape" && !els.shortcutHint.classList.contains("hidden")) {
    event.preventDefault();
    clearKeyboardShortcutPrefix();
    hideKeyboardShortcutHint();
    return true;
  }
  if (!key) {
    clearKeyboardShortcutPrefix();
    return false;
  }

  if (keyboardShortcutPrefix) {
    const prefix = keyboardShortcutPrefix;
    clearKeyboardShortcutPrefix();
    const shortcut = resolveGtdTriageShortcut(prefix, key);
    if (!shortcut) {
      if (gtdTriageShortcutPrefixes[key]) {
        event.preventDefault();
        startKeyboardShortcutPrefix(key);
        return true;
      }
      event.preventDefault();
      return true;
    }

    event.preventDefault();
    hideKeyboardShortcutHint();
    if (shortcut.action === "view") {
      void changeView(shortcut.bucket);
      return true;
    }
    moveKeyboardTriageTasks(shortcut.bucket);
    return true;
  }

  if (!gtdTriageShortcutPrefixes[key]) return false;

  event.preventDefault();
  startKeyboardShortcutPrefix(key);
  return true;
}

function handleTaskListKeyboardShortcut(event) {
  if (isKeyboardShortcutEditableTarget(event.target)) return false;

  const key = shortcutKey(event);
  if (key === "j" || key === "k") {
    event.preventDefault();
    return focusTaskByKeyboard(key === "j" ? 1 : -1);
  }
  const selectionShortcut = resolveKeyboardSelectionShortcut(key);
  if (selectionShortcut === "select-visible") {
    const selected = selectVisibleTasksByKeyboard();
    if (selected) event.preventDefault();
    return selected;
  }
  if (selectionShortcut === "clear") {
    const cleared = clearSelectionByKeyboard();
    if (cleared) event.preventDefault();
    return cleared;
  }
  if (key !== "x") return false;

  const selected = toggleFocusedTaskSelection();
  if (selected) event.preventDefault();
  return selected;
}

function focusTaskByKeyboard(direction) {
  const rows = keyboardTaskRows();
  if (!rows.length) return false;

  const activeRow = document.activeElement?.closest?.(".task-row");
  const currentIndex = rows.indexOf(activeRow);
  const nextIndex = nextKeyboardTaskIndex(rows.length, currentIndex, direction);
  const nextRow = rows[nextIndex];
  if (!nextRow) return false;

  nextRow.focus();
  return true;
}

function toggleFocusedTaskSelection() {
  const row = document.activeElement?.closest?.(".task-row");
  const uid = row?.dataset.taskUid || "";
  if (!uid || isPendingRemoval(uid) || !state.visibleTaskIds.has(uid)) return false;

  clearKeyboardScheduleTriage();
  toggleTaskSelected(uid);
  render();
  focusTaskRow(uid);
  return true;
}

function focusTaskRow(uid) {
  const row = keyboardTaskRows({ includePending: true }).find((candidate) => candidate.dataset.taskUid === uid);
  row?.focus();
}

function selectVisibleTasksByKeyboard() {
  if (!state.visibleTaskIds.size) return false;

  clearKeyboardScheduleTriage();
  toggleVisibleSelection(true);
  return true;
}

function clearSelectionByKeyboard() {
  if (!state.selectedTaskIds.size && !keyboardScheduleTaskIds.length) return false;

  clearKeyboardScheduleTriage();
  clearSelection();
  resetBulkInputs();
  render();
  return true;
}

function keyboardTaskRows({ includePending = false } = {}) {
  const rows = [...els.taskList.querySelectorAll(".task-row")];
  if (includePending) return rows;
  return rows.filter((row) => !row.classList.contains("pending-removal"));
}

function startKeyboardShortcutPrefix(prefix) {
  clearKeyboardShortcutPrefix();
  keyboardShortcutPrefix = prefix;
  keyboardShortcutPrefixTimer = window.setTimeout(clearKeyboardShortcutPrefix, keyboardShortcutPrefixTimeoutMs);
  renderKeyboardShortcutHint(prefix);
}

function clearKeyboardShortcutPrefix() {
  keyboardShortcutPrefix = "";
  if (keyboardShortcutPrefixTimer) {
    window.clearTimeout(keyboardShortcutPrefixTimer);
    keyboardShortcutPrefixTimer = null;
  }
}

function renderKeyboardShortcutHint(prefix) {
  const action = gtdTriageShortcutPrefixes[prefix];
  if (!action) {
    hideKeyboardShortcutHint();
    return;
  }

  clearKeyboardShortcutHintTimers();

  const label = document.createElement("span");
  label.className = "shortcut-hint-label";
  label.textContent = action === "view" ? "Go to" : "Move to";

  const options = document.createElement("span");
  options.className = "shortcut-hint-options";
  const shortcutKeys = action === "view" ? gtdTriageViewKeys : gtdTriageBucketKeys;
  for (const [key, bucket] of Object.entries(shortcutKeys)) {
    const item = document.createElement("span");
    item.className = "shortcut-hint-option";
    const keyNode = document.createElement("kbd");
    keyNode.textContent = key.toUpperCase();
    const text = document.createElement("span");
    text.textContent = shortcutLabel(bucket);
    item.append(keyNode, text);
    options.append(item);
  }

  els.shortcutHint.replaceChildren(label, options);
  els.shortcutHint.classList.remove("hidden", "fading");
  scheduleKeyboardShortcutHintFade();
}

function shortcutLabel(bucket) {
  return gtdStatusLabels[bucket] || viewTitles[bucket] || bucket;
}

function scheduleKeyboardShortcutHintFade() {
  keyboardShortcutHintTimer = window.setTimeout(() => {
    keyboardShortcutHintTimer = null;
    els.shortcutHint.classList.add("fading");
    keyboardShortcutHintFadeTimer = window.setTimeout(hideKeyboardShortcutHint, keyboardShortcutHintFadeMs);
  }, keyboardShortcutHintVisibleMs);
}

function hideKeyboardShortcutHint() {
  clearKeyboardShortcutHintTimers();
  els.shortcutHint.classList.add("hidden");
  els.shortcutHint.classList.remove("fading");
  els.shortcutHint.replaceChildren();
}

function clearKeyboardShortcutHintTimers() {
  if (keyboardShortcutHintTimer) {
    window.clearTimeout(keyboardShortcutHintTimer);
    keyboardShortcutHintTimer = null;
  }
  if (keyboardShortcutHintFadeTimer) {
    window.clearTimeout(keyboardShortcutHintFadeTimer);
    keyboardShortcutHintFadeTimer = null;
  }
}

async function changeView(nextView) {
  if (!gtdViewIds.includes(nextView)) return;
  if (nextView !== state.view) commitPendingRemovalsForView(state.view);
  state.view = nextView;
  localStorage.setItem(storageKeys.view, state.view);
  if (shouldLoadDoneTasks() && !state.includeDoneLoaded) {
    await refreshTasks();
    return;
  }
  render();
}

function moveKeyboardTriageTasks(bucket) {
  const taskIds = taskIdsForKeyboardTriage({
    selectedTaskIds: state.selectedTaskIds,
    focusedTaskId: focusedTaskId(),
    visibleTaskIds: state.visibleTaskIds,
    pendingRemovalIds: state.pendingRemovals.keys()
  });
  if (!taskIds.length) return false;
  if (bucket === "scheduled") return startKeyboardScheduleTriage(taskIds);

  const changes = triageChangesForBucket(bucket);

  if (!Object.keys(changes).length) return false;

  clearKeyboardScheduleTriage();
  for (const uid of taskIds) {
    const task = state.tasks.find((candidate) => candidate.uid === uid);
    if (task) updateLocalTask(task, changes);
  }

  clearSelection();
  render();
  return true;
}

function startKeyboardScheduleTriage(taskIds) {
  clearSelection();
  for (const uid of taskIds) setTaskSelected(uid, true);
  keyboardScheduleTaskIds = [...taskIds];
  render();
  els.bulkStatusInput.value = "scheduled";
  els.bulkDateInput.value = "";
  els.bulkDateInput.focus();
  return true;
}

function applyKeyboardScheduleDate() {
  const changes = triageChangesForBucket("scheduled", { dueDate: els.bulkDateInput.value });
  if (!Object.keys(changes).length) {
    els.bulkDateInput.focus();
    return false;
  }

  const taskIds = taskIdsForKeyboardTriage({
    selectedTaskIds: new Set(keyboardScheduleTaskIds),
    visibleTaskIds: state.visibleTaskIds,
    pendingRemovalIds: state.pendingRemovals.keys()
  });
  if (!taskIds.length) return false;

  for (const uid of taskIds) {
    const task = state.tasks.find((candidate) => candidate.uid === uid);
    if (task) updateLocalTask(task, changes);
  }

  clearKeyboardScheduleTriage();
  clearSelection();
  resetBulkInputs();
  render();
  return true;
}

function clearKeyboardScheduleTriage() {
  keyboardScheduleTaskIds = [];
}

function focusedTaskId() {
  return document.activeElement?.closest?.(".task-row")?.dataset.taskUid || "";
}

async function loadGraphs() {
  setStatus("Loading", true);
  try {
    const data = await api("/api/graphs");
    state.graphs = data.graphs || [];
    state.graph = data.selectedGraph;

    els.setupPanel.classList.add("hidden");
    setStatus();
  } catch (error) {
    els.setupPanel.classList.add("hidden");
    setStatus(error.message, false, true);
  }
}

async function refreshTasks(options = {}) {
  if (!state.graph) {
    state.tasks = effectiveTasks();
    render();
    return;
  }
  const includeDone = options.includeDone ?? shouldLoadDoneTasks();
  setStatus("Refreshing", true);
  try {
    const params = new URLSearchParams({
      graph: state.graph,
      includeDone: String(includeDone)
    });
    const data = await api(`/api/tasks?${params}`, { timeoutMs: 5000 });
    state.roamTasks = data.tasks || [];
    state.tasks = effectiveTasks();
    state.includeDoneLoaded = includeDone;
    setStatus();
  } catch (error) {
    setStatus(`${error.message}; local sandbox is still available`, false, true);
  }
  render();
}

function render() {
  els.addForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = false;
    control.title = "";
  });

  for (const button of document.querySelectorAll(".view-button")) {
    button.classList.toggle("active", button.dataset.view === state.view);
  }

  const counts = getGtdCounts(state.tasks, { sinceDate: state.sinceDate, today: todayIso() });
  els.counts.inbox.textContent = counts.inbox;
  els.counts.next.textContent = counts.next;
  els.counts.waiting.textContent = counts.waiting;
  els.counts.scheduled.textContent = counts.scheduled;
  els.counts.someday.textContent = counts.someday;
  els.counts.projects.textContent = counts.projects;
  els.counts.review.textContent = counts.review;

  const visible = sortTasks(
    filterGtdTasks(state.tasks, {
      view: state.view,
      query: state.query,
      showCompleted: state.showCompleted,
      sinceDate: state.sinceDate,
      today: todayIso()
    }),
    state.sort
  );
  syncSelectionToVisibleTasks(visible);
  renderBulkBar(visible);
  els.viewTitle.textContent = viewTitle();
  els.toolActions.classList.toggle("since-active", showsSomedaySinceFilter());
  els.toolActions.classList.toggle("completed-active", showsReviewCompletedFilter());
  els.sinceInput.classList.toggle("hidden", !showsSomedaySinceFilter());
  els.completedFilter.classList.toggle("hidden", !showsReviewCompletedFilter());
  els.showCompletedToggle.checked = state.showCompleted;
  els.compactToggle.checked = state.compact;
  els.taskList.classList.toggle("compact", state.compact);
  renderLocalStoreNotice();
  els.taskList.innerHTML = "";

  if (!visible.length) {
    renderEmpty(emptyViewMessage());
    return;
  }

  renderTaskList(visible);
}

function viewTitle() {
  if (showsSomedaySinceFilter() && hasSomedaySinceDate()) {
    return `${viewTitles.someday} since ${formatDue(state.sinceDate)}`;
  }
  return viewTitles[state.view] || "Tasks";
}

function emptyViewMessage() {
  if (showsSomedaySinceFilter() && hasSomedaySinceDate()) {
    return `No someday tasks since ${formatDue(state.sinceDate)}.`;
  }
  if (showsSomedaySinceFilter()) return "No someday tasks.";
  return state.tasks.length ? "No tasks in this view." : "Capture a task to start.";
}

function showsSomedaySinceFilter() {
  return state.view === "someday";
}

function hasSomedaySinceDate() {
  return Boolean(state.sinceDate);
}

function showsReviewCompletedFilter() {
  return state.view === "review";
}

function renderBulkBar(visibleTasks) {
  state.visibleTaskIds = new Set(visibleTasks.map((task) => task.uid));
  const selectedCount = state.selectedTaskIds.size;
  const visibleCount = visibleTasks.length;
  const selectedVisibleCount = visibleTasks.filter((task) => state.selectedTaskIds.has(task.uid)).length;
  const disabled = selectedCount === 0;

  els.bulkBar.classList.toggle("hidden", visibleCount === 0);
  els.bulkCount.textContent = selectedCount === 1 ? "1 selected" : `${selectedCount} selected`;
  els.selectVisibleButton.disabled = visibleCount === 0;
  els.selectVisibleButton.textContent =
    visibleCount > 0 && selectedVisibleCount === visibleCount ? "Clear visible" : "Select visible";

  for (const control of bulkControls()) {
    control.disabled = disabled;
  }
  els.bulkApplyButton.disabled = disabled;
  els.bulkClearButton.disabled = disabled;
}

function renderTaskList(tasks) {
  if (state.view !== "projects") {
    for (const task of tasks) els.taskList.append(renderTask(task));
    return;
  }

  const groups = new Map();
  for (const task of tasks) {
    const name = projectName(task) || "No project";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(task);
  }

  for (const [name, items] of groups) {
    const heading = document.createElement("div");
    heading.className = "group-heading";
    const label = document.createElement("span");
    label.textContent = name;
    const count = document.createElement("strong");
    count.textContent = String(items.length);
    heading.append(label, count);
    els.taskList.append(heading);
    for (const task of items) els.taskList.append(renderTask(task));
  }
}

function renderTask(task) {
  const pendingRemoval = isPendingRemoval(task.uid);
  const node = els.taskTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.taskUid = task.uid;
  node.draggable = !pendingRemoval;
  node.classList.toggle("done", task.done);
  node.classList.toggle("completed", task.status === "done");
  node.classList.toggle("abandoned", task.status === "abandoned");
  node.classList.toggle("pending-removal", pendingRemoval);
  node.classList.toggle("selected", state.selectedTaskIds.has(task.uid));
  node.setAttribute("aria-selected", state.selectedTaskIds.has(task.uid) ? "true" : "false");
  node.title = pendingRemoval
    ? "Pending removal"
    : state.selectedTaskIds.has(task.uid)
      ? "Drag selected tasks to a bucket or click to deselect task"
      : "Drag to a bucket or click to select task";
  node.addEventListener("dragstart", (event) => {
    if (pendingRemoval) {
      event.preventDefault();
      return;
    }
    beginTaskDrag(event, task);
  });
  node.addEventListener("dragend", endTaskDrag);
  node.addEventListener("pointerdown", (event) => {
    if (pendingRemoval) return;
    beginTaskPointer(event, task);
  });
  node.addEventListener("click", (event) => {
    if (state.suppressNextTaskClick) {
      state.suppressNextTaskClick = false;
      event.preventDefault();
      return;
    }
    if (pendingRemoval) return;
    if (isTaskActionTarget(event.target)) return;
    toggleTaskSelected(task.uid);
    render();
  });
  node.addEventListener("keydown", (event) => {
    if (pendingRemoval) return;
    if (!["Enter", " "].includes(event.key) || event.target !== node) return;
    event.preventDefault();
    toggleTaskSelected(task.uid);
    render();
  });

  const check = node.querySelector(".check-button");
  check.disabled = pendingRemoval;
  check.title = pendingRemoval ? "Pending removal" : task.done ? "Mark open" : "Mark done";
  check.addEventListener("click", (event) => {
    event.stopPropagation();
    if (pendingRemoval) return;
    updateTask(task, { done: !task.done });
  });

  const title = node.querySelector(".task-title");
  title.innerHTML = renderInlineMarkdown(task.text, task.pageUids || {}, task.blockStrings || {});
  title.classList.toggle("editable", !pendingRemoval);
  title.title = pendingRemoval ? "" : "Double-click to edit task";
  title.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    if (pendingRemoval) return;
    startEdit(node, task);
  });

  const edit = node.querySelector(".edit-input");
  edit.value = task.text;
  edit.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      await updateTask(task, { text: edit.value });
    }
    if (event.key === "Escape") render();
  });
  edit.addEventListener("blur", () => {
    title.classList.remove("hidden");
    edit.classList.add("hidden");
  });

  const meta = node.querySelector(".task-meta");
  renderTaskMeta(task, meta);

  const open = node.querySelector(".open-link");
  if (pendingRemoval || task.local || !state.graph) {
    open.classList.add("hidden");
  } else {
    open.href = roamBlockUrl(task.uid);
    open.dataset.roamUid = task.uid;
  }

  const remove = node.querySelector(".delete-button");
  remove.disabled = false;
  remove.textContent = pendingRemoval ? "Undo" : "×";
  remove.classList.toggle("undo-button", pendingRemoval);
  remove.title = pendingRemoval ? "Undo removal" : "Remove from local sandbox";
  remove.setAttribute("aria-label", pendingRemoval ? "Undo removal" : "Remove from local sandbox");
  remove.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (pendingRemoval) {
      undoPendingRemoval(task.uid);
    } else {
      stageLocalRemoval(task);
    }
    render();
  });

  return node;
}

function startEdit(node, task) {
  const title = node.querySelector(".task-title");
  const edit = node.querySelector(".edit-input");
  title.classList.add("hidden");
  edit.classList.remove("hidden");
  edit.value = task.text;
  edit.focus();
  edit.setSelectionRange(edit.value.length, edit.value.length);
}

async function updateTask(task, changes) {
  updateLocalTask(task, changes);
  render();
}

function createLocalTask(text, project = "") {
  const now = Date.now();
  const uid = `local-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const cleanProject = project.trim();
  const task = {
    uid,
    raw: text,
    text,
    status: "todo",
    done: false,
    local: true,
    pageTitle: cleanProject || "Local GTD",
    pageUid: null,
    pageUids: {},
    pages: cleanProject ? [cleanProject] : [],
    tags: [],
    blockRefs: [],
    blockStrings: {},
    breadcrumb: [],
    details: [],
    createdDate: todayIso(),
    completedDate: null,
    abandonedDate: null,
    dueDate: null,
    priority: null,
    createdTime: now,
    editedTime: now
  };

  state.localTasks = [task, ...state.localTasks];
  state.localState[uid] = {
    gtdStatus: "inbox",
    project: cleanProject,
    context: "",
    waitingFor: ""
  };
  persistLocalStore();
  state.tasks = effectiveTasks();
}

function setTaskSelected(uid, selected) {
  if (selected) {
    state.selectedTaskIds.add(uid);
    return;
  }
  state.selectedTaskIds.delete(uid);
}

function toggleTaskSelected(uid) {
  setTaskSelected(uid, !state.selectedTaskIds.has(uid));
}

function bindViewDropTarget(button) {
  const status = button.dataset.view;
  if (!isDropStatus(status) && !isBlockedDropStatus(status)) return;

  button.addEventListener("dragenter", (event) => {
    if (!hasDraggedTasks(event)) return;
    event.preventDefault();
    markDropButton(button, status, event);
  });

  button.addEventListener("dragover", (event) => {
    if (!hasDraggedTasks(event)) return;
    event.preventDefault();
    markDropButton(button, status, event);
  });

  button.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && button.contains(event.relatedTarget)) return;
    button.classList.remove("drop-target", "drop-denied");
  });

  button.addEventListener("drop", (event) => {
    if (!hasDraggedTasks(event)) return;
    event.preventDefault();

    const taskIds = draggedTaskIdsFromEvent(event);
    endTaskDrag();
    if (isDropStatus(status)) moveTasksToStatus(taskIds, status);
  });
}

function markDropButton(button, status, event) {
  const accepted = isDropStatus(status);
  if (event.dataTransfer) event.dataTransfer.dropEffect = accepted ? "move" : "none";
  button.classList.toggle("drop-target", accepted);
  button.classList.toggle("drop-denied", !accepted);
}

function beginTaskDrag(event, task) {
  if (isTaskActionTarget(event.target)) {
    event.preventDefault();
    return;
  }

  const taskIds = taskIdsForDrag(task);
  if (!taskIds.length) {
    event.preventDefault();
    return;
  }

  state.dragTaskIds = taskIds;
  startTaskDragVisuals(taskIds);

  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(taskDragMimeType, JSON.stringify(taskIds));
  event.dataTransfer.setData("text/plain", taskIds.join(","));
  setNativeTaskDragImage(event.dataTransfer, taskIds);
}

function beginTaskPointer(event, task) {
  if (event.button !== 0 || isTaskActionTarget(event.target)) return;

  state.taskDragPointer = {
    pointerId: event.pointerId,
    task,
    taskIds: [],
    dragging: false,
    sourceNode: event.currentTarget,
    startX: event.clientX,
    startY: event.clientY
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveTaskPointer(event) {
  const drag = state.taskDragPointer;
  if (!drag || drag.pointerId !== event.pointerId) return;

  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.dragging && distance < 8) return;

  if (!drag.dragging) {
    drag.taskIds = taskIdsForDrag(drag.task);
    if (!drag.taskIds.length) {
      state.taskDragPointer = null;
      return;
    }
    drag.dragging = true;
    state.dragTaskIds = drag.taskIds;
    startTaskDragVisuals(drag.taskIds, { x: event.clientX, y: event.clientY });
  }

  event.preventDefault();
  updateTaskDragBadge(event.clientX, event.clientY);
  highlightDropTargetAt(event.clientX, event.clientY);
}

function endTaskPointer(event) {
  const drag = state.taskDragPointer;
  if (!drag || drag.pointerId !== event.pointerId) return;

  state.taskDragPointer = null;
  drag.sourceNode?.releasePointerCapture?.(event.pointerId);

  if (!drag.dragging) return;

  event.preventDefault();
  suppressNextTaskClick();

  const status = dropStatusAt(event.clientX, event.clientY);
  endTaskDrag();
  if (status) moveTasksToStatus(drag.taskIds, status);
}

function cancelTaskPointer(event) {
  const drag = state.taskDragPointer;
  if (!drag || drag.pointerId !== event.pointerId) return;

  state.taskDragPointer = null;
  drag.sourceNode?.releasePointerCapture?.(event.pointerId);
  if (drag.dragging) endTaskDrag();
}

function endTaskDrag() {
  state.dragTaskIds = [];
  document.body.classList.remove("task-drag-active");
  removeTaskDragBadge();
  clearDropTargets();
  markDraggingTasks([], false);
}

function taskIdsForDrag(task) {
  if (!state.selectedTaskIds.has(task.uid)) return [task.uid];

  return [...state.selectedTaskIds].filter((uid) => state.visibleTaskIds.has(uid) && !isPendingRemoval(uid));
}

function isDropStatus(status) {
  return ["inbox", "next", "waiting", "someday"].includes(status);
}

function isBlockedDropStatus(status) {
  return status === "scheduled";
}

function hasDraggedTasks(event) {
  if (state.dragTaskIds.length) return true;

  const types = event.dataTransfer?.types;
  return Boolean(types && Array.from(types).includes(taskDragMimeType));
}

function draggedTaskIdsFromEvent(event) {
  if (state.dragTaskIds.length) return [...state.dragTaskIds];

  const raw = event.dataTransfer?.getData(taskDragMimeType);
  if (!raw) return [];

  try {
    const taskIds = JSON.parse(raw);
    return Array.isArray(taskIds) ? taskIds.filter((uid) => typeof uid === "string") : [];
  } catch {
    return [];
  }
}

function moveTasksToStatus(taskIds, status) {
  if (!isDropStatus(status)) return;
  const changes = triageChangesForBucket(status);
  if (!Object.keys(changes).length) return;

  const idSet = new Set(taskIds);
  const tasks = state.tasks.filter((task) => idSet.has(task.uid) && !isPendingRemoval(task.uid));
  if (!tasks.length) return;

  for (const task of tasks) {
    updateLocalTask(task, changes);
  }
  clearSelection();
  resetBulkInputs();
  render();
}

function startTaskDragVisuals(taskIds, point = null) {
  document.body.classList.add("task-drag-active");
  markDraggingTasks(taskIds, true);

  if (taskIds.length < 2) {
    removeTaskDragBadge();
    return;
  }

  ensureTaskDragBadge(taskIds.length);
  if (point) {
    updateTaskDragBadge(point.x, point.y);
  } else {
    state.dragBadge.classList.add("native-only");
  }
}

function setNativeTaskDragImage(dataTransfer, taskIds) {
  if (taskIds.length < 2 || typeof dataTransfer.setDragImage !== "function") return;

  const badge = ensureTaskDragBadge(taskIds.length);
  badge.classList.add("native-only");
  dataTransfer.setDragImage(badge, 26, 18);
}

function ensureTaskDragBadge(count) {
  if (!state.dragBadge) {
    const badge = document.createElement("div");
    badge.className = "task-drag-badge";
    badge.setAttribute("aria-hidden", "true");

    const icon = document.createElement("span");
    icon.className = "task-drag-box-icon";

    const value = document.createElement("strong");
    value.className = "task-drag-count";

    badge.append(icon, value);
    document.body.append(badge);
    state.dragBadge = badge;
  }

  state.dragBadge.querySelector(".task-drag-count").textContent = String(count);
  return state.dragBadge;
}

function updateTaskDragBadge(x, y) {
  if (!state.dragBadge) return;

  state.dragBadge.classList.remove("native-only");
  state.dragBadge.style.left = `${x + 14}px`;
  state.dragBadge.style.top = `${y + 14}px`;
}

function removeTaskDragBadge() {
  state.dragBadge?.remove();
  state.dragBadge = null;
}

function highlightDropTargetAt(x, y) {
  clearDropTargets();
  const button = dropButtonAt(x, y);
  if (!button) return;

  const accepted = isDropStatus(button.dataset.view);
  button.classList.toggle("drop-target", accepted);
  button.classList.toggle("drop-denied", !accepted);
}

function dropStatusAt(x, y) {
  const status = dropButtonAt(x, y)?.dataset.view || "";
  return isDropStatus(status) ? status : "";
}

function dropButtonAt(x, y) {
  const target = document.elementFromPoint(x, y);
  const button = target?.closest?.(".view-button");
  return button && (isDropStatus(button.dataset.view) || isBlockedDropStatus(button.dataset.view)) ? button : null;
}

function markDraggingTasks(taskIds, dragging) {
  const idSet = new Set(taskIds);
  document.querySelectorAll(".task-row[data-task-uid]").forEach((row) => {
    row.classList.toggle("dragging", dragging && idSet.has(row.dataset.taskUid));
  });
}

function clearDropTargets() {
  document.querySelectorAll(".view-button.drop-target, .view-button.drop-denied").forEach((button) => {
    button.classList.remove("drop-target", "drop-denied");
  });
}

function suppressNextTaskClick() {
  state.suppressNextTaskClick = true;
  window.setTimeout(() => {
    state.suppressNextTaskClick = false;
  });
}

function toggleVisibleSelection(selected) {
  for (const uid of state.visibleTaskIds) {
    setTaskSelected(uid, selected);
  }
  render();
}

function areAllVisibleTasksSelected() {
  if (!state.visibleTaskIds.size) return false;
  for (const uid of state.visibleTaskIds) {
    if (!state.selectedTaskIds.has(uid)) return false;
  }
  return true;
}

function clearSelection() {
  state.selectedTaskIds.clear();
}

function syncSelectionToVisibleTasks(visibleTasks) {
  const visibleIds = new Set(visibleTasks.map((task) => task.uid));
  for (const uid of state.selectedTaskIds) {
    if (!visibleIds.has(uid)) state.selectedTaskIds.delete(uid);
  }
}

function selectedTasks() {
  return state.tasks.filter((task) => state.selectedTaskIds.has(task.uid));
}

function applyBulkChanges() {
  if (keyboardScheduleTaskIds.length && els.bulkStatusInput.value === "scheduled") {
    applyKeyboardScheduleDate();
    return;
  }
  if (els.bulkStatusInput.value === "scheduled" && !els.bulkDateInput.value) {
    els.bulkDateInput.focus();
    return;
  }

  const tasks = selectedTasks();
  const changes = bulkChanges();
  if (!tasks.length || !Object.keys(changes).length) return;

  for (const task of tasks) {
    updateLocalTask(task, changes);
  }
  clearKeyboardScheduleTriage();
  clearSelection();
  resetBulkInputs();
  render();
}

function bulkChanges() {
  return bulkChangesFromInput({
    status: els.bulkStatusInput.value,
    project: els.bulkProjectInput.value,
    context: els.bulkContextInput.value,
    dueDate: els.bulkDateInput.value,
    waitingFor: els.bulkWaitingInput.value
  });
}

function resetBulkInputs() {
  els.bulkStatusInput.value = "";
  els.bulkProjectInput.value = "";
  els.bulkContextInput.value = "";
  els.bulkDateInput.value = "";
  els.bulkWaitingInput.value = "";
}

function bulkControls() {
  return [
    els.bulkStatusInput,
    els.bulkProjectInput,
    els.bulkContextInput,
    els.bulkDateInput,
    els.bulkWaitingInput
  ];
}

function isTaskActionTarget(target) {
  return Boolean(target.closest("button, a, input, select, textarea, label"));
}

function stageLocalRemoval(task) {
  state.pendingRemovals.set(task.uid, { view: state.view });
  state.selectedTaskIds.delete(task.uid);
}

function undoPendingRemoval(uid) {
  state.pendingRemovals.delete(uid);
}

function isPendingRemoval(uid) {
  return state.pendingRemovals.has(uid);
}

function commitPendingRemovalsForView(view) {
  const removals = [...state.pendingRemovals.entries()].filter(([, removal]) => removal.view === view);
  if (!removals.length) return;

  for (const [uid] of removals) {
    const task = state.tasks.find((candidate) => candidate.uid === uid);
    if (task) removeLocalTask(task);
    state.pendingRemovals.delete(uid);
  }
  state.tasks = effectiveTasks();
}

function updateLocalTask(task, changes) {
  const uid = task.uid;
  const previous = state.localState[uid] || {};
  state.localState[uid] = updateLocalTaskState(previous, changes, {
    now: Date.now(),
    today: todayIso()
  });
  persistLocalStore();
  state.tasks = effectiveTasks();
}

function removeLocalTask(task) {
  const nextStore = removeLocalTaskFromStore(
    { localTasks: state.localTasks, localState: state.localState },
    task,
    { now: Date.now() }
  );
  state.localTasks = nextStore.localTasks;
  state.localState = nextStore.localState;
  state.selectedTaskIds.delete(task.uid);
  persistLocalStore();
  state.tasks = effectiveTasks();
}

function effectiveTasks() {
  return deriveEffectiveTasks(state.roamTasks, state.localTasks, state.localState);
}

const localStoreSaveQueue = createLocalStoreSaveQueue({
  saveSnapshot: saveLocalStoreSnapshot
});

globalThis.roamTasks = {
  ...(globalThis.roamTasks || {}),
  flushLocalStoreSaves,
  hasPendingLocalStoreSaves
};

async function loadLocalStore() {
  const legacyStore = readLegacyLocalStore();

  try {
    const response = await api("/api/local-state");
    const stored = normalizeLocalStore(response);
    state.localStoreInfo = normalizeLocalStoreInfo(response);
    const shouldMigrateLegacy = !hasLocalStoreData(stored) && hasLocalStoreData(legacyStore);
    const nextStore = shouldMigrateLegacy ? legacyStore : stored;

    state.localTasks = nextStore.localTasks;
    state.localState = nextStore.localState;
    state.tasks = effectiveTasks();

    if (shouldMigrateLegacy) {
      const migrated = await saveLocalStoreSnapshot(snapshotLocalStore());
      if (migrated) clearLegacyLocalStore();
    } else {
      clearLegacyLocalStore();
    }
  } catch {
    state.localTasks = legacyStore.localTasks;
    state.localState = legacyStore.localState;
    state.tasks = effectiveTasks();
  }
}

function persistLocalStore() {
  localStoreSaveQueue.enqueue(snapshotLocalStore());
}

async function flushLocalStoreSaves() {
  return localStoreSaveQueue.flush();
}

function hasPendingLocalStoreSaves() {
  return localStoreSaveQueue.hasPending();
}

async function saveLocalStoreSnapshot(snapshot) {
  try {
    await api("/api/local-state", {
      method: "POST",
      body: snapshot
    });
    clearLegacyLocalStore();
    return true;
  } catch {
    writeLegacyLocalStore(snapshot);
    return false;
  }
}

function snapshotLocalStore() {
  return {
    localTasks: state.localTasks,
    localState: state.localState
  };
}

function normalizeLocalStore(data = {}) {
  return {
    localTasks: Array.isArray(data.localTasks) ? data.localTasks : [],
    localState: normalizeLocalState(data.localState)
  };
}

function normalizeLocalStoreInfo(data = {}) {
  return {
    storePath: typeof data.storePath === "string" ? data.storePath : "",
    recovery: normalizeLocalStoreRecovery(data.recovery)
  };
}

function normalizeLocalStoreRecovery(recovery) {
  if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) return null;
  return {
    error: stringValue(recovery.error),
    errorName: stringValue(recovery.errorName),
    preservedPath: stringValue(recovery.preservedPath),
    recoveredAt: stringValue(recovery.recoveredAt)
  };
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function hasLocalStoreData(store) {
  return store.localTasks.length > 0 || Object.keys(store.localState).length > 0;
}

function normalizeLocalState(localState) {
  if (!localState || typeof localState !== "object" || Array.isArray(localState)) return {};
  return Object.fromEntries(
    Object.entries(localState).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
  );
}

function readLegacyLocalStore() {
  return normalizeLocalStore({
    localTasks: readStoredJson(storageKeys.legacyLocalTasks, []),
    localState: readStoredJson(storageKeys.legacyLocalState, {})
  });
}

function writeLegacyLocalStore(store) {
  localStorage.setItem(storageKeys.legacyLocalTasks, JSON.stringify(store.localTasks));
  localStorage.setItem(storageKeys.legacyLocalState, JSON.stringify(store.localState));
}

function clearLegacyLocalStore() {
  localStorage.removeItem(storageKeys.legacyLocalTasks);
  localStorage.removeItem(storageKeys.legacyLocalState);
}

async function openRoamTarget({ title, uid, fallbackHref }) {
  try {
    await api("/api/open", {
      method: "POST",
      body: {
        graph: state.graph,
        title,
        uid
      }
    });
    setStatus();
  } catch (error) {
    if (fallbackHref) window.location.href = fallbackHref;
    setStatus(error.message, false, true);
  }
}

function renderTaskMeta(task, meta) {
  const organization = state.view === "projects" ? bucketLine(task) : projectLine(task);
  if (organization) meta.append(organization);

  const dates = dateLine(task);
  if (dates) meta.append(dates);

  if (task.priority) {
    const line = metaLine("priority");
    const priority = chip(`P${task.priority}`);
    priority.classList.add("priority");
    line.append(priority);
    meta.append(line);
  }

  const related = relatedChips(task);
  if (related.length) {
    const line = metaLine("related");
    for (const node of related) line.append(node);
    meta.append(line);
  }

  const path = pathLine(task);
  if (path) meta.append(path);

  const detail = detailLine(task);
  if (detail) meta.append(detail);
}

function projectLine(task) {
  const project = projectName(task);
  if (!project) return null;

  const line = metaLine("project");
  line.append(chip(project));
  return line;
}

function bucketLine(task) {
  if (!task.gtdStatus) return null;

  const bucket = chip(gtdStatusLabels[task.gtdStatus] || task.gtdStatus);
  bucket.classList.add("gtd-status-chip", `gtd-${task.gtdStatus}`);
  const line = metaLine("bucket");
  line.append(bucket);
  return line;
}

function dateLine(task) {
  const line = document.createElement("div");
  line.className = "meta-line date-line";
  appendDateAttribute(line, "created", createdChip(task));
  appendDateAttribute(line, "due", dueChip(task));
  appendDateAttribute(
    line,
    task.status === "abandoned" ? "abandoned" : "completed",
    terminalChip(task)
  );
  return line.children.length ? line : null;
}

function appendDateAttribute(line, label, valueNode) {
  if (!valueNode) return;
  const item = document.createElement("span");
  item.className = "date-attribute";
  const labelNode = document.createElement("span");
  labelNode.className = "meta-label";
  labelNode.textContent = label;
  item.append(labelNode, valueNode);
  line.append(item);
}

function metaLine(label) {
  const line = document.createElement("div");
  line.className = "meta-line";
  const labelNode = document.createElement("span");
  labelNode.className = "meta-label";
  labelNode.textContent = label;
  line.append(labelNode);
  return line;
}

function pathLine(task) {
  const nodes = [];
  const includeRootPage = !isDailyNoteTitle(task.pageTitle);

  if (includeRootPage) {
    nodes.push(pathChip(task.pageTitle, "", { pageLink: true }));
  }

  for (const parent of task.breadcrumb || []) {
    nodes.push(pathChip(parent.string, parent.uid));
  }

  if (!nodes.length) return null;

  const line = metaLine("path");
  line.classList.add("path-line", "expandable-line");

  const values = document.createElement("span");
  values.className = "path-values expandable-values";
  nodes.forEach((node, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "path-separator";
      separator.textContent = ">";
      values.append(separator);
    }
    values.append(node);
  });
  line.append(values);

  return line;
}

function detailLine(task) {
  const details = task.details || [];
  if (!details.length) return null;

  const line = metaLine("detail");
  line.classList.add("detail-line", "expandable-line");

  const values = document.createElement("span");
  values.className = "detail-values expandable-values";
  for (const detail of details) {
    values.append(expandableChip(detail.string, detail.uid, { chipClass: "detail-chip" }));
  }
  line.append(values);

  return line;
}

function pathChip(text, fallbackText = "", options = {}) {
  return expandableChip(text, fallbackText, { ...options, chipClass: "path-chip" });
}

function expandableChip(text, fallbackText = "", options = {}) {
  const label = cleanRoamInlineText(text) || fallbackText;
  const node = document.createElement("button");
  node.type = "button";
  node.className = "meta-chip";
  node.classList.add(options.chipClass, "breadcrumb-chip", "expandable-chip");
  if (options.pageLink) {
    const strong = document.createElement("strong");
    strong.className = "path-page-link";
    strong.textContent = label;
    node.append(strong);
  } else {
    node.innerHTML = renderPathChipText(text) || escapeHtml(label);
  }
  node.title = label;
  node.setAttribute("aria-expanded", "false");
  node.addEventListener("click", () => {
    const line = node.closest(".expandable-line");
    const expanded = !node.classList.contains("expanded");
    if (expanded) {
      line?.querySelectorAll(".expandable-chip.expanded").forEach((chip) => {
        if (chip === node) return;
        chip.classList.remove("expanded");
        chip.setAttribute("aria-expanded", "false");
      });
    }
    node.classList.toggle("expanded", expanded);
    node.setAttribute("aria-expanded", expanded ? "true" : "false");
    line?.classList.toggle("has-expanded", Boolean(line.querySelector(".expandable-chip.expanded")));
  });
  return node;
}

function relatedChips(task) {
  const chips = [];
  const seen = new Set([task.pageTitle]);
  const taggedPages = new Set(task.tags || []);

  for (const page of task.pages || []) {
    if (seen.has(page) || taggedPages.has(page) || isRoamDateTitle(page)) continue;
    seen.add(page);
    chips.push(pageChip(page, page, task.pageUids?.[page]));
  }

  for (const tag of task.tags || []) {
    if (seen.has(tag) || seen.has(`#${tag}`)) continue;
    seen.add(tag);
    seen.add(`#${tag}`);
    chips.push(pageChip(tag, tag, task.pageUids?.[tag]));
  }

  return chips;
}

function createdChip(task) {
  const createdDate = task.createdDate || timestampIso(task.createdTime);
  if (!createdDate) return null;
  return chip(formatDue(createdDate));
}

function terminalChip(task) {
  const terminalDate = task.status === "abandoned"
    ? task.abandonedDate || timestampIso(task.editedTime)
    : task.status === "done"
      ? task.completedDate || timestampIso(task.editedTime)
      : "";
  if (!terminalDate) return null;
  const node = chip(formatDue(terminalDate));
  node.classList.add(task.status === "abandoned" ? "abandoned-date" : "completed-date");
  return node;
}

function dueChip(task) {
  if (!task.dueDate) return null;
  const due = chip(formatDue(task.dueDate));
  if (task.dueDate === todayIso()) due.classList.add("due-today");
  if (task.dueDate < todayIso() && !task.done) due.classList.add("overdue");
  return due;
}

function chip(text) {
  const node = document.createElement("span");
  node.className = "meta-chip";
  node.textContent = text;
  return node;
}

function pageChip(text, pageTitle, pageUid) {
  const node = document.createElement("a");
  node.className = "meta-chip";
  node.textContent = text;
  node.href = roamPageUrl(pageTitle, pageUid);
  setRoamLinkTarget(node, pageTitle, pageUid);
  node.title = `Open ${pageTitle} in Roam`;
  return node;
}

function blockChip(parent) {
  const node = document.createElement("a");
  const label = cleanRoamInlineText(parent.string) || parent.uid;
  node.className = "meta-chip breadcrumb-chip";
  node.textContent = label;
  node.href = roamBlockUrl(parent.uid);
  node.dataset.roamUid = parent.uid;
  node.title = "Open parent block in Roam";
  return node;
}

function renderEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  els.taskList.append(empty);
}

function renderLocalStoreNotice() {
  const recovery = state.localStoreInfo.recovery;
  els.localStoreNotice.classList.toggle("hidden", !recovery);
  els.localStoreNoticeBody.replaceChildren();
  if (!recovery) return;

  els.localStoreNoticeBody.replaceChildren(
    storeNoticeRow("Active store", state.localStoreInfo.storePath || "Unknown"),
    storeNoticeRow("Preserved data", recovery.preservedPath || "Unavailable"),
    storeNoticeRow("Recovery issue", recovery.error || "Could not load local GTD store safely")
  );
}

function storeNoticeRow(label, value) {
  const row = document.createElement("div");
  row.className = "store-notice-row";
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("code");
  valueNode.textContent = value;
  row.append(labelNode, valueNode);
  return row;
}

function setStatus(message = "", busy = false, isError = false) {
  const label = busy && message ? `${message} tasks` : "Refresh tasks";
  els.refreshButton.title = isError ? message : label;
  els.refreshButton.setAttribute("aria-label", isError ? `${label}. ${message}` : label);
  els.refreshButton.classList.toggle("busy", busy);
  els.refreshButton.classList.toggle("error", isError);
}

async function api(path, options = {}) {
  const controller = options.timeoutMs ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;

  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: controller?.signal
  }).catch((error) => {
    if (error.name === "AbortError") throw new Error("Roam refresh timed out");
    throw error;
  }).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function activeGraphName() {
  return state.graphs.find((graph) => graph.nickname === state.graph)?.name || state.graph || "";
}

function roamPageUrl(pageTitle, pageUid) {
  return roamBlockUrl(pageUid || pageTitle);
}

function roamBlockUrl(uid) {
  return `roam://#/app/${encodeURIComponent(activeGraphName())}/page/${encodeURIComponent(uid)}`;
}

function activeGraph() {
  return state.graphs.find((graph) => graph.nickname === state.graph || graph.name === state.graph);
}

function canWrite() {
  return activeGraph()?.accessLevel !== "read-only";
}

function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function shouldLoadDoneTasks() {
  return state.view === "review" && state.showCompleted;
}

function formatDue(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: year === new Date().getFullYear() ? undefined : "numeric"
  }).format(new Date(year, month - 1, day));
}

function renderInlineMarkdown(markdown, pageUids = {}, blockStrings = {}) {
  const placeholders = [];
  const stash = (html) => {
    const token = `@@RTTOKEN${placeholders.length}@@`;
    placeholders.push(html);
    return token;
  };

  let source = String(markdown || "");

  source = source.replace(/`([^`]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));

  source = source.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_, label, href) => {
    return stash(renderMarkdownLink(label, href, pageUids));
  });

  source = source.replace(/#\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => {
    return stash(renderRoamPageLink(pageTitle, `#${pageTitle}`, pageUids));
  });

  source = source.replace(/\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => {
    return stash(renderRoamPageLink(pageTitle, pageTitle, pageUids));
  });

  source = source.replace(/\(\(([A-Za-z0-9_-]+)\)\)/g, (_, uid) => {
    const label = blockStrings[uid] ? cleanRoamInlineText(blockStrings[uid]) : `(${uid})`;
    return stash(
      `<a class="roam-page-link" href="${escapeAttribute(roamBlockUrl(uid))}" data-roam-uid="${escapeAttribute(uid)}" title="Open block in Roam">${escapeHtml(label || `(${uid})`)}</a>`
    );
  });

  source = source.replace(/(^|[\s(])#([A-Za-z0-9_/-]+)/g, (match, prefix, tag) => {
    return `${prefix}${stash(renderRoamPageLink(tag, `#${tag}`, pageUids))}`;
  });

  let html = escapeHtml(source);
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\*([^*\s][^*]*?)\*/g, "<em>$1</em>")
    .replace(/_([^_\s][^_]*?)_/g, "<em>$1</em>");

  placeholders.forEach((replacement, index) => {
    html = html.replaceAll(`@@RTTOKEN${index}@@`, replacement);
  });

  return html;
}

function renderMarkdownLink(label, href, pageUids = {}) {
  const trimmedHref = String(href || "").trim();
  const pageMatch = trimmedHref.match(/^\[\[([^\]]+)\]\]$/);
  if (pageMatch) return renderRoamPageLink(pageMatch[1], label, pageUids);

  const safeHref = safeLinkHref(trimmedHref);
  if (!safeHref) return escapeHtml(label);

  const external = /^https?:/i.test(safeHref);
  const target = external ? ' target="_blank" rel="noreferrer"' : "";
  return `<a href="${escapeAttribute(safeHref)}"${target}>${escapeHtml(label)}</a>`;
}

function renderRoamPageLink(pageTitle, label, pageUids = {}) {
  const pageUid = pageUids[pageTitle];
  const targetAttribute = pageUid
    ? `data-roam-uid="${escapeAttribute(pageUid)}"`
    : `data-roam-title="${escapeAttribute(pageTitle)}"`;
  return `<a class="roam-page-link" href="${escapeAttribute(roamPageUrl(pageTitle, pageUid))}" ${targetAttribute} title="Open ${escapeAttribute(pageTitle)} in Roam">${escapeHtml(label)}</a>`;
}

function setRoamLinkTarget(node, pageTitle, pageUid) {
  if (pageUid) {
    node.dataset.roamUid = pageUid;
    delete node.dataset.roamTitle;
    return;
  }
  node.dataset.roamTitle = pageTitle;
  delete node.dataset.roamUid;
}

function safeLinkHref(href) {
  if (/^(https?:|mailto:|roam:\/\/)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  return "";
}

function renderPathChipText(value = "") {
  const placeholders = [];
  const stash = (html) => {
    const token = `@@RTPATHTOKEN${placeholders.length}@@`;
    placeholders.push(html);
    return token;
  };
  const boldPageLink = (label) => stash(`<strong class="path-page-link">${escapeHtml(label)}</strong>`);

  let source = String(value);
  source = source
    .replace(/\{\{\s*\[\[(?:TODO|DONE|Abandoned)\]\]\s*\}\}/gi, "")
    .replace(/\{\{\s*(?:TODO|DONE|Abandoned)\s*\}\}/gi, "")
    .replace(/\[([^\]\n]+)\]\(\[\[([^\]\n]+)\]\]\)/g, (_, label) => boldPageLink(label))
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
    .replace(/#\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => boldPageLink(`#${pageTitle}`))
    .replace(/\[\[([^\]\n]+)\]\]/g, (_, pageTitle) => boldPageLink(pageTitle))
    .replace(/(^|[\s(])#([A-Za-z0-9_/-]+)/g, (_, prefix, tag) => {
      return `${prefix}${boldPageLink(`#${tag}`)}`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

  let html = escapeHtml(source);
  placeholders.forEach((replacement, index) => {
    html = html.replaceAll(`@@RTPATHTOKEN${index}@@`, replacement);
  });
  return html;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const viewTitles = {
  inbox: "Inbox",
  next: "Next Actions",
  waiting: "Waiting For",
  scheduled: "Scheduled",
  someday: "Someday / Maybe",
  projects: "Projects",
  review: "Review"
};
