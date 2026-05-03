import {
  getTaskCounts,
  isTaskSinceViewMatch,
  taskDateIso,
  timestampIso
} from "./task-view-model.js";

const storageKeys = {
  compact: "roamTasksCompact",
  pageDraft: "roamTasksPageDraft",
  query: "roamTasksQuery",
  sinceDate: "roamTasksSinceDate",
  sinceHideDone: "roamTasksSinceHideDone",
  sort: "roamTasksSort",
  taskDraft: "roamTasksTaskDraft",
  view: "roamTasksView"
};

const state = {
  graphs: [],
  graph: null,
  compact: loadCompact(),
  tasks: [],
  view: loadView(),
  query: loadQuery(),
  sort: loadSort(),
  sinceDate: loadSinceDate(),
  sinceHideDone: loadSinceHideDone(),
  includeDoneLoaded: false,
  loading: false
};

const els = {
  setupPanel: document.querySelector("#setupPanel"),
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  pageInput: document.querySelector("#pageInput"),
  toolActions: document.querySelector(".tool-actions"),
  searchInput: document.querySelector("#searchInput"),
  sinceInput: document.querySelector("#sinceInput"),
  sinceDoneFilter: document.querySelector("#sinceDoneFilter"),
  sinceDoneToggle: document.querySelector("#sinceDoneToggle"),
  compactToggle: document.querySelector("#compactToggle"),
  sortSelect: document.querySelector("#sortSelect"),
  refreshButton: document.querySelector("#refreshButton"),
  taskList: document.querySelector("#taskList"),
  taskTemplate: document.querySelector("#taskTemplate"),
  viewTitle: document.querySelector("#viewTitle"),
  counts: {
    inbox: document.querySelector("#countInbox"),
    today: document.querySelector("#countToday"),
    overdue: document.querySelector("#countOverdue"),
    upcoming: document.querySelector("#countUpcoming"),
    since: document.querySelector("#countSince")
  }
};

boot();

async function boot() {
  bindEvents();
  await loadGraphs();
  if (state.graph) await refreshTasks();
  render();
}

function bindEvents() {
  document.querySelectorAll(".view-button").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
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
    state.sinceDate = els.sinceInput.value || defaultSinceDate();
    els.sinceInput.value = state.sinceDate;
    localStorage.setItem(storageKeys.sinceDate, state.sinceDate);
    render();
  });

  els.sinceDoneToggle.checked = state.sinceHideDone;
  els.sinceDoneToggle.addEventListener("change", async () => {
    state.sinceHideDone = els.sinceDoneToggle.checked;
    localStorage.setItem(storageKeys.sinceHideDone, state.sinceHideDone ? "true" : "false");
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

    if (link.dataset.roamUid && link.href.startsWith("roam://")) return;

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

    await api("/api/tasks", {
      method: "POST",
      body: {
        graph: state.graph,
        text,
        pageTitle: els.pageInput.value.trim() || undefined
      }
    });

    els.taskInput.value = "";
    localStorage.removeItem(storageKeys.taskDraft);
    await refreshTasks();
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

    els.setupPanel.classList.toggle("hidden", state.graphs.length > 0);
    setStatus();
  } catch (error) {
    els.setupPanel.classList.remove("hidden");
    setStatus(error.message, false, true);
  }
}

async function refreshTasks(options = {}) {
  if (!state.graph) return;
  const includeDone = options.includeDone ?? shouldLoadDoneTasks();
  setStatus("Refreshing", true);
  try {
    const params = new URLSearchParams({
      graph: state.graph,
      includeDone: String(includeDone)
    });
    const data = await api(`/api/tasks?${params}`);
    state.tasks = data.tasks || [];
    state.includeDoneLoaded = includeDone;
    setStatus();
  } catch (error) {
    setStatus(error.message, false, true);
  }
  render();
}

function render() {
  const writable = canWrite();
  els.addForm.classList.add("hidden");
  els.addForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !writable || !state.graphs.length;
    control.title = writable ? "" : "This Roam token is read-only";
  });

  for (const button of document.querySelectorAll(".view-button")) {
    button.classList.toggle("active", button.dataset.view === state.view);
  }

  const counts = getTaskCounts(state.tasks, {
    today: todayIso(),
    sinceDate: state.sinceDate,
    sinceHideDone: state.sinceHideDone
  });
  els.counts.inbox.textContent = counts.inbox;
  els.counts.today.textContent = counts.today;
  els.counts.overdue.textContent = counts.overdue;
  els.counts.upcoming.textContent = counts.upcoming;
  els.counts.since.textContent = counts.since;

  const visible = sortTasks(filterTasks(state.tasks), state.sort);
  els.viewTitle.textContent = viewTitle();
  els.toolActions.classList.toggle("since-active", state.view === "since");
  els.sinceInput.classList.toggle("hidden", state.view !== "since");
  els.sinceDoneFilter.classList.toggle("hidden", state.view !== "since");
  els.sinceDoneToggle.checked = state.sinceHideDone;
  els.compactToggle.checked = state.compact;
  els.taskList.classList.toggle("compact", state.compact);
  els.taskList.innerHTML = "";

  if (!state.graphs.length) {
    renderEmpty("Connect a graph to load tasks.");
    return;
  }

  if (!visible.length) {
    renderEmpty(emptyViewMessage());
    return;
  }

  for (const task of visible) {
    els.taskList.append(renderTask(task));
  }
}

function viewTitle() {
  if (state.view === "since") {
    return `Since ${formatDue(state.sinceDate)}${state.sinceHideDone ? " · Open" : ""}`;
  }
  return viewTitles[state.view] || "Tasks";
}

function emptyViewMessage() {
  if (state.view === "since") {
    return state.sinceHideDone ? "No open tasks since this date." : "No tasks since this date.";
  }
  return "No tasks in this view.";
}

function renderTask(task) {
  const node = els.taskTemplate.content.firstElementChild.cloneNode(true);
  node.classList.toggle("done", task.done);
  node.classList.toggle("completed", task.status === "done");
  node.classList.toggle("abandoned", task.status === "abandoned");

  const check = node.querySelector(".check-button");
  check.disabled = !canWrite();
  check.title = canWrite() ? (task.done ? "Mark open" : "Mark done") : "This Roam token is read-only";
  check.addEventListener("click", () => updateTask(task, { done: !task.done }));

  const title = node.querySelector(".task-title");
  title.innerHTML = renderInlineMarkdown(task.text, task.pageUids || {}, task.blockStrings || {});
  title.classList.toggle("editable", canWrite());
  title.title = canWrite() ? "Double-click to edit task" : "";
  title.addEventListener("dblclick", () => {
    if (canWrite()) startEdit(node, task);
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
  open.href = roamBlockUrl(task.uid);
  open.dataset.roamUid = task.uid;

  const remove = node.querySelector(".delete-button");
  remove.disabled = !canWrite();
  remove.title = canWrite() ? "Delete" : "This Roam token is read-only";
  remove.addEventListener("click", async () => {
    if (!confirm("Delete this Roam block?")) return;
    await api(`/api/tasks/${encodeURIComponent(task.uid)}`, {
      method: "DELETE",
      body: { graph: state.graph }
    });
    state.tasks = state.tasks.filter((candidate) => candidate.uid !== task.uid);
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
  const data = await api(`/api/tasks/${encodeURIComponent(task.uid)}`, {
    method: "PATCH",
    body: {
      graph: state.graph,
      pageTitle: task.pageTitle,
      ...changes
    }
  });

  state.tasks = state.tasks.map((candidate) => {
    if (candidate.uid !== task.uid) return candidate;
    return { ...candidate, ...data.task, pageTitle: candidate.pageTitle || data.task.pageTitle };
  });
  render();
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
  const today = todayIso();
  return tasks.filter((task) => {
    if (state.view === "done" && !task.done) return false;
    if (
      state.view === "since" &&
      !isTaskSinceViewMatch(task, {
        sinceDate: state.sinceDate,
        sinceHideDone: state.sinceHideDone
      })
    ) return false;
    if (!["done", "since"].includes(state.view) && task.done) return false;
    if (state.view === "today" && task.dueDate !== today) return false;
    if (state.view === "overdue" && !(task.dueDate && task.dueDate < today)) return false;
    if (state.view === "upcoming" && !(task.dueDate && task.dueDate > today)) return false;

    if (!state.query) return true;
    const haystack = [
      task.text,
      task.pageTitle,
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
  if (mode === "page") {
    return copy.sort((a, b) => a.pageTitle.localeCompare(b.pageTitle) || a.text.localeCompare(b.text));
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

function renderTaskMeta(task, meta) {
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
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
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

function defaultSinceDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadSinceDate() {
  return localStorage.getItem(storageKeys.sinceDate) || defaultSinceDate();
}

function loadSinceHideDone() {
  const storedValue = localStorage.getItem(storageKeys.sinceHideDone);
  return storedValue === null ? true : storedValue === "true";
}

function loadCompact() {
  return localStorage.getItem(storageKeys.compact) === "true";
}

function loadView() {
  const view = localStorage.getItem(storageKeys.view);
  return ["inbox", "today", "overdue", "upcoming", "since", "done"].includes(view) ? view : "since";
}

function loadQuery() {
  return (localStorage.getItem(storageKeys.query) || "").trim().toLowerCase();
}

function loadSort() {
  const sort = localStorage.getItem(storageKeys.sort);
  return ["recent", "due", "page", "updated"].includes(sort) ? sort : "recent";
}

function shouldLoadDoneTasks() {
  return state.view === "done" || (state.view === "since" && !state.sinceHideDone);
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
  today: "Today",
  overdue: "Overdue",
  upcoming: "Upcoming",
  done: "Done"
};
