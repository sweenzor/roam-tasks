import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { serveStatic } from "../server/static-files.mjs";

test("static server streams assets and falls back to index for app routes", async (t) => {
  const publicDir = await mkdtemp(join(tmpdir(), "roam-tasks-static-"));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  await writeFile(join(publicDir, "index.html"), "<main>App shell</main>", "utf8");
  await writeFile(join(publicDir, "styles.css"), "body { color: black; }", "utf8");

  const assetResponse = responseRecorder();
  await serveStatic(assetResponse, "/styles.css", { publicDir });
  await once(assetResponse, "finish");

  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers["Content-Type"], "text/css; charset=utf-8");
  assert.equal(assetResponse.body(), "body { color: black; }");

  const routeResponse = responseRecorder();
  await serveStatic(routeResponse, "/projects/today", { publicDir });
  await once(routeResponse, "finish");

  assert.equal(routeResponse.status, 200);
  assert.equal(routeResponse.headers["Content-Type"], "text/html; charset=utf-8");
  assert.equal(routeResponse.body(), "<main>App shell</main>");
});

test("static server rejects traversal and reports missing assets as not found", async (t) => {
  const publicDir = await mkdtemp(join(tmpdir(), "roam-tasks-static-"));
  t.after(() => rm(publicDir, { recursive: true, force: true }));
  await writeFile(join(publicDir, "index.html"), "<main>App shell</main>", "utf8");

  await assert.rejects(
    serveStatic(responseRecorder(), "/%2e%2e/secrets.txt", { publicDir }),
    { code: "FORBIDDEN" }
  );

  await assert.rejects(
    serveStatic(responseRecorder(), "/missing.css", { publicDir }),
    { code: "NOT_FOUND" }
  );
});

function responseRecorder() {
  const chunks = [];
  const response = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });

  response.status = 0;
  response.headers = {};
  response.writeHead = (status, headers) => {
    response.status = status;
    response.headers = headers;
  };
  response.body = () => Buffer.concat(chunks).toString("utf8");
  return response;
}
