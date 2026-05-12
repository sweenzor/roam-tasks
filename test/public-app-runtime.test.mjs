import test from "node:test";
import assert from "node:assert/strict";
import { installFakeBrowser, jsonResponse } from "./fake-browser.mjs";

let appImportCounter = 0;

test("browser app boot renders setup and degraded local store notice", async () => {
  const browser = installFakeBrowser({
    fetch: async (path) => {
      if (path === "/api/local-state") throw new Error("Store down");
      if (path === "/api/graphs") {
        return jsonResponse({
          graphs: [],
          selectedGraph: null,
          port: 3333,
          roamApiHost: "127.0.0.1"
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }
  });

  try {
    await importApp();
    await waitFor(() => browser.ids.localStoreNoticeTitle.textContent === "Local sandbox fallback");

    assert.equal(browser.ids.setupPanel.classList.contains("hidden"), false);
    assert.equal(browser.ids.localStoreNotice.classList.contains("hidden"), false);
    assert.equal(browser.ids.localStoreNoticeTitle.textContent, "Local sandbox fallback");
    assert.equal(browser.ids.taskList.children[0].textContent, "Capture a task to start.");
  } finally {
    browser.restore();
  }
});

test("browser app boot loads selected graph tasks into rendered rows", async () => {
  const browser = installFakeBrowser({
    fetch: graphTaskFetch()
  });

  try {
    await importApp();
    await waitFor(() => browser.ids.taskList.querySelector(".task-row"));

    const row = browser.ids.taskList.querySelector(".task-row");
    const title = row.querySelector(".task-title");
    const meta = row.querySelector(".task-meta");

    assert.equal(row.dataset.taskUid, "abc123");
    assert.match(title.innerHTML, /data-roam-uid="projectuid"/);
    assert.match(title.innerHTML, /href="roam:\/\/#\/app\/Personal%20Graph\/page\/ref1"/);
    assert.equal(
      row.querySelector(".open-link").href,
      "roam://#/app/Personal%20Graph/page/abc123"
    );
    assert.equal(meta.querySelector(".priority").textContent, "P1");
    assert.equal(meta.querySelector(".detail-chip").title, "Review details");
    assert.equal(browser.ids.countInbox.textContent, "1");
  } finally {
    browser.restore();
  }
});

test("quick add creates a local task and flushes it through the local state API", async () => {
  const writes = [];
  const browser = installFakeBrowser({
    fetch: async (path, options = {}) => {
      if (path === "/api/local-state" && options.method === "POST") {
        writes.push(JSON.parse(options.body));
        return jsonResponse({ version: 1, ...writes.at(-1) });
      }
      if (path === "/api/local-state") {
        return jsonResponse({ localTasks: [], localState: {} });
      }
      if (path === "/api/graphs") {
        return jsonResponse({ graphs: [], selectedGraph: null });
      }
      throw new Error(`Unexpected request: ${path}`);
    }
  });

  try {
    await importApp();
    await waitFor(() => browser.ids.setupPanel.classList.contains("hidden") === false);

    browser.ids.taskInput.value = "Write note [[Project]]";
    browser.ids.pageInput.value = "Project";
    await browser.ids.addForm.dispatchEvent("submit");
    await globalThis.roamTasks.flushLocalStoreSaves();

    const row = browser.ids.taskList.querySelector(".task-row");
    assert.match(row.dataset.taskUid, /^local-/);
    assert.match(row.querySelector(".task-title").innerHTML, /Write note/);
    assert.equal(row.querySelector(".open-link").classList.contains("hidden"), true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].localTasks[0].text, "Write note [[Project]]");
    assert.equal(writes[0].localTasks[0].pageTitle, "Project");
    assert.equal(writes[0].localState[row.dataset.taskUid].project, "Project");
  } finally {
    browser.restore();
  }
});

test("task row actions select, remove, and bulk-move rendered tasks", async () => {
  const writes = [];
  const browser = installFakeBrowser({
    fetch: graphTaskFetch({ writes })
  });

  try {
    await importApp();
    let row = await waitForTaskRow(browser);

    await row.dispatchEvent("click");
    row = await waitForTaskRow(browser);
    assert.equal(row.classList.contains("selected"), true);
    assert.equal(browser.ids.bulkCount.textContent, "1 selected");

    browser.ids.bulkStatusInput.value = "next";
    await browser.ids.bulkApplyButton.dispatchEvent("click");
    await globalThis.roamTasks.flushLocalStoreSaves();
    assert.equal(browser.ids.taskList.children[0].textContent, "No tasks in this view.");
    assert.equal(writes.at(-1).localState.abc123.gtdStatus, "next");

    await browser.viewButtons.find((button) => button.dataset.view === "next").dispatchEvent("click");
    row = await waitForTaskRow(browser);
    const remove = row.querySelector(".delete-button");
    await remove.dispatchEvent("click");
    row = await waitForTaskRow(browser);
    assert.equal(row.classList.contains("pending-removal"), true);

    await row.querySelector(".delete-button").dispatchEvent("click");
    row = await waitForTaskRow(browser);
    assert.equal(row.classList.contains("pending-removal"), false);
  } finally {
    browser.restore();
  }
});

test("task row edit, done, and Roam open actions use app.js handlers", async () => {
  const writes = [];
  const openCalls = [];
  const browser = installFakeBrowser({
    fetch: graphTaskFetch({ openCalls, writes })
  });

  try {
    await importApp();
    let row = await waitForTaskRow(browser);

    const title = row.querySelector(".task-title");
    await title.dispatchEvent("dblclick");
    const edit = row.querySelector(".edit-input");
    assert.equal(title.classList.contains("hidden"), true);
    assert.equal(edit.classList.contains("hidden"), false);

    edit.value = "Updated task [[Project]]";
    await edit.dispatchEvent("keydown", { key: "Enter", target: edit });
    await globalThis.roamTasks.flushLocalStoreSaves();
    assert.equal(writes.at(-1).localState.abc123.text, "Updated task [[Project]]");

    row = await waitForTaskRow(browser);
    await browser.ids.taskList.dispatchEvent("click", {
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      target: row.querySelector(".open-link")
    });
    assert.deepEqual(openCalls, [{ graph: "personal", uid: "abc123" }]);

    await row.querySelector(".check-button").dispatchEvent("click");
    await globalThis.roamTasks.flushLocalStoreSaves();
    assert.equal(writes.at(-1).localState.abc123.done, true);
    assert.equal(writes.at(-1).localState.abc123.status, "done");
    assert.equal(browser.ids.taskList.children[0].textContent, "No tasks in this view.");
  } finally {
    browser.restore();
  }
});

test("view and filter controls rerender app state through app.js handlers", async () => {
  const browser = installFakeBrowser({
    fetch: graphTaskFetch()
  });

  try {
    await importApp();
    await waitForTaskRow(browser);

    await browser.viewButtons.find((button) => button.dataset.view === "projects").dispatchEvent("click");
    await waitFor(() => browser.ids.taskList.querySelector(".group-heading"));
    assert.equal(browser.ids.taskList.querySelector(".gtd-status-chip").textContent, "Inbox");

    await browser.viewButtons.find((button) => button.dataset.view === "someday").dispatchEvent("click");
    assert.equal(browser.ids.sinceInput.classList.contains("hidden"), false);
    browser.ids.sinceInput.value = "2026-05-12";
    await browser.ids.sinceInput.dispatchEvent("change");
    assert.equal(browser.ids.viewTitle.textContent, "Someday / Maybe since May 12");

    browser.ids.searchInput.value = "missing";
    await browser.ids.searchInput.dispatchEvent("input");
    assert.equal(browser.ids.taskList.children[0].textContent, "No someday tasks since May 12.");

    browser.ids.compactToggle.checked = true;
    await browser.ids.compactToggle.dispatchEvent("change");
    assert.equal(browser.ids.taskList.classList.contains("compact"), true);
  } finally {
    browser.restore();
  }
});

test("keyboard shortcuts focus, select, clear, and triage visible tasks", async () => {
  const writes = [];
  const browser = installFakeBrowser({
    fetch: graphTaskFetch({ writes })
  });

  try {
    await importApp();
    let row = await waitForTaskRow(browser);

    await browser.window.dispatchEvent("keydown", keyEvent("/", { target: browser.document.body }));
    assert.equal(browser.document.activeElement, browser.ids.searchInput);

    row.focus();
    await browser.window.dispatchEvent("keydown", keyEvent("x", { target: row }));
    row = await waitForTaskRow(browser);
    assert.equal(row.classList.contains("selected"), true);

    await browser.window.dispatchEvent("keydown", keyEvent("Escape", { target: row }));
    row = await waitForTaskRow(browser);
    assert.equal(row.classList.contains("selected"), false);

    row.focus();
    await browser.window.dispatchEvent("keydown", keyEvent("m", { target: row }));
    assert.equal(browser.ids.shortcutHint.classList.contains("hidden"), false);
    await browser.window.dispatchEvent("keydown", keyEvent("w", { target: row }));
    await globalThis.roamTasks.flushLocalStoreSaves();

    assert.equal(browser.ids.taskList.children[0].textContent, "No tasks in this view.");
    assert.equal(writes.at(-1).localState.abc123.gtdStatus, "waiting");
    assert.equal(writes.at(-1).localState.abc123.dueDate, null);
  } finally {
    browser.restore();
  }
});

async function waitFor(predicate) {
  const started = Date.now();
  while (Date.now() - started < 500) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for app boot");
}

function keyEvent(key, options = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...options
  };
}

async function importApp() {
  appImportCounter += 1;
  await import(`${new URL("../public/app.js", import.meta.url).href}?runtime=${Date.now()}-${appImportCounter}`);
}

async function waitForTaskRow(browser) {
  await waitFor(() => browser.ids.taskList.querySelector(".task-row"));
  return browser.ids.taskList.querySelector(".task-row");
}

function graphTaskFetch({ openCalls = [], writes = [] } = {}) {
  return async (path, options = {}) => {
    if (path === "/api/open" && options.method === "POST") {
      openCalls.push(JSON.parse(options.body));
      return jsonResponse({ success: true });
    }
    if (path === "/api/local-state" && options.method === "POST") {
      writes.push(JSON.parse(options.body));
      return jsonResponse({ version: 1, ...writes.at(-1) });
    }
    if (path === "/api/local-state") {
      return jsonResponse({
        localTasks: [],
        localState: {
          abc123: {
            gtdStatus: "inbox",
            project: "Launch",
            context: "@calls",
            waitingFor: "Ada",
            dueDate: "2026-05-12"
          }
        }
      });
    }
    if (path === "/api/graphs") {
      return jsonResponse({
        graphs: [{ name: "Personal Graph", nickname: "personal", type: "hosted" }],
        selectedGraph: "personal",
        port: 3333,
        roamApiHost: "127.0.0.1"
      });
    }
    if (String(path).startsWith("/api/tasks?")) {
      return jsonResponse({
        tasks: [roamTask()]
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
}

function roamTask() {
  return {
    uid: "abc123",
    raw: "{{[[TODO]]}} Call [[Project]] #calls ((ref1))",
    text: "Call [[Project]] #calls ((ref1))",
    status: "todo",
    done: false,
    local: false,
    pageTitle: "Projects",
    pageUid: "projectspage",
    pageUids: {
      Projects: "projectspage",
      Project: "projectuid",
      calls: "callsuid"
    },
    pages: ["Project"],
    tags: ["calls"],
    blockRefs: ["ref1"],
    blockStrings: {
      ref1: "{{[[TODO]]}} Referenced block"
    },
    breadcrumb: [
      { uid: "parent1", string: "Parent [[Area]]" }
    ],
    details: [
      { uid: "child1", string: "Review details" }
    ],
    createdDate: "2026-05-11",
    completedDate: null,
    abandonedDate: null,
    dueDate: null,
    priority: 1,
    createdTime: Date.UTC(2026, 4, 11, 12),
    editedTime: Date.UTC(2026, 4, 12, 12)
  };
}
