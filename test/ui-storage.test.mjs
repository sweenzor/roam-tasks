import test from "node:test";
import assert from "node:assert/strict";
import {
  loadStoredUiState,
  migrateLegacyStoredPreferences,
  storageKeys
} from "../public/ui-storage.js";

test("legacy date-based task views migrate to the current Scheduled GTD view", () => {
  for (const legacyView of ["today", "overdue", "upcoming"]) {
    const storage = new FakeStorage({ [storageKeys.view]: legacyView });

    assert.equal(loadStoredUiState(storage).view, "scheduled");
    assert.equal(storage.getItem(storageKeys.view), "scheduled");
  }
});

test("legacy Done view opens Review with completed tasks enabled when no newer setting exists", () => {
  const storage = new FakeStorage({ [storageKeys.view]: "done" });

  assert.deepEqual(loadStoredUiState(storage), {
    compact: false,
    query: "",
    showCompleted: true,
    sinceDate: "",
    sort: "recent",
    view: "review"
  });
  assert.equal(storage.getItem(storageKeys.view), "review");
  assert.equal(storage.getItem(storageKeys.showCompleted), "true");
});

test("legacy Done view does not overwrite an explicit current completed-task setting", () => {
  const storage = new FakeStorage({
    [storageKeys.view]: "done",
    [storageKeys.showCompleted]: "false"
  });

  assert.equal(loadStoredUiState(storage).view, "review");
  assert.equal(storage.getItem(storageKeys.showCompleted), "false");
});

test("legacy Since view migrates to Someday and carries the old since date forward", () => {
  const storage = new FakeStorage({
    [storageKeys.view]: "since",
    [storageKeys.legacySinceDate]: "2026-04-01"
  });

  const uiState = loadStoredUiState(storage);

  assert.equal(uiState.view, "someday");
  assert.equal(uiState.sinceDate, "2026-04-01");
  assert.equal(storage.getItem(storageKeys.view), "someday");
  assert.equal(storage.getItem(storageKeys.sinceDate), "2026-04-01");
});

test("legacy Since include-completed preference carries into the current completed filter", () => {
  const storage = new FakeStorage({
    [storageKeys.view]: "since",
    [storageKeys.legacySinceHideDone]: "false"
  });

  assert.equal(loadStoredUiState(storage).showCompleted, true);
  assert.equal(storage.getItem(storageKeys.showCompleted), "true");
});

test("legacy Since date and Page sort aliases do not replace current values", () => {
  const storage = new FakeStorage({
    [storageKeys.legacySinceDate]: "2026-04-01",
    [storageKeys.sinceDate]: "2026-05-01",
    [storageKeys.sort]: "page",
    [storageKeys.view]: "next"
  });

  const uiState = loadStoredUiState(storage);

  assert.equal(uiState.view, "next");
  assert.equal(uiState.sinceDate, "2026-05-01");
  assert.equal(uiState.sort, "project");
  assert.equal(storage.getItem(storageKeys.sinceDate), "2026-05-01");
  assert.equal(storage.getItem(storageKeys.sort), "project");
});

test("legacy preference migration ignores unusable since dates", () => {
  const storage = new FakeStorage({ [storageKeys.legacySinceDate]: "last month" });

  migrateLegacyStoredPreferences(storage);

  assert.equal(storage.getItem(storageKeys.sinceDate), null);
});

class FakeStorage {
  #values;

  constructor(values = {}) {
    this.#values = new Map(Object.entries(values));
  }

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}
