export function installFakeBrowser({ fetch }) {
  const previous = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    roamTasks: globalThis.roamTasks
  };
  const document = createFakeDocument();
  const window = createFakeWindow();

  globalThis.document = document;
  globalThis.localStorage = createMemoryStorage();
  globalThis.window = window;
  globalThis.fetch = fetch;

  return {
    document,
    ids: document.ids,
    viewButtons: document.viewButtons,
    window,
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete globalThis[key];
        } else {
          globalThis[key] = value;
        }
      }
    }
  };
}

export function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body
  };
}

function createFakeDocument() {
  const ids = {};
  const body = new FakeElement("body");
  const toolActions = new FakeElement("div");
  toolActions.className = "tool-actions";

  for (const id of elementIds) {
    ids[id] = new FakeElement(tagForId(id), id);
  }

  ids.setupPanel.className = "hidden";
  ids.localStoreNotice.className = "hidden";
  ids.shortcutHint.className = "hidden";

  const addControls = [ids.taskInput, ids.pageInput, new FakeElement("button")];
  ids.addForm.queryResults.set("input, button", addControls);
  for (const control of addControls) ids.addForm.append(control);

  const viewButtons = ["inbox", "next", "waiting", "scheduled", "someday", "projects", "review"]
    .map((view) => {
      const button = new FakeElement("button");
      button.className = view === "inbox" ? "view-button active" : "view-button";
      button.dataset.view = view;
      return button;
    });

  ids.taskTemplate.content = {
    firstElementChild: createTaskTemplateRow()
  };

  return {
    activeElement: body,
    body,
    ids,
    listeners: new Map(),
    viewButtons,
    addEventListener(type, handler) {
      addListener(this.listeners, type, handler);
    },
    createElement(tag) {
      return new FakeElement(tag);
    },
    async dispatchEvent(type, event = {}) {
      return dispatchListeners(this.listeners, type, this, event);
    },
    elementFromPoint() {
      return null;
    },
    querySelector(selector) {
      if (selector.startsWith("#")) return ids[selector.slice(1)] || null;
      if (selector === ".tool-actions") return toolActions;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".view-button") return viewButtons;
      if (selector === ".view-button.drop-target, .view-button.drop-denied") {
        return viewButtons.filter((button) => (
          button.classList.contains("drop-target") || button.classList.contains("drop-denied")
        ));
      }
      if (selector === ".task-row[data-task-uid]") return ids.taskList.querySelectorAll(selector);
      return [];
    }
  };
}

function createFakeWindow() {
  let timerId = 0;
  const timers = new Map();
  return {
    listeners: new Map(),
    location: { href: "" },
    addEventListener(type, handler) {
      addListener(this.listeners, type, handler);
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async dispatchEvent(type, event = {}) {
      return dispatchListeners(this.listeners, type, this, event);
    },
    setTimeout(callback) {
      timerId += 1;
      timers.set(timerId, callback);
      return timerId;
    }
  };
}

function createTaskTemplateRow() {
  const row = new FakeElement("div");
  row.className = "task-row";
  row.append(
    classedElement("button", "check-button"),
    classedElement("span", "task-title"),
    classedElement("input", "edit-input hidden"),
    classedElement("div", "task-meta"),
    classedElement("a", "open-link"),
    classedElement("button", "delete-button")
  );
  return row;
}

function classedElement(tagName, className) {
  const element = new FakeElement(tagName);
  element.className = className;
  return element;
}

const elementIds = [
  "setupPanel",
  "addForm",
  "taskInput",
  "pageInput",
  "searchInput",
  "sinceInput",
  "completedFilter",
  "showCompletedToggle",
  "compactToggle",
  "sortSelect",
  "bulkBar",
  "selectVisibleButton",
  "bulkCount",
  "bulkStatusInput",
  "bulkProjectInput",
  "bulkContextInput",
  "bulkDateInput",
  "bulkWaitingInput",
  "bulkApplyButton",
  "bulkClearButton",
  "localStoreNotice",
  "localStoreNoticeTitle",
  "localStoreNoticeBody",
  "refreshButton",
  "taskList",
  "taskTemplate",
  "shortcutHint",
  "viewTitle",
  "countInbox",
  "countNext",
  "countWaiting",
  "countScheduled",
  "countSomeday",
  "countProjects",
  "countReview"
];

function tagForId(id) {
  if (id.endsWith("Input") || id.endsWith("Toggle")) return "input";
  if (id.endsWith("Button")) return "button";
  if (id.endsWith("Select")) return "select";
  if (id === "addForm") return "form";
  if (id === "taskTemplate") return "template";
  return "div";
}

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.attributes = {};
    this.children = [];
    this.dataset = {};
    this.disabled = false;
    this.listeners = new Map();
    this.parentElement = null;
    this.parentNode = null;
    this.queryResults = new Map();
    this.style = {};
    this.title = "";
    this.type = "";
    this.value = "";
    this.checked = false;
    this._className = "";
    this._innerHTML = "";
    this._textContent = "";
    this.classList = new FakeClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || "");
    this.classList = new FakeClassList(this, this._className);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.children = [];
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
  }

  addEventListener(type, handler) {
    addListener(this.listeners, type, handler);
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node || typeof node === "string") continue;
      node.parentElement = this;
      node.parentNode = this;
      this.children.push(node);
    }
  }

  cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName.toLowerCase(), this.id);
    clone.attributes = { ...this.attributes };
    clone.className = this.className;
    clone.checked = this.checked;
    clone.dataset = { ...this.dataset };
    clone.disabled = this.disabled;
    clone.href = this.href;
    clone.title = this.title;
    clone.type = this.type;
    clone.value = this.value;
    clone._innerHTML = this._innerHTML;
    clone._textContent = this._textContent;
    if (deep) {
      for (const child of this.children) clone.append(child.cloneNode(true));
    }
    return clone;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  focus() {
    if (globalThis.document) globalThis.document.activeElement = this;
  }

  async dispatchEvent(type, event = {}) {
    return dispatchListeners(this.listeners, type, this, event);
  }

  matches(selector) {
    return selector.split(",").some((part) => this.matchesOne(part.trim()));
  }

  matchesOne(selector) {
    if (!selector) return false;
    const dataMatch = selector.match(/\[data-([^\]]+)\]/);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!(key in this.dataset)) return false;
      selector = selector.replace(dataMatch[0], "");
    }
    if (selector.startsWith(".")) {
      return selector
        .slice(1)
        .split(".")
        .every((className) => this.classList.contains(className));
    }
    return selector ? this.tagName.toLowerCase() === selector.toLowerCase() : true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (this.queryResults.has(selector)) return this.queryResults.get(selector);

    const matches = [];
    const visit = (node) => {
      if (node.matches(selector)) matches.push(node);
      for (const child of node.children) visit(child);
    };
    for (const child of this.children) visit(child);
    return matches;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  setSelectionRange() {}
}

function addListener(listeners, type, handler) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(handler);
}

async function dispatchListeners(listeners, type, currentTarget, event = {}) {
  const dispatched = {
    currentTarget,
    defaultPrevented: false,
    target: currentTarget,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    ...event
  };
  for (const handler of listeners.get(type) || []) {
    await handler(dispatched);
  }
  return !dispatched.defaultPrevented;
}

class FakeClassList {
  constructor(element, className = "") {
    this.element = element;
    this.classes = new Set(className.split(/\s+/).filter(Boolean));
  }

  add(...classNames) {
    for (const className of classNames) this.classes.add(className);
    this.sync();
  }

  contains(className) {
    return this.classes.has(className);
  }

  remove(...classNames) {
    for (const className of classNames) this.classes.delete(className);
    this.sync();
  }

  toggle(className, force) {
    const shouldAdd = force === undefined ? !this.classes.has(className) : Boolean(force);
    if (shouldAdd) this.classes.add(className);
    else this.classes.delete(className);
    this.sync();
    return shouldAdd;
  }

  sync() {
    this.element._className = [...this.classes].join(" ");
  }
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}
