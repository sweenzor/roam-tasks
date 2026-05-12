import test from "node:test";
import assert from "node:assert/strict";
import { installFakeBrowser, jsonResponse } from "./fake-browser.mjs";

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
    await import(`${new URL("../public/app.js", import.meta.url).href}?runtime=${Date.now()}`);
    await waitFor(() => browser.ids.localStoreNoticeTitle.textContent === "Local sandbox fallback");

    assert.equal(browser.ids.setupPanel.classList.contains("hidden"), false);
    assert.equal(browser.ids.localStoreNotice.classList.contains("hidden"), false);
    assert.equal(browser.ids.localStoreNoticeTitle.textContent, "Local sandbox fallback");
    assert.equal(browser.ids.taskList.children[0].textContent, "Capture a task to start.");
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
