import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAppHandler } from "../server/index.mjs";

const writableGraph = {
  name: "demo",
  nickname: "demo",
  type: "hosted",
  token: "test-token",
  accessLevel: "full"
};

test("rejects cross-origin write requests before calling Roam", async () => {
  let calls = 0;
  const handler = appHandler({
    roamCall: async () => {
      calls += 1;
      return { success: true, result: {} };
    }
  });

  const response = await invoke(handler, {
    method: "POST",
    url: "/api/tasks",
    headers: {
      "content-type": "application/json",
      origin: "http://malicious.example"
    },
    body: JSON.stringify({ graph: "demo", text: "Ship it" })
  });

  assert.equal(response.status, 403);
  assert.equal(response.json.code, "FORBIDDEN");
  assert.equal(calls, 0);
});

test("rejects non-json write requests before calling Roam", async () => {
  let calls = 0;
  const handler = appHandler({
    roamCall: async () => {
      calls += 1;
      return { success: true, result: {} };
    }
  });

  const response = await invoke(handler, {
    method: "POST",
    url: "/api/tasks",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ graph: "demo", text: "Ship it" })
  });

  assert.equal(response.status, 415);
  assert.equal(response.json.code, "UNSUPPORTED_MEDIA_TYPE");
  assert.equal(calls, 0);
});

test("rejects write requests addressed to non-local hosts", async () => {
  const handler = appHandler();

  const response = await invoke(handler, {
    method: "POST",
    url: "/api/tasks",
    host: "192.168.1.20:5874",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph: "demo", text: "Ship it" })
  });

  assert.equal(response.status, 403);
  assert.equal(response.json.code, "FORBIDDEN");
});

test("patch reads the current Roam block before updating", async () => {
  const actions = [];
  let updatedString = "";
  const handler = appHandler({
    roamCall: async (_graph, action, args) => {
      actions.push(action);
      if (action === "q") {
        return {
          success: true,
          result: [["{{[[TODO]]}} Current copy [[New Page]]"]]
        };
      }
      if (action === "data.block.update") {
        updatedString = args[0].block.string;
        return { success: true, result: {} };
      }
      return { success: true, result: {} };
    }
  });

  const response = await invoke(handler, {
    method: "PATCH",
    url: "/api/tasks/abc123",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      graph: "demo",
      raw: "{{[[TODO]]}} Stale copy",
      done: true,
      pageTitle: "Projects"
    })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(actions, ["q", "data.block.update"]);
  assert.equal(updatedString, "{{[[DONE]]}} Current copy [[New Page]]");
});

test("tasks endpoint only fetches completed statuses when requested", async () => {
  const statusesWithoutDone = [];
  const withoutDone = appHandler({
    roamCall: async (_graph, action, args) => taskRowsForQuery(action, args, statusesWithoutDone)
  });

  const leanResponse = await invoke(withoutDone, {
    method: "GET",
    url: "/api/tasks?graph=demo&includeDone=false"
  });

  assert.equal(leanResponse.status, 200);
  assert.deepEqual(statusesWithoutDone, ["TODO"]);
  assert.deepEqual(leanResponse.json.tasks.map((task) => task.status), ["todo"]);

  const statusesWithDone = [];
  const withDone = appHandler({
    roamCall: async (_graph, action, args) => taskRowsForQuery(action, args, statusesWithDone)
  });

  const fullResponse = await invoke(withDone, {
    method: "GET",
    url: "/api/tasks?graph=demo&includeDone=true"
  });

  assert.equal(fullResponse.status, 200);
  assert.deepEqual(statusesWithDone, ["TODO", "DONE", "Abandoned"]);
  assert.deepEqual(
    fullResponse.json.tasks.map((task) => task.status).sort(),
    ["abandoned", "done", "todo"]
  );
});

test("tasks endpoint includes direct child bullets as task details", async () => {
  const handler = appHandler({
    roamCall: async (_graph, action, args) => {
      if (action !== "q") return { success: true, result: {} };

      const [query, input] = args;
      if (input === "TODO") {
        return {
          success: true,
          result: [["todo1", "{{[[TODO]]}} Parent task", "Projects", "project1", 1, 2]]
        };
      }
      if (["DONE", "Abandoned"].includes(input)) return { success: true, result: [] };
      if (Array.isArray(input) && query.includes("?child-string")) {
        return {
          success: true,
          result: [
            ["todo1", "child2", "Second detail", 1],
            ["todo1", "child1", "First detail", 0]
          ]
        };
      }
      return { success: true, result: [] };
    }
  });

  const response = await invoke(handler, {
    method: "GET",
    url: "/api/tasks?graph=demo&includeDone=false"
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.json.tasks[0].details, [
    { uid: "child1", string: "First detail" },
    { uid: "child2", string: "Second detail" }
  ]);
});

function appHandler(options = {}) {
  return createAppHandler({
    getConfiguredGraphs: async () => options.graphs || [writableGraph],
    getRoamPort: async () => 3333,
    getTokenInfo: async () => ({ status: "active" }),
    roamCall: options.roamCall || (async () => ({ success: true, result: {} }))
  });
}

async function invoke(handler, options) {
  const request = Readable.from(options.body ? [Buffer.from(options.body)] : []);
  request.method = options.method;
  request.url = options.url;
  request.headers = {
    host: options.host || "127.0.0.1:5874",
    ...(options.headers || {})
  };

  const response = {
    body: "",
    headers: {},
    statusCode: 200,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = "") {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    }
  };

  await handler(request, response);
  return {
    body: response.body,
    headers: response.headers,
    json: response.body ? JSON.parse(response.body) : null,
    status: response.statusCode
  };
}

function taskRowsForQuery(action, args, statuses) {
  if (action !== "q") return { success: true, result: {} };
  const [, input] = args;
  if (Array.isArray(input)) return { success: true, result: [] };
  if (!["TODO", "DONE", "Abandoned"].includes(input)) return { success: true, result: [] };

  statuses.push(input);
  return {
    success: true,
    result: [
      [
        `${input.toLowerCase()}1`,
        `{{[[${input}]]}} ${input} task`,
        "Projects",
        "project1",
        1,
        2
      ]
    ]
  };
}
