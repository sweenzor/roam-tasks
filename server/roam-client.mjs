import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { badRequest, notFound, serviceUnavailable } from "./http-errors.mjs";

export const defaultRoamApiHost = process.env.ROAM_LOCAL_API_HOST || "127.0.0.1";

const defaultGraphKey = process.env.ROAM_DEFAULT_GRAPH;
const expectedApiVersion = "1.1.2";

export async function roamCall(graph, action, args = [], context = {}) {
  const port = await (context.getRoamPort || getRoamPort)();
  const host = context.roamApiHost || defaultRoamApiHost;
  const params = graph.type === "offline" ? "?type=offline" : "";
  const url = `http://${host}:${port}/api/${encodeURIComponent(graph.name)}${params}`;

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
  } catch {
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

export async function getTokenInfo(graph, context = {}) {
  const port = await (context.getRoamPort || getRoamPort)();
  const host = context.roamApiHost || defaultRoamApiHost;

  try {
    const response = await fetch(`http://${host}:${port}/api/graphs/tokens/info`, {
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

export async function getConfiguredGraphs() {
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

export async function resolveGraph(context, key) {
  const graphs = await context.getConfiguredGraphs();
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

export function selectDefaultGraph(graphs) {
  if (!graphs.length) return null;
  if (!defaultGraphKey) return graphs.find((graph) => !isRoamHelpGraph(graph)) || graphs[0];
  return (
    graphs.find((candidate) => candidate.nickname === defaultGraphKey || candidate.name === defaultGraphKey) ||
    graphs[0]
  );
}

export function sanitizeGraph(graph) {
  return {
    name: graph.name,
    nickname: graph.nickname,
    type: graph.type,
    accessLevel: graph.accessLevel
  };
}

export async function getRoamPort() {
  if (process.env.ROAM_LOCAL_API_PORT) return Number(process.env.ROAM_LOCAL_API_PORT);
  const config = await readJson(join(homedir(), ".roam-local-api.json"));
  return Number(config?.port) || 3333;
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

function isRoamHelpGraph(graph) {
  return graph.name === "help" && graph.nickname === "roam-official-help-graph";
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

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}
