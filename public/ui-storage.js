import { gtdViewIds } from "./gtd-model.js";

export const storageKeys = {
  compact: "roamTasksCompact",
  legacyLocalState: "roamTasksLocalGtdState",
  legacyLocalTasks: "roamTasksLocalGtdTasks",
  legacySinceDate: "roamTasksSinceDate",
  legacySinceHideDone: "roamTasksSinceHideDone",
  pageDraft: "roamTasksPageDraft",
  query: "roamTasksQuery",
  sinceDate: "roamTasksSomedaySinceDate",
  showCompleted: "roamTasksShowCompleted",
  sort: "roamTasksSort",
  taskDraft: "roamTasksTaskDraft",
  view: "roamTasksView"
};

const legacyViewMap = Object.freeze({
  done: "review",
  overdue: "scheduled",
  since: "someday",
  today: "scheduled",
  upcoming: "scheduled"
});

export function loadStoredUiState(storage = localStorage) {
  migrateLegacyStoredPreferences(storage);

  return {
    compact: loadCompact(storage),
    query: loadQuery(storage),
    showCompleted: loadShowCompleted(storage),
    sinceDate: loadSinceDate(storage),
    sort: loadSort(storage),
    view: loadView(storage)
  };
}

export function migrateLegacyStoredPreferences(storage = localStorage) {
  const legacyView = storage.getItem(storageKeys.view);

  if (Object.hasOwn(legacyViewMap, legacyView)) {
    storage.setItem(storageKeys.view, legacyViewMap[legacyView]);

    if (legacyView === "done" && storage.getItem(storageKeys.showCompleted) === null) {
      storage.setItem(storageKeys.showCompleted, "true");
    }

    if (
      legacyView === "since" &&
      storage.getItem(storageKeys.legacySinceHideDone) === "false" &&
      storage.getItem(storageKeys.showCompleted) === null
    ) {
      storage.setItem(storageKeys.showCompleted, "true");
    }
  }

  if (storage.getItem(storageKeys.sinceDate) === null) {
    const legacySinceDate = storage.getItem(storageKeys.legacySinceDate);
    if (isIsoDate(legacySinceDate)) storage.setItem(storageKeys.sinceDate, legacySinceDate);
  }

  if (storage.getItem(storageKeys.sort) === "page") {
    storage.setItem(storageKeys.sort, "project");
  }
}

export function loadSinceDate(storage = localStorage) {
  return storage.getItem(storageKeys.sinceDate) || "";
}

export function loadShowCompleted(storage = localStorage) {
  return storage.getItem(storageKeys.showCompleted) === "true";
}

export function loadCompact(storage = localStorage) {
  return storage.getItem(storageKeys.compact) === "true";
}

export function loadView(storage = localStorage) {
  const view = storage.getItem(storageKeys.view);
  return gtdViewIds.includes(view) ? view : "inbox";
}

export function loadQuery(storage = localStorage) {
  return (storage.getItem(storageKeys.query) || "").trim().toLowerCase();
}

export function loadSort(storage = localStorage) {
  const sort = storage.getItem(storageKeys.sort);
  return ["recent", "due", "project", "updated"].includes(sort) ? sort : "recent";
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
