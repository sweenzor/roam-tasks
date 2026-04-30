const state = {
  graphs: [],
  graph: null,
  tasks: [],
  view: "inbox",
  query: "",
  sort: "smart",
  includeDone: false,
  loading: false
};

const els = {
  graphSelect: document.querySelector("#graphSelect"),
  includeDone: document.querySelector("#includeDone"),
  connectionText: document.querySelector("#connectionText"),
  setupPanel: document.querySelector("#setupPanel"),
  addForm: document.querySelector("#addForm"),
  taskInput: document.querySelector("#taskInput"),
  pageInput: document.querySelector("#pageInput"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  refreshButton: document.querySelector("#refreshButton"),
  taskList: document.querySelector("#taskList"),
  taskTemplate: document.querySelector("#taskTemplate"),
  viewTitle: document.querySelector("#viewTitle"),
  viewSubtitle: document.querySelector("#viewSubtitle"),
  statusPill: document.querySelector("#statusPill"),
  counts: {
    inbox: document.querySelector("#countInbox"),
    today: document.querySelector("#countToday"),
    overdue: document.querySelector("#countOverdue"),
    upcoming: document.querySelector("#countUpcoming"),
    done: document.querySelector("#countDone")
  },
  summaryOpen: document.querySelector("#summaryOpen"),
  summaryDue: document.querySelector("#summaryDue"),
  summaryPages: document.querySelector("#summaryPages")
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
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  els.graphSelect.addEventListener("change", async () => {
    state.graph = els.graphSelect.value;
    await refreshTasks();
  });

  els.includeDone.addEventListener("change", async () => {
    state.includeDone = els.includeDone.checked;
    await refreshTasks();
  });

  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    render();
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    render();
  });

  els.refreshButton.addEventListener("click", refreshTasks);

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
    els.graphSelect.innerHTML = "";

    for (const graph of state.graphs) {
      const option = document.createElement("option");
      option.value = graph.nickname;
      option.textContent = `${graph.nickname} (${graph.type})`;
      els.graphSelect.append(option);
    }

    els.graphSelect.disabled = state.graphs.length <= 1;
    els.setupPanel.classList.toggle("hidden", state.graphs.length > 0);
    els.connectionText.textContent = state.graphs.length ? "Ready" : "No graph";
    setStatus("Idle");
  } catch (error) {
    els.connectionText.textContent = "Setup needed";
    els.setupPanel.classList.remove("hidden");
    setStatus(error.message, false, true);
  }
}

async function refreshTasks() {
  if (!state.graph) return;
  setStatus("Syncing", true);
  try {
    const params = new URLSearchParams({
      graph: state.graph,
      includeDone: String(state.includeDone)
    });
    const data = await api(`/api/tasks?${params}`);
    state.tasks = data.tasks || [];
    els.connectionText.textContent = "Connected";
    setStatus("Synced");
  } catch (error) {
    setStatus(error.message, false, true);
  }
  render();
}

function render() {
  const writable = canWrite();
  els.addForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !writable || !state.graphs.length;
    control.title = writable ? "" : "This Roam token is read-only";
  });

  for (const button of document.querySelectorAll(".view-button")) {
    button.classList.toggle("active", button.dataset.view === state.view);
  }

  const counts = getCounts(state.tasks);
  els.counts.inbox.textContent = counts.inbox;
  els.counts.today.textContent = counts.today;
  els.counts.overdue.textContent = counts.overdue;
  els.counts.upcoming.textContent = counts.upcoming;
  els.counts.done.textContent = counts.done;
  els.summaryOpen.textContent = counts.inbox;
  els.summaryDue.textContent = counts.today + counts.overdue;
  els.summaryPages.textContent = new Set(state.tasks.filter((task) => !task.done).map((task) => task.pageTitle)).size;

  const visible = sortTasks(filterTasks(state.tasks), state.sort);
  els.viewTitle.textContent = viewCopy[state.view].title;
  els.viewSubtitle.textContent = viewCopy[state.view].subtitle;
  els.taskList.innerHTML = "";

  if (!state.graphs.length) {
    renderEmpty("Connect a graph to load tasks.");
    return;
  }

  if (!visible.length) {
    renderEmpty("No tasks in this view.");
    return;
  }

  for (const task of visible) {
    els.taskList.append(renderTask(task));
  }
}

function renderTask(task) {
  const node = els.taskTemplate.content.firstElementChild.cloneNode(true);
  node.classList.toggle("done", task.done);

  const check = node.querySelector(".check-button");
  check.disabled = !canWrite();
  check.title = canWrite() ? "Toggle done" : "This Roam token is read-only";
  check.addEventListener("click", () => updateTask(task, { done: !task.done }));

  const title = node.querySelector(".task-title");
  title.textContent = task.text;
  title.title = canWrite() ? "Edit task" : "This Roam token is read-only";
  title.addEventListener("click", () => {
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
  for (const chip of taskChips(task)) meta.append(chip);

  const open = node.querySelector(".open-link");
  open.href = `roam://#/app/${encodeURIComponent(activeGraphName())}/page/${encodeURIComponent(task.uid)}`;

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
      raw: task.raw,
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

function filterTasks(tasks) {
  const today = todayIso();
  return tasks.filter((task) => {
    if (state.view === "done" && !task.done) return false;
    if (state.view !== "done" && task.done) return false;
    if (state.view === "today" && task.dueDate !== today) return false;
    if (state.view === "overdue" && !(task.dueDate && task.dueDate < today)) return false;
    if (state.view === "upcoming" && !(task.dueDate && task.dueDate > today)) return false;

    if (!state.query) return true;
    const haystack = [task.text, task.pageTitle, ...(task.tags || []), ...(task.pages || [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.query);
  });
}

function sortTasks(tasks, mode) {
  const copy = [...tasks];
  if (mode === "due") {
    return copy.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  }
  if (mode === "page") {
    return copy.sort((a, b) => a.pageTitle.localeCompare(b.pageTitle) || a.text.localeCompare(b.text));
  }
  if (mode === "updated") {
    return copy.sort((a, b) => (b.editedTime || 0) - (a.editedTime || 0));
  }
  return copy;
}

function getCounts(tasks) {
  const today = todayIso();
  return {
    inbox: tasks.filter((task) => !task.done).length,
    today: tasks.filter((task) => !task.done && task.dueDate === today).length,
    overdue: tasks.filter((task) => !task.done && task.dueDate && task.dueDate < today).length,
    upcoming: tasks.filter((task) => !task.done && task.dueDate && task.dueDate > today).length,
    done: tasks.filter((task) => task.done).length
  };
}

function taskChips(task) {
  const chips = [];
  chips.push(chip(task.pageTitle));
  if (task.dueDate) {
    const due = chip(formatDue(task.dueDate));
    if (task.dueDate === todayIso()) due.classList.add("due-today");
    if (task.dueDate < todayIso() && !task.done) due.classList.add("overdue");
    chips.push(due);
  }
  if (task.priority) {
    const priority = chip(`P${task.priority}`);
    priority.classList.add("priority");
    chips.push(priority);
  }
  for (const tag of task.tags.slice(0, 3)) chips.push(chip(`#${tag}`));
  return chips;
}

function chip(text) {
  const node = document.createElement("span");
  node.className = "meta-chip";
  node.textContent = text;
  return node;
}

function renderEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  els.taskList.append(empty);
}

function setStatus(message, busy = false, isError = false) {
  els.statusPill.textContent = message;
  els.statusPill.classList.toggle("busy", busy);
  els.statusPill.classList.toggle("error", isError);
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

function formatDue(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: year === new Date().getFullYear() ? undefined : "numeric"
  }).format(new Date(year, month - 1, day));
}

const viewCopy = {
  inbox: {
    title: "Inbox",
    subtitle: "Open tasks from Roam"
  },
  today: {
    title: "Today",
    subtitle: "Tasks linked to today's date"
  },
  overdue: {
    title: "Overdue",
    subtitle: "Open tasks with past dates"
  },
  upcoming: {
    title: "Upcoming",
    subtitle: "Open tasks with future dates"
  },
  done: {
    title: "Done",
    subtitle: "Completed Roam tasks"
  }
};
