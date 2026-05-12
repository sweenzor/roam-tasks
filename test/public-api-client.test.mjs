import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../public/api-client.js";

test("browser API helper sends JSON mutations and returns parsed data", async () => {
  let request;
  const data = await api("/api/local-state", {
    method: "POST",
    body: { localTasks: [] },
    fetch: async (path, options) => {
      request = { path, options };
      return jsonResponse({ ok: true });
    }
  });

  assert.deepEqual(data, { ok: true });
  assert.equal(request.path, "/api/local-state");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(request.options.headers, { "Content-Type": "application/json" });
  assert.equal(request.options.body, JSON.stringify({ localTasks: [] }));
});

test("browser API helper reports server error messages", async () => {
  await assert.rejects(
    api("/api/tasks", {
      fetch: async () => jsonResponse({ error: "No graph configured" }, { ok: false, status: 400 })
    }),
    /No graph configured/
  );
});

test("browser API helper maps aborted refreshes to a user-facing timeout", async () => {
  const aborted = new Error("aborted");
  aborted.name = "AbortError";

  await assert.rejects(
    api("/api/tasks", {
      fetch: async () => {
        throw aborted;
      }
    }),
    /Roam refresh timed out/
  );
});

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body
  };
}
