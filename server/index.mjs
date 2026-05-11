import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJsonLocalStore } from "./local-store.mjs";
import { readTasks } from "./task-reader.mjs";
import { badRequest, forbidden, unsupportedMediaType } from "./http-errors.mjs";
import {
  defaultRoamApiHost,
  getConfiguredGraphs,
  getRoamPort,
  getTokenInfo,
  resolveGraph,
  roamCall,
  sanitizeGraph,
  selectDefaultGraph
} from "./roam-client.mjs";
import { serveStatic } from "./static-files.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(__dirname, "..");
const publicDir = join(rootDir, "public");
const appPort = Number(process.env.PORT) || 5874;
const listenHost = process.env.HOST || "127.0.0.1";

export function createAppHandler(options = {}) {
  const context = createRuntime(options);
  return async function appHandler(request, response) {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

      if (url.pathname.startsWith("/api/")) {
        validateApiRequest(request, url);
        await handleApi(request, response, url, context);
        return;
      }

      await serveStatic(response, url.pathname, context);
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        error: error.message || "Unexpected server error",
        code: error.code || "SERVER_ERROR"
      });
    }
  };
}

export function createAppServer(options = {}) {
  return createServer(createAppHandler(options));
}

export const server = createAppServer();

function createRuntime(options = {}) {
  return {
    publicDir: options.publicDir || publicDir,
    roamApiHost: options.roamApiHost || defaultRoamApiHost,
    getConfiguredGraphs: options.getConfiguredGraphs || getConfiguredGraphs,
    getRoamPort: options.getRoamPort || getRoamPort,
    getTokenInfo: options.getTokenInfo || getTokenInfo,
    localStore: options.localStore || createJsonLocalStore(options.localStorePath),
    roamCall: options.roamCall || roamCall
  };
}

function validateApiRequest(request, url) {
  if (!isMutationMethod(request.method)) return;

  if (!isLocalHost(request.headers.host)) {
    throw forbidden("Write requests are only accepted from localhost.");
  }

  const origin = headerValue(request.headers.origin);
  if (origin && normalizeOrigin(origin) !== url.origin) {
    throw forbidden("Write requests must come from the app origin.");
  }

  const fetchSite = headerValue(request.headers["sec-fetch-site"]).toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw forbidden("Cross-site write requests are not allowed.");
  }

  if (!isJsonContentType(request.headers["content-type"])) {
    throw unsupportedMediaType("Write requests must use application/json.");
  }
}

function isMutationMethod(method = "") {
  return ["POST", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function isLocalHost(hostHeader = "") {
  const host = headerValue(hostHeader).trim().toLowerCase();
  if (!host) return false;

  const hostname = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0];

  return hostname === "localhost" || hostname === "::1" || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    return "";
  }
}

function isJsonContentType(contentType) {
  const type = headerValue(contentType).split(";")[0].trim().toLowerCase();
  return type === "application/json" || type.endsWith("+json");
}

function headerValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export function startServer({ port = appPort, host = listenHost, ...runtimeOptions } = {}) {
  return new Promise((resolve, reject) => {
    const activeServer = Object.keys(runtimeOptions).length ? createAppServer(runtimeOptions) : server;
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      const address = activeServer.address();
      const resolvedPort = typeof address === "object" && address ? address.port : port;
      const urlHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      resolve({
        server: activeServer,
        host,
        port: resolvedPort,
        url: `http://${urlHost}:${resolvedPort}`
      });
    };
    const cleanup = () => {
      activeServer.off("error", onError);
      activeServer.off("listening", onListening);
    };

    activeServer.once("error", onError);
    activeServer.once("listening", onListening);
    activeServer.listen(port, host);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer()
    .then(({ port }) => {
      console.log(`Roam Tasks running at http://localhost:${port}`);
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}

async function handleApi(request, response, url, context) {
  if (request.method === "GET" && url.pathname === "/api/graphs") {
    const graphs = await context.getConfiguredGraphs();
    const selectedGraph = selectDefaultGraph(graphs);
    sendJson(response, 200, {
      graphs: graphs.map(sanitizeGraph),
      selectedGraph: selectedGraph?.nickname ?? selectedGraph?.name ?? null,
      port: await context.getRoamPort(),
      roamApiHost: context.roamApiHost
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const graph = await resolveGraph(context, url.searchParams.get("graph"));
    const token = await context.getTokenInfo(graph, context);
    sendJson(response, 200, {
      graph: sanitizeGraph(graph),
      token,
      port: await context.getRoamPort(),
      roamApiHost: context.roamApiHost
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/local-state") {
    const localState = await context.localStore.read();
    sendJson(response, 200, localStoreResponse(context, localState));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/local-state") {
    const body = await readJsonBody(request);
    const localState = await context.localStore.write(body);
    sendJson(response, 200, localStoreResponse(context, localState));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tasks") {
    const graph = await resolveGraph(context, url.searchParams.get("graph"));
    const includeDone = url.searchParams.get("includeDone") !== "false";
    const tasks = await readTasks(context, graph, { includeDone });
    sendJson(response, 200, {
      tasks,
      queriedAt: new Date().toISOString()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/open") {
    const body = await readJsonBody(request);
    const graph = await resolveGraph(context, body.graph);

    if (body.uid) {
      await context.roamCall(graph, "ui.mainWindow.openBlock", [{ block: { uid: String(body.uid) } }], context);
      sendJson(response, 200, { success: true });
      return;
    }

    if (body.title) {
      await context.roamCall(graph, "ui.mainWindow.openPage", [{ page: { title: String(body.title) } }], context);
      sendJson(response, 200, { success: true });
      return;
    }

    throw badRequest("A page title or block UID is required.");
  }

  sendJson(response, 404, { error: "Unknown API route." });
}

async function readJsonBody(request, allowEmpty = false) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1_000_000) throw badRequest("Request body is too large.");
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

function localStoreResponse(context, localState) {
  const info = context.localStore.info?.() || {};
  const storePath = info.filePath || context.localStore.filePath;
  const diagnostics = {
    ...(storePath ? { storePath } : {}),
    ...(info.recovery ? { recovery: info.recovery } : {})
  };
  return {
    ...localState,
    ...diagnostics
  };
}
