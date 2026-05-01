import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  ensureTodoString,
  formatRoamDailyDate,
  normalizeTasks,
  taskStringWithStatus,
  taskStringWithText
} from "./task-utils.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(__dirname, "..");
const publicDir = join(rootDir, "public");
const appPort = Number(process.env.PORT) || 5174;
const listenHost = process.env.HOST || "127.0.0.1";
const roamApiHost = process.env.ROAM_LOCAL_API_HOST || "127.0.0.1";
const defaultGraphKey = process.env.ROAM_DEFAULT_GRAPH;
const expectedApiVersion = "1.1.2";

const taskQuery = `[:find ?uid ?string ?page-title ?page-uid
  :in $ ?needle
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]
  [(clojure.string/includes? ?string ?needle)]
  [?b :block/page ?p]
  [?p :node/title ?page-title]
  [?p :block/uid ?page-uid]]`;

const uidQuery = `[:find ?string
  :in $ ?uid
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]]`;

const blockStringQuery = `[:find ?uid ?string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]]`;

const directParentQuery = `[:find ?child-uid ?parent-uid ?parent-string
  :in $ [?child-uid ...]
  :where
  [?b :block/uid ?child-uid]
  [?p :block/children ?b]
  [?p :block/uid ?parent-uid]
  [?p :block/string ?parent-string]]`;

const pageUidQuery = `[:find ?title ?uid
  :in $ [?title ...]
  :where
  [?p :node/title ?title]
  [?p :block/uid ?uid]]`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.message || "Unexpected server error",
      code: error.code || "SERVER_ERROR"
    });
  }
});

server.listen(appPort, listenHost, () => {
  console.log(`Roam Tasks running at http://localhost:${appPort}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/graphs") {
    const graphs = await getConfiguredGraphs();
    const selectedGraph = selectDefaultGraph(graphs);
    sendJson(response, 200, {
      graphs: graphs.map(sanitizeGraph),
      selectedGraph: selectedGraph?.nickname ?? selectedGraph?.name ?? null,
      port: await getRoamPort(),
      roamApiHost
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const graph = await resolveGraph(url.searchParams.get("graph"));
    const token = await getTokenInfo(graph);
    sendJson(response, 200, {
      graph: sanitizeGraph(graph),
      token,
      port: await getRoamPort(),
      roamApiHost
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    const graph = await resolveGraph(url.searchParams.get("graph"));
    const includeDone = url.searchParams.get("includeDone") !== "false";
    const rows = await readTaskRows(graph, includeDone);
    const tasks = normalizeTasks(rows);
    await enrichTaskPageUids(graph, tasks);
    await enrichTaskBlockRefs(graph, tasks);
    await enrichTaskBreadcrumbs(graph, tasks);
    sendJson(response, 200, {
      tasks,
      queriedAt: new Date().toISOString()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/open") {
    const body = await readJsonBody(request);
    const graph = await resolveGraph(body.graph);

    if (body.uid) {
      await roamCall(graph, "ui.mainWindow.openBlock", [{ block: { uid: String(body.uid) } }]);
      sendJson(response, 200, { success: true });
      return;
    }

    if (body.title) {
      await roamCall(graph, "ui.mainWindow.openPage", [{ page: { title: String(body.title) } }]);
      sendJson(response, 200, { success: true });
      return;
    }

    throw badRequest("A page title or block UID is required.");
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(request);
    const graph = await resolveGraph(body.graph);
    const text = String(body.text || "").trim();
    if (!text) throw badRequest("Task text is required.");

    const location = { order: body.order ?? "last" };
    if (body.pageTitle) {
      location["page-title"] = String(body.pageTitle);
    } else {
      location["page-title"] = {
        "daily-note-page": body.dailyNoteDate || formatRoamDailyDate()
      };
    }

    const result = await roamCall(graph, "data.block.fromMarkdown", [
      {
        location,
        "markdown-string": ensureTodoString(text)
      }
    ]);

    sendJson(response, 201, { result: result.result ?? { uids: [] } });
    return;
  }

  const taskUidMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskUidMatch && request.method === "PATCH") {
    const uid = decodeURIComponent(taskUidMatch[1]);
    const body = await readJsonBody(request);
    const graph = await resolveGraph(body.graph);
    const current = body.raw || (await getBlockString(graph, uid));
    let next = current;

    if (typeof body.text === "string") {
      next = taskStringWithText(next, body.text, body.done);
    }
    if (typeof body.done === "boolean") {
      next = taskStringWithStatus(next, body.done);
    }

    await roamCall(graph, "data.block.update", [{ block: { uid, string: next } }]);
    sendJson(response, 200, { task: normalizeTasks([[uid, next, body.pageTitle || "", 0, Date.now()]])[0] });
    return;
  }

  if (taskUidMatch && request.method === "DELETE") {
    const uid = decodeURIComponent(taskUidMatch[1]);
    const body = await readJsonBody(request, true);
    const graph = await resolveGraph(body.graph);
    await roamCall(graph, "data.block.delete", [{ block: { uid } }]);
    sendJson(response, 200, { success: true });
    return;
  }

  sendJson(response, 404, { error: "Unknown API route." });
}

async function readTaskRows(graph, includeDone) {
  const todo = await roamCall(graph, "q", [taskQuery, "TODO"]);
  const rows = [...coerceRows(todo.result)];

  if (includeDone) {
    const done = await roamCall(graph, "q", [taskQuery, "DONE"]);
    rows.push(...coerceRows(done.result));
  }

  return rows;
}

async function getBlockString(graph, uid) {
  const result = await roamCall(graph, "q", [uidQuery, uid]);
  const row = coerceRows(result.result)[0];
  if (!row?.[0]) throw notFound("Could not find that Roam block.");
  return row[0];
}

async function enrichTaskPageUids(graph, tasks) {
  const titles = new Set();

  for (const task of tasks) {
    if (task.pageTitle && !task.pageUids?.[task.pageTitle]) titles.add(task.pageTitle);
    for (const title of [...(task.pages || []), ...(task.tags || [])]) {
      if (title && !task.pageUids?.[title]) titles.add(title);
    }
  }

  const pageUids = await resolvePageUids(graph, [...titles]);
  for (const task of tasks) {
    task.pageUids = { ...(task.pageUids || {}) };
    for (const title of [task.pageTitle, ...(task.pages || []), ...(task.tags || [])]) {
      if (title && pageUids[title]) task.pageUids[title] = pageUids[title];
    }
  }
}

async function enrichTaskBlockRefs(graph, tasks) {
  const uids = new Set();

  for (const task of tasks) {
    for (const uid of task.blockRefs || []) {
      if (uid && !task.blockStrings?.[uid]) uids.add(uid);
    }
  }

  const blockStrings = await resolveBlockStrings(graph, [...uids]);
  for (const task of tasks) {
    task.blockStrings = { ...(task.blockStrings || {}) };
    for (const uid of task.blockRefs || []) {
      if (uid && blockStrings[uid]) task.blockStrings[uid] = blockStrings[uid];
    }
  }
}

async function resolveBlockStrings(graph, uids) {
  if (!uids.length) return {};

  try {
    const response = await roamCall(graph, "q", [blockStringQuery, uids]);
    return Object.fromEntries(coerceRows(response.result).filter((row) => row[0] && row[1]));
  } catch {
    const entries = await Promise.all(
      uids.map(async (uid) => {
        try {
          return [uid, await getBlockString(graph, uid)];
        } catch {
          return null;
        }
      })
    );
    return Object.fromEntries(entries.filter(Boolean));
  }
}

async function enrichTaskBreadcrumbs(graph, tasks) {
  const maxDepth = 6;
  const parentByChild = new Map();
  const seen = new Set();
  let frontier = tasks.map((task) => task.uid).filter(Boolean);

  for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
    const nextFrontier = [];
    for (const uid of frontier) seen.add(uid);

    const parents = await resolveDirectParents(graph, frontier);
    for (const parent of parents) {
      if (!parentByChild.has(parent.childUid)) parentByChild.set(parent.childUid, parent);
      if (!seen.has(parent.uid)) nextFrontier.push(parent.uid);
    }

    frontier = [...new Set(nextFrontier)];
  }

  for (const task of tasks) {
    const chain = [];
    const visited = new Set([task.uid]);
    let currentUid = task.uid;

    while (parentByChild.has(currentUid) && chain.length < maxDepth) {
      const parent = parentByChild.get(currentUid);
      if (visited.has(parent.uid)) break;
      visited.add(parent.uid);
      chain.push({ uid: parent.uid, string: parent.string });
      currentUid = parent.uid;
    }

    task.breadcrumb = chain.reverse();
  }
}

async function resolveDirectParents(graph, childUids) {
  if (!childUids.length) return [];

  try {
    const response = await roamCall(graph, "q", [directParentQuery, childUids]);
    return coerceRows(response.result)
      .filter((row) => row[0] && row[1] && row[2])
      .map((row) => ({
        childUid: row[0],
        uid: row[1],
        string: row[2]
      }));
  } catch {
    return [];
  }
}

async function resolvePageUids(graph, titles) {
  if (!titles.length) return {};

  try {
    const response = await roamCall(graph, "q", [pageUidQuery, titles]);
    return Object.fromEntries(coerceRows(response.result).filter((row) => row[0] && row[1]));
  } catch {
    const entries = await Promise.all(
      titles.map(async (title) => {
        try {
          const response = await roamCall(graph, "q", [
            "[:find ?uid :in $ ?title :where [?p :node/title ?title] [?p :block/uid ?uid]]",
            title
          ]);
          const uid = coerceRows(response.result)[0]?.[0];
          return uid ? [title, uid] : null;
        } catch {
          return null;
        }
      })
    );
    return Object.fromEntries(entries.filter(Boolean));
  }
}

async function roamCall(graph, action, args = []) {
  const port = await getRoamPort();
  const params = graph.type === "offline" ? "?type=offline" : "";
  const url = `http://${roamApiHost}:${port}/api/${encodeURIComponent(graph.name)}${params}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${graph.token}`
      },
      body: JSON.stringify({ action, args, expectedApiVersion }),
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    throw serviceUnavailable(
      "Could not connect to Roam Desktop. Open Roam Desktop, open the graph, then retry."
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    const message =
      data?.error?.message ||
      data?.error ||
      `Roam API request failed with HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status === 401 || response.status === 403 ? response.status : 502;
    error.code = data?.error?.code || "ROAM_API_ERROR";
    throw error;
  }

  return data;
}

async function getTokenInfo(graph) {
  const port = await getRoamPort();
  try {
    const response = await fetch(`http://${roamApiHost}:${port}/api/graphs/tokens/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: graph.token,
        graph: graph.name,
        type: graph.type
      }),
      signal: AbortSignal.timeout(5000)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) return { status: "unknown" };
    return {
      status: "active",
      graphName: data.graphName,
      graphType: data.graphType,
      grantedAccessLevel: data.grantedAccessLevel,
      grantedScopes: data.grantedScopes
    };
  } catch {
    return { status: "unknown" };
  }
}

async function getConfiguredGraphs() {
  const envGraph = readEnvGraph();
  const fileConfig = await readJson(join(homedir(), ".roam-tools.json"));
  const fileGraphs = Array.isArray(fileConfig?.graphs) ? fileConfig.graphs : [];
  const graphs = [...fileGraphs, ...(envGraph ? [envGraph] : [])]
    .filter((graph) => graph?.name && graph?.token)
    .map((graph, index) => ({
      name: graph.name,
      nickname: graph.nickname || graph.name || `graph-${index + 1}`,
      type: graph.type === "offline" ? "offline" : "hosted",
      token: graph.token,
      accessLevel: graph.accessLevel
    }));

  return dedupeGraphs(graphs);
}

async function resolveGraph(key) {
  const graphs = await getConfiguredGraphs();
  if (graphs.length === 0) {
    throw badRequest(
      "No Roam graph is configured. Run `npx @roam-research/roam-mcp connect` or set ROAM_GRAPH and ROAM_LOCAL_API_TOKEN."
    );
  }

  if (!key && graphs.length === 1) return graphs[0];
  if (!key) return selectDefaultGraph(graphs);

  const graph = graphs.find((candidate) => candidate.nickname === key || candidate.name === key);
  if (!graph) throw notFound(`No configured Roam graph matched "${key}".`);
  return graph;
}

function selectDefaultGraph(graphs) {
  if (!graphs.length) return null;
  if (!defaultGraphKey) return graphs[0];
  return (
    graphs.find((candidate) => candidate.nickname === defaultGraphKey || candidate.name === defaultGraphKey) ||
    graphs[0]
  );
}

function readEnvGraph() {
  if (!process.env.ROAM_GRAPH || !process.env.ROAM_LOCAL_API_TOKEN) return null;
  return {
    name: process.env.ROAM_GRAPH,
    nickname: process.env.ROAM_GRAPH_NICKNAME || "env",
    type: process.env.ROAM_GRAPH_TYPE || "hosted",
    token: process.env.ROAM_LOCAL_API_TOKEN,
    accessLevel: process.env.ROAM_ACCESS_LEVEL
  };
}

async function getRoamPort() {
  if (process.env.ROAM_LOCAL_API_PORT) return Number(process.env.ROAM_LOCAL_API_PORT);
  const config = await readJson(join(homedir(), ".roam-local-api.json"));
  return Number(config?.port) || 3333;
}

function sanitizeGraph(graph) {
  return {
    name: graph.name,
    nickname: graph.nickname,
    type: graph.type,
    accessLevel: graph.accessLevel
  };
}

function dedupeGraphs(graphs) {
  const seen = new Set();
  return graphs.filter((graph) => {
    const key = `${graph.name}:${graph.type}:${graph.nickname}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function coerceRows(result) {
  if (!Array.isArray(result)) return [];
  return result.filter(Array.isArray);
}

async function serveStatic(response, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requestPath);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw notFound("Not found");

    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    const indexPath = join(publicDir, "index.html");
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    createReadStream(indexPath).pipe(response);
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readJsonBody(request, allowEmpty = false) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1_000_000) throw badRequest("Request body is too large.");
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw && allowEmpty) return {};
  if (!raw) throw badRequest("JSON body is required.");

  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Invalid JSON body.");
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "BAD_REQUEST";
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

function serviceUnavailable(message) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = "ROAM_UNAVAILABLE";
  return error;
}
