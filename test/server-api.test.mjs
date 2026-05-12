import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createAppHandler } from "../server/index.mjs";
import { createJsonLocalStore } from "../server/local-store.mjs";

const writableGraph = {
  name: "demo",
  nickname: "demo",
  type: "hosted",
  token: "test-token",
  accessLevel: "full"
};

test("graphs endpoint returns only non-secret graph metadata and connection settings", async () => {
  const handler = appHandler({
    graphs: [
      writableGraph,
      {
        name: "other",
        nickname: "other",
        type: "offline",
        token: "other-token",
        accessLevel: "read"
      }
    ],
    roamApiHost: "host.docker.internal",
    roamPort: 4444
  });

  const response = await invoke(handler, {
    method: "GET",
    url: "/api/graphs"
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.json, {
    graphs: [
      { name: "demo", nickname: "demo", type: "hosted", accessLevel: "full" },
      { name: "other", nickname: "other", type: "offline", accessLevel: "read" }
    ],
    selectedGraph: "demo",
    port: 4444,
    roamApiHost: "host.docker.internal"
  });
  assert.equal(JSON.stringify(response.json).includes("token"), false);
});

test("health endpoint resolves graph token status without exposing graph tokens", async () => {
  let tokenGraph;
  const handler = appHandler({
    getTokenInfo: async (graph) => {
      tokenGraph = graph;
      return {
        status: "active",
        graphName: graph.name,
        graphType: graph.type,
        grantedAccessLevel: "full",
        grantedScopes: ["q"]
      };
    }
  });

  const response = await invoke(handler, {
    method: "GET",
    url: "/api/health?graph=demo"
  });

  assert.equal(response.status, 200);
  assert.equal(tokenGraph.token, "test-token");
  assert.deepEqual(response.json.graph, {
    name: "demo",
    nickname: "demo",
    type: "hosted",
    accessLevel: "full"
  });
  assert.deepEqual(response.json.token, {
    status: "active",
    graphName: "demo",
    graphType: "hosted",
    grantedAccessLevel: "full",
    grantedScopes: ["q"]
  });
  assert.equal(JSON.stringify(response.json).includes("test-token"), false);
});

test("open endpoint routes to Roam page or block actions and validates target", async () => {
  const calls = [];
  const handler = appHandler({
    roamCall: async (graph, action, args) => {
      calls.push({ graph: graph.nickname, action, args });
      return { success: true, result: {} };
    }
  });

  const block = await invoke(handler, {
    method: "POST",
    url: "/api/open",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph: "demo", uid: "abc123" })
  });
  const page = await invoke(handler, {
    method: "POST",
    url: "/api/open",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph: "demo", title: "Project A" })
  });
  const missing = await invoke(handler, {
    method: "POST",
    url: "/api/open",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph: "demo" })
  });

  assert.equal(block.status, 200);
  assert.equal(page.status, 200);
  assert.equal(missing.status, 400);
  assert.deepEqual(calls, [
    {
      graph: "demo",
      action: "ui.mainWindow.openBlock",
      args: [{ block: { uid: "abc123" } }]
    },
    {
      graph: "demo",
      action: "ui.mainWindow.openPage",
      args: [{ page: { title: "Project A" } }]
    }
  ]);
});

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

test("local GTD state is persisted outside Roam", async () => {
  let stored = { version: 1, localTasks: [], localState: {} };
  const writes = [];
  const handler = appHandler({
    localStore: {
      read: async () => stored,
      write: async (next) => {
        writes.push(next);
        stored = { version: 1, localTasks: next.localTasks, localState: next.localState };
        return stored;
      }
    }
  });

  const initial = await invoke(handler, {
    method: "GET",
    url: "/api/local-state"
  });

  assert.equal(initial.status, 200);
  assert.deepEqual(initial.json, { version: 1, localTasks: [], localState: {} });

  const saved = await invoke(handler, {
    method: "POST",
    url: "/api/local-state",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      localTasks: [{ uid: "local-1", text: "Capture locally" }],
      localState: { "roam-1": { gtdStatus: "next", project: "Launch" } }
    })
  });

  assert.equal(saved.status, 200);
  assert.deepEqual(writes, [
    {
      localTasks: [{ uid: "local-1", text: "Capture locally" }],
      localState: { "roam-1": { gtdStatus: "next", project: "Launch" } }
    }
  ]);
  assert.deepEqual(saved.json, {
    version: 1,
    localTasks: [{ uid: "local-1", text: "Capture locally" }],
    localState: { "roam-1": { gtdStatus: "next", project: "Launch" } }
  });
});

test("local GTD state recovers corrupted JSON with inspectable diagnostics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roam-tasks-api-store-"));
  try {
    const path = join(dir, "gtd-state.json");
    await writeFile(path, "{ bad json", "utf8");
    const handler = appHandler({
      localStore: createJsonLocalStore(path)
    });

    const response = await invoke(handler, {
      method: "GET",
      url: "/api/local-state"
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json.localTasks, []);
    assert.deepEqual(response.json.localState, {});
    assert.equal(response.json.version, 1);
    assert.equal(response.json.storePath, path);
    assert.equal(response.json.recovery.errorName, "SyntaxError");
    assert.equal(typeof response.json.recovery.error, "string");
    assert.notEqual(response.json.recovery.error, "");
    assert.equal(await readFile(response.json.recovery.preservedPath, "utf8"), "{ bad json");
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      version: 1,
      localTasks: [],
      localState: {}
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("local GTD state reports structurally invalid fragments without losing valid data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roam-tasks-api-store-"));
  try {
    const path = join(dir, "gtd-state.json");
    await writeFile(
      path,
      JSON.stringify({
        localTasks: [{ uid: "local-1", text: "Keep local task" }],
        localState: {
          "roam-1": { gtdStatus: "next", project: "Launch" },
          "roam-2": "bad overlay"
        }
      }),
      "utf8"
    );
    const handler = appHandler({
      localStore: createJsonLocalStore(path)
    });

    const response = await invoke(handler, {
      method: "GET",
      url: "/api/local-state"
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.json.localTasks, [{ uid: "local-1", text: "Keep local task" }]);
    assert.deepEqual(response.json.localState, {
      "roam-1": { gtdStatus: "next", project: "Launch" }
    });
    assert.equal(response.json.version, 1);
    assert.equal(response.json.storePath, path);
    assert.equal(response.json.recovery.errorName, "LocalStoreStructureError");
    assert.match(response.json.recovery.error, /structurally invalid/);
    assert.match(response.json.recovery.error, /localState\["roam-2"\]/);

    const preserved = JSON.parse(await readFile(response.json.recovery.preservedPath, "utf8"));
    assert.deepEqual(preserved.invalidFragments, [
      {
        path: 'localState["roam-2"]',
        reason: "Expected localState overlay entries to be objects.",
        value: "bad overlay"
      }
    ]);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      version: 1,
      localTasks: [{ uid: "local-1", text: "Keep local task" }],
      localState: {
        "roam-1": { gtdStatus: "next", project: "Launch" }
      }
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Roam task data mutations are not exposed by the local-first API", async () => {
  let calls = 0;
  const handler = appHandler({
    roamCall: async () => {
      calls += 1;
      return { success: true, result: {} };
    }
  });

  const createResponse = await invoke(handler, {
    method: "POST",
    url: "/api/tasks",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph: "demo", text: "Write back to Roam" })
  });
  const updateResponse = await invoke(handler, {
    method: "PATCH",
    url: "/api/tasks/abc123",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph: "demo", done: true })
  });
  const deleteResponse = await invoke(handler, {
    method: "DELETE",
    url: "/api/tasks/abc123",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ graph: "demo" })
  });

  assert.equal(createResponse.status, 404);
  assert.equal(updateResponse.status, 404);
  assert.equal(deleteResponse.status, 404);
  assert.equal(calls, 0);
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
    getRoamPort: async () => options.roamPort || 3333,
    getTokenInfo: options.getTokenInfo || (async () => ({ status: "active" })),
    localStore: options.localStore,
    roamApiHost: options.roamApiHost,
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
