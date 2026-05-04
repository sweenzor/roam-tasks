import { isTaskSince, taskDateIso, timestampIso } from "./task-view-model.js";

const storageKeys = {
  compact: "roamTasksCompact",
  legacyLocalState: "roamTasksLocalGtdState",
  legacyLocalTasks: "roamTasksLocalGtdTasks",
  pageDraft: "roamTasksPageDraft",
  query: "roamTasksQuery",
  sinceDate: "roamTasksSomedaySinceDate",
  showCompleted: "roamTasksShowCompleted",
  sort: "roamTasksSort",
  taskDraft: "roamTasksTaskDraft",
  view: "roamTasksView"
};

const gtdViewIds = ["inbox", "next", "waiting", "scheduled", "someday", "projects", "review"];
const gtdStatusLabels = {
  inbox: "Inbox",
  next: "Next",
  waiting: "Waiting",
  scheduled: "Scheduled",
  someday: "Someday"
};

const state = {
  graphs: [],
  graph: null,
  compact: loadCompact(),
  roamTasks: [],
  localTasks: [],
  localState: {},
  tasks: [],
  view: loadView(),
  query: loadQuery(),
  sort: loadSort(),
  sinceDate: loadSinceDate(),
  showCompleted: loadShowCompleted(),
  includeDoneLoaded: false,
  loading: false,
  pendingRemovals: new Map(),
  selectedTaskIds: new Set(),
  visibleTaskIds: new Set()
};

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
  refreshButton: document.querySelector("#refreshButton"),
  taskList: document.querySelector("#taskList"),
  taskTemplate: document.querySelector("#taskTemplate"),
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
      const nextView = button.dataset.view;
      if (nextView !== state.view) commitPendingRemovalsForView(state.view);
      state.view = nextView;
      localStorage.setItem(storageKeys.view, state.view);
      if (shouldLoadDoneTasks() && !state.includeDoneLoaded) {
        await refreshTasks();
        return;
      }
      render();
    });
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
    clearSelection();
    render();
  });

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

  window.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement === document.body) {
      event.preventDefault();
      els.searchInput.focus();
    }
  });
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

  const counts = getCounts(state.tasks);
  els.counts.inbox.textContent = counts.inbox;
  els.counts.next.textContent = counts.next;
  els.counts.waiting.textContent = counts.waiting;
  els.counts.scheduled.textContent = counts.scheduled;
  els.counts.someday.textContent = counts.someday;
  els.counts.projects.textContent = counts.projects;
  els.counts.review.textContent = counts.review;

  const visible = sortTasks(filterTasks(state.tasks), state.sort);
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
  node.classList.toggle("done", task.done);
  node.classList.toggle("completed", task.status === "done");
  node.classList.toggle("abandoned", task.status === "abandoned");
  node.classList.toggle("pending-removal", pendingRemoval);
  node.classList.toggle("selected", state.selectedTaskIds.has(task.uid));
  node.setAttribute("aria-selected", state.selectedTaskIds.has(task.uid) ? "true" : "false");
  node.title = pendingRemoval
    ? "Pending removal"
    : state.selectedTaskIds.has(task.uid)
      ? "Click to deselect task"
      : "Click to select task";
  node.addEventListener("click", (event) => {
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
  const tasks = selectedTasks();
  const changes = bulkChanges();
  if (!tasks.length || !Object.keys(changes).length) return;

  for (const task of tasks) {
    updateLocalTask(task, changes);
  }
  clearSelection();
  resetBulkInputs();
  render();
}

function bulkChanges() {
  const changes = {};
  const status = els.bulkStatusInput.value;
  const project = els.bulkProjectInput.value.trim();
  const context = els.bulkContextInput.value.trim();
  const dueDate = els.bulkDateInput.value;
  const waitingFor = els.bulkWaitingInput.value.trim();

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
  const next = { ...previous, ...changes, editedTime: Date.now() };

  if (Object.prototype.hasOwnProperty.call(changes, "text")) {
    next.text = String(changes.text || "").trim() || "Untitled task";
  }

  if (Object.prototype.hasOwnProperty.call(changes, "done")) {
    next.done = Boolean(changes.done);
    next.status = next.done ? "done" : "todo";
    next.completedDate = next.done ? todayIso() : null;
  }

  state.localState[uid] = next;
  persistLocalStore();
  state.tasks = effectiveTasks();
}

function removeLocalTask(task) {
  if (task.local) {
    state.localTasks = state.localTasks.filter((candidate) => candidate.uid !== task.uid);
    delete state.localState[task.uid];
  } else {
    state.localState[task.uid] = {
      ...(state.localState[task.uid] || {}),
      deleted: true,
      editedTime: Date.now()
    };
  }
  state.selectedTaskIds.delete(task.uid);
  persistLocalStore();
  state.tasks = effectiveTasks();
}

function effectiveTasks() {
  const byUid = new Map();
  for (const task of [...state.roamTasks, ...state.localTasks]) {
    const overlay = state.localState[task.uid] || {};
    if (overlay.deleted) continue;
    byUid.set(task.uid, applyLocalState(task, overlay));
  }
  return [...byUid.values()];
}

function applyLocalState(task, overlay = {}) {
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

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

let localStoreSaveQueue = Promise.resolve();

async function loadLocalStore() {
  const legacyStore = readLegacyLocalStore();

  try {
    const stored = normalizeLocalStore(await api("/api/local-state"));
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
  const snapshot = snapshotLocalStore();
  localStoreSaveQueue = localStoreSaveQueue
    .catch(() => {})
    .then(() => saveLocalStoreSnapshot(snapshot));
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

function filterTasks(tasks) {
  const reviewTasks = new Set(tasks.filter((task) => isReviewTask(task, tasks)).map((task) => task.uid));

  return tasks.filter((task) => {
    if (task.done && !(state.view === "review" && state.showCompleted)) return false;
    if (state.view === "inbox" && task.gtdStatus !== "inbox") return false;
    if (state.view === "next" && task.gtdStatus !== "next") return false;
    if (state.view === "waiting" && task.gtdStatus !== "waiting") return false;
    if (state.view === "scheduled" && !isScheduledTask(task)) return false;
    if (state.view === "someday" && task.gtdStatus !== "someday") return false;
    if (state.view === "someday" && hasSomedaySinceDate() && !isTaskSince(task, state.sinceDate)) return false;
    if (state.view === "projects" && !projectName(task)) return false;
    if (state.view === "review" && !reviewTasks.has(task.uid)) return false;

    if (!state.query) return true;
    const haystack = [
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
    return haystack.includes(state.query);
  });
}

function sortTasks(tasks, mode) {
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

function compareRecentTasks(a, b) {
  const aDate = taskDateIso(a);
  const bDate = taskDateIso(b);
  if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return (b.editedTime || 0) - (a.editedTime || 0) || a.text.localeCompare(b.text);
}

function getCounts(tasks) {
  const openTasks = tasks.filter((task) => !task.done);
  const projects = new Set(openTasks.map(projectName).filter(Boolean));
  return {
    inbox: openTasks.filter((task) => task.gtdStatus === "inbox").length,
    next: openTasks.filter((task) => task.gtdStatus === "next").length,
    waiting: openTasks.filter((task) => task.gtdStatus === "waiting").length,
    scheduled: openTasks.filter(isScheduledTask).length,
    someday: openTasks.filter((task) => {
      return task.gtdStatus === "someday" && (!hasSomedaySinceDate() || isTaskSince(task, state.sinceDate));
    }).length,
    projects: projects.size,
    review: openTasks.filter((task) => isReviewTask(task, tasks)).length
  };
}

function renderTaskMeta(task, meta) {
  const gtd = gtdLine(task);
  if (gtd) meta.append(gtd);

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

function gtdLine(task) {
  const chips = [];
  if (task.gtdStatus && task.gtdStatus !== "inbox") {
    const status = chip(gtdStatusLabels[task.gtdStatus] || task.gtdStatus);
    status.classList.add("gtd-status-chip", `gtd-${task.gtdStatus}`);
    chips.push(status);
  }
  if (projectName(task)) chips.push(chip(projectName(task)));
  if (task.context) chips.push(chip(task.context));
  if (task.waitingFor) chips.push(chip(`waiting: ${task.waitingFor}`));
  if (!chips.length) return null;

  const line = metaLine("gtd");
  for (const node of chips) line.append(node);
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

function loadSinceDate() {
  return localStorage.getItem(storageKeys.sinceDate) || "";
}

function loadShowCompleted() {
  return localStorage.getItem(storageKeys.showCompleted) === "true";
}

function loadCompact() {
  return localStorage.getItem(storageKeys.compact) === "true";
}

function readStoredJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function loadView() {
  const view = localStorage.getItem(storageKeys.view);
  return gtdViewIds.includes(view) ? view : "inbox";
}

function loadQuery() {
  return (localStorage.getItem(storageKeys.query) || "").trim().toLowerCase();
}

function loadSort() {
  const sort = localStorage.getItem(storageKeys.sort);
  if (sort === "page") return "project";
  return ["recent", "due", "project", "updated"].includes(sort) ? sort : "recent";
}

function inferGtdStatus(task) {
  if (task.waitingFor) return "waiting";
  if (hasRelation(task, ["waiting", "waiting for"])) return "waiting";
  if (hasRelation(task, ["someday", "maybe", "someday/maybe"])) return "someday";
  if (hasRelation(task, ["next", "next action", "next actions"])) return "next";
  if (task.dueDate || hasRelation(task, ["scheduled", "calendar"])) return "scheduled";
  return "inbox";
}

function inferProject(task) {
  const pageTitle = cleanRoamInlineText(task.pageTitle || "");
  if (isProjectLikeTitle(pageTitle)) return pageTitle;

  for (const page of task.pages || []) {
    const title = cleanRoamInlineText(page);
    if (isProjectLikeTitle(title)) return title;
  }

  return "";
}

function inferContext(task) {
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

function inferWaitingFor(task) {
  const source = `${task.text || ""} ${(task.details || []).map((detail) => detail.string).join(" ")}`;
  const match = source.match(/waiting(?:\s+for|::)\s+([^#\[\]\n]+)/i);
  return match ? cleanRoamInlineText(match[1]) : "";
}

function projectName(task) {
  return (task.project || "").trim();
}

function isProjectLikeTitle(title = "") {
  const normalized = normalizeRelationTitle(title);
  if (!normalized || normalized === "untitled" || normalized === "local gtd") return false;
  if (isDailyNoteTitle(title) || isRoamDateTitle(title)) return false;
  if (Object.keys(gtdStatusLabels).includes(normalized)) return false;
  if (["done", "todo", "abandoned", "p1", "p2", "p3"].includes(normalized)) return false;
  return true;
}

function isScheduledTask(task) {
  return task.gtdStatus === "scheduled" || Boolean(task.dueDate);
}

function isReviewTask(task, tasks) {
  if (task.done) return false;
  if (task.gtdStatus === "inbox") return true;
  if (task.gtdStatus === "waiting") return true;
  if (task.dueDate && task.dueDate <= todayIso()) return true;

  const project = projectName(task);
  if (!project) return false;
  const projectHasNextAction = tasks.some((candidate) => {
    return !candidate.done && projectName(candidate) === project && candidate.gtdStatus === "next";
  });
  return !projectHasNextAction;
}

function hasRelation(task, aliases) {
  const wanted = new Set(aliases.map(normalizeRelationTitle));
  return relationTitles(task).some((title) => wanted.has(normalizeRelationTitle(title)));
}

function relationTitles(task) {
  return [
    task.pageTitle,
    ...(task.pages || []),
    ...(task.tags || []),
    ...(task.breadcrumb || []).map((parent) => cleanRoamInlineText(parent.string))
  ].filter(Boolean);
}

function normalizeRelationTitle(value = "") {
  return cleanRoamInlineText(value)
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
}

function normalizeContext(value = "") {
  const context = value.trim();
  if (!context) return "";
  return context.startsWith("@") ? context : `@${context.replace(/^#/, "")}`;
}

function shouldLoadDoneTasks() {
  return state.view === "review" && state.showCompleted;
}

function isRoamDateTitle(value = "") {
  return parseRoamDateTitle(value) !== "";
}

function isDailyNoteTitle(value = "") {
  return isRoamDateTitle(value) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(value.trim());
}

function parseRoamDateTitle(value = "") {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?$/i
  );
  return match ? trimmed : "";
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

function cleanRoamInlineText(value = "") {
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
