import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const graph = process.env.ROAM_PUBLIC_HELP_GRAPH || "roam-official-help-graph";
const skipIntegration = process.env.SKIP_ROAM_HELP_GRAPH_INTEGRATION === "1";

(skipIntegration ? test.skip : test)("health endpoint works with Roam public help graph", async (context) => {
  const app = await getAppServer();
  context.after(async () => {
    await app.close();
  });

  const response = await fetch(`${app.baseUrl}/api/health?graph=${encodeURIComponent(graph)}`);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.graph.nickname, graph);
  assert.ok(body.port > 0);
});

async function getAppServer() {
  if (process.env.ROAM_TASKS_BASE_URL) {
    return {
      baseUrl: process.env.ROAM_TASKS_BASE_URL,
      close: async () => {}
    };
  }

  const port = await getAvailablePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    child.kill();
    throw new Error(`${error.message}\n${output.join("")}`);
  }

  return {
    baseUrl,
    close: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
  };
}

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 5000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
      lastError = new Error(`Server responded with HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Local test server did not become ready: ${lastError?.message || "unknown error"}`);
}
