import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("browser entrypoint parses before boot", async () => {
  const scriptPath = fileURLToPath(new URL("../public/app.js", import.meta.url));

  await assert.doesNotReject(
    execFileAsync(process.execPath, ["--check", scriptPath]),
    "public/app.js should remain parseable so the renderer can boot"
  );
});

test("quick-add form creates local sandbox tasks", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /<form id="addForm" class="quick-add">/);
  assert.match(script, /function createLocalTask\(text, project = ""\)/);
  assert.match(script, /await api\("\/api\/local-state"\)/);
  assert.match(script, /method: "POST"/);
});

test("renderer migrates legacy localStorage sandbox data to the local JSON store", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const storage = await readFile(new URL("../public/ui-storage.js", import.meta.url), "utf8");

  assert.match(storage, /legacyLocalTasks: "roamTasksLocalGtdTasks"/);
  assert.match(storage, /legacyLocalState: "roamTasksLocalGtdState"/);
  assert.match(script, /function loadLocalStore\(\)/);
  assert.match(script, /function readLegacyLocalStore\(\)/);
  assert.match(script, /function clearLegacyLocalStore\(\)/);
  assert.match(script, /await saveLocalStoreSnapshot\(snapshotLocalStore\(\)\)/);
});

test("renderer exposes a local store flush for Electron restarts", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(script, /createLocalStoreSaveQueue/);
  assert.match(script, /globalThis\.roamTasks =/);
  assert.match(script, /flushLocalStoreSaves/);
  assert.match(script, /hasPendingLocalStoreSaves/);
});

test("renderer surfaces local JSON store recovery diagnostics", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /id="localStoreNotice"/);
  assert.match(html, /id="localStoreNoticeTitle"/);
  assert.match(html, /id="localStoreNoticeBody"/);
  assert.match(script, /localStoreInfo: \{ storePath: "", recovery: null, degraded: null \}/);
  assert.match(script, /state\.localStoreInfo = normalizeLocalStoreInfo\(response\)/);
  assert.match(script, /function renderLocalStoreNotice\(\)/);
  assert.match(script, /localStoreNoticeView\(state\.localStoreInfo\)/);
  assert.match(script, /storeNoticeRow\(label, value\)/);
});

test("renderer only requests completed tasks for views that need them", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(script, /function shouldLoadDoneTasks\(\)/);
  assert.match(script, /return state\.view === "review" && state\.showCompleted/);
  assert.match(script, /includeDone: String\(includeDone\)/);
  assert.doesNotMatch(script, /includeDone: "true"/);
});

test("renderer persists lightweight UI state across relaunches", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const storage = await readFile(new URL("../public/ui-storage.js", import.meta.url), "utf8");
  assert.match(script, /const storedUiState = loadStoredUiState\(\)/);
  assert.match(script, /view: storedUiState\.view/);
  assert.match(script, /query: storedUiState\.query/);
  assert.match(script, /sort: storedUiState\.sort/);
  assert.match(script, /compact: storedUiState\.compact/);
  assert.match(script, /showCompleted: storedUiState\.showCompleted/);
  assert.match(storage, /roamTasksCompact/);
  assert.match(storage, /roamTasksShowCompleted/);
  assert.match(storage, /roamTasksTaskDraft/);
  assert.match(script, /localStorage\.setItem\(storageKeys\.view, state\.view\)/);
});

test("GTD view defaults to inbox capture", async () => {
  const storage = await readFile(new URL("../public/ui-storage.js", import.meta.url), "utf8");
  const model = await readFile(new URL("../public/gtd-model.js", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(model, /export const gtdViewIds = \["inbox", "next", "waiting", "scheduled", "someday", "projects", "review"\]/);
  assert.match(storage, /return gtdViewIds\.includes\(view\) \? view : "inbox"/);
  assert.match(script, /import \{[\s\S]*gtdViewIds[\s\S]*\} from "\.\/gtd-model\.js"/);
  assert.match(script, /if \(!gtdViewIds\.includes\(nextView\)\) return/);
});

test("renderer supports local bulk categorization", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /id="bulkBar"/);
  assert.match(html, /id="selectVisibleButton"/);
  assert.doesNotMatch(html, /class="task-select-input"/);
  assert.doesNotMatch(html, /class="gtd-controls"/);
  assert.match(script, /selectedTaskIds: new Set\(\)/);
  assert.match(script, /function toggleTaskSelected\(uid\)/);
  assert.match(script, /function applyBulkChanges\(\)/);
  assert.match(script, /function bulkChanges\(\)/);
});

test("renderer wires keyboard-first GTD triage shortcuts", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(html, /id="shortcutHint"/);
  assert.match(script, /from "\.\/keyboard-triage\.js"/);
  assert.match(script, /gtdViewIds,/);
  assert.match(script, /gtdTriageViewKeys,/);
  assert.match(script, /keyboardShortcutHintVisibleMs = 6000/);
  assert.match(script, /keyboardShortcutHintFadeMs = 700/);
  assert.match(script, /window\.addEventListener\("keydown", handleGlobalKeydown\)/);
  assert.match(script, /function handleGtdTriageShortcut\(event\)/);
  assert.match(script, /key === "escape" && !els\.shortcutHint\.classList\.contains\("hidden"\)/);
  assert.match(script, /hideKeyboardShortcutHint\(\);\n    return true/);
  assert.match(script, /if \(handleTaskListKeyboardShortcut\(event\)\) return/);
  assert.match(script, /function handleTaskListKeyboardShortcut\(event\)/);
  assert.match(script, /function focusTaskByKeyboard\(direction\)/);
  assert.match(script, /nextKeyboardTaskIndex\(rows\.length, currentIndex, direction\)/);
  assert.match(script, /function toggleFocusedTaskSelection\(\)/);
  assert.match(script, /resolveKeyboardSelectionShortcut\(key\)/);
  assert.match(script, /function selectVisibleTasksByKeyboard\(\)/);
  assert.match(script, /toggleVisibleSelection\(true\)/);
  assert.match(script, /function clearSelectionByKeyboard\(\)/);
  assert.match(script, /event\.key === "Escape" && clearSelectionByKeyboard\(\)/);
  assert.match(script, /toggleTaskSelected\(uid\)/);
  assert.match(script, /focusTaskRow\(uid\)/);
  assert.match(script, /function renderKeyboardShortcutHint\(prefix\)/);
  assert.match(script, /action === "view" \? gtdTriageViewKeys : gtdTriageBucketKeys/);
  assert.match(script, /function shortcutLabel\(bucket\)/);
  assert.match(script, /function scheduleKeyboardShortcutHintFade\(\)/);
  assert.match(script, /function hideKeyboardShortcutHint\(\)/);
  assert.match(script, /function clearKeyboardShortcutHintTimers\(\)/);
  assert.match(script, /els\.shortcutHint\.replaceChildren\(label, options\)/);
  assert.match(script, /els\.shortcutHint\.classList\.add\("fading"\)/);
  assert.match(script, /hideKeyboardShortcutHint\(\);\n    if \(shortcut\.action === "view"\)/);
  assert.match(script, /void changeView\(shortcut\.bucket\)/);
  assert.match(script, /function moveKeyboardTriageTasks\(bucket\)/);
  assert.match(script, /if \(bucket === "scheduled"\) return startKeyboardScheduleTriage\(taskIds\)/);
  assert.match(script, /function startKeyboardScheduleTriage\(taskIds\)/);
  assert.match(script, /els\.bulkDateInput\.focus\(\)/);
  assert.match(script, /function applyKeyboardScheduleDate\(\)/);
  assert.match(script, /dueDate: els\.bulkDateInput\.value/);
  assert.match(script, /taskIdsForKeyboardTriage\(\{/);
  assert.match(script, /function focusedTaskId\(\)/);
  assert.match(script, /node\.dataset\.taskUid = task\.uid/);
  assert.match(styles, /\.shortcut-hint\.fading/);
  assert.match(styles, /flex-wrap: wrap/);
  assert.match(styles, /width: max-content/);
  assert.match(styles, /font-size: 16px/);
  assert.match(styles, /min-width: 32px/);
  assert.match(styles, /opacity 700ms ease/);
});

test("renderer supports dragging selected tasks into GTD buckets", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  assert.match(script, /dragTaskIds: \[\]/);
  assert.match(script, /dragBadge: null/);
  assert.match(script, /taskDragPointer: null/);
  assert.match(script, /application\/x-roam-task-ids/);
  assert.match(script, /node\.draggable = !pendingRemoval/);
  assert.match(script, /document\.addEventListener\("pointermove", moveTaskPointer\)/);
  assert.match(script, /function bindViewDropTarget\(button\)/);
  assert.match(script, /function dropStatusAt\(x, y\)/);
  assert.match(script, /function moveTasksToStatus\(taskIds, status\)/);
  assert.match(script, /const changes = triageChangesForBucket\(status\)/);
  assert.match(script, /updateLocalTask\(task, changes\)/);
  assert.match(script, /function ensureTaskDragBadge\(count\)/);
  assert.match(script, /function updateTaskDragBadge\(x, y\)/);
  assert.match(script, /dataTransfer\.setDragImage\(badge, 26, 18\)/);
  assert.match(script, /return \["inbox", "next", "waiting", "someday"\]\.includes\(status\)/);
  assert.match(script, /return status === "scheduled"/);
  assert.match(script, /if \(isDropStatus\(status\)\) moveTasksToStatus\(taskIds, status\)/);
  assert.match(css, /body\.task-drag-active \.view-button\[data-view="next"\]/);
  assert.match(css, /body\.task-drag-active \.view-button\[data-view="scheduled"\]/);
  assert.match(css, /\.view-button\.drop-target/);
  assert.match(css, /\.view-button\.drop-denied/);
  assert.match(css, /\.task-row\.dragging/);
  assert.match(css, /\.task-drag-badge/);
  assert.match(css, /\.task-drag-box-icon/);
});

test("renderer separates project and GTD bucket metadata by view", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(script, /state\.view === "projects" \? bucketLine\(task\) : projectLine\(task\)/);
  assert.match(script, /function projectLine\(task\)/);
  assert.match(script, /const line = metaLine\("project"\)/);
  assert.match(script, /function bucketLine\(task\)/);
  assert.match(script, /const line = metaLine\("bucket"\)/);
  assert.doesNotMatch(script, /metaLine\("gtd"\)/);
});

test("renderer exposes the completed-task slider only for Review", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const storage = await readFile(new URL("../public/ui-storage.js", import.meta.url), "utf8");
  const model = await readFile(new URL("../public/gtd-model.js", import.meta.url), "utf8");

  assert.match(html, /id="completedFilter"/);
  assert.match(html, /id="showCompletedToggle"/);
  assert.match(html, />Show completed</);
  assert.doesNotMatch(html, /data-view="done"/);
  assert.match(script, /showCompleted: storedUiState\.showCompleted/);
  assert.match(storage, /done: "review"/);
  assert.match(script, /function showsReviewCompletedFilter\(\)/);
  assert.match(script, /els\.completedFilter\.classList\.toggle\("hidden", !showsReviewCompletedFilter\(\)\)/);
  assert.match(model, /task\.done && !\(view === "review" && showCompleted\)/);
  assert.match(model, /includeDone: showCompleted/);
  assert.doesNotMatch(script, /state\.view === "done"/);
  assert.doesNotMatch(script, /done: "Done"/);
});

test("Someday view exposes and applies the since date selector", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const storage = await readFile(new URL("../public/ui-storage.js", import.meta.url), "utf8");
  const model = await readFile(new URL("../public/gtd-model.js", import.meta.url), "utf8");

  assert.match(html, /id="sinceInput"/);
  assert.match(storage, /sinceDate: "roamTasksSomedaySinceDate"/);
  assert.match(script, /import \{ timestampIso \}/);
  assert.match(script, /function showsSomedaySinceFilter\(\)/);
  assert.match(script, /function hasSomedaySinceDate\(\)/);
  assert.match(script, /return state\.view === "someday"/);
  assert.match(storage, /return storage\.getItem\(storageKeys\.sinceDate\) \|\| ""/);
  assert.match(script, /localStorage\.removeItem\(storageKeys\.sinceDate\)/);
  assert.match(script, /els\.toolActions\.classList\.toggle\("since-active", showsSomedaySinceFilter\(\)\)/);
  assert.match(script, /els\.sinceInput\.classList\.toggle\("hidden", !showsSomedaySinceFilter\(\)\)/);
  assert.match(model, /view === "someday" && sinceDate && !isTaskSince\(task, sinceDate\)/);
});

test("local sandbox removal is undoable until leaving the view", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(script, /confirm\(/);
  assert.match(script, /pendingRemovals: new Map\(\)/);
  assert.match(script, /function stageLocalRemoval\(task\)/);
  assert.match(script, /function undoPendingRemoval\(uid\)/);
  assert.match(script, /function commitPendingRemovalsForView\(view\)/);
  assert.match(script, /if \(nextView !== state\.view\) commitPendingRemovalsForView\(state\.view\)/);
  assert.match(script, /remove\.textContent = pendingRemoval \? "Undo" : "×"/);
});

test("Roam arrow links use the server-backed open route before protocol fallback", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(script, /event\.preventDefault\(\)/);
  assert.match(script, /await openRoamTarget\({/);
  assert.match(script, /await api\("\/api\/open"/);
  assert.doesNotMatch(script, /href\.startsWith\("roam:\/\/"\)/);
});

test("Someday empty state reflects the since date selector", async () => {
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(script, /function emptyViewMessage\(\)/);
  assert.match(script, /No someday tasks since/);
  assert.match(script, /No someday tasks\./);
  assert.doesNotMatch(script, /No open tasks since this date\./);
});
