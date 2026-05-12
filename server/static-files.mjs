import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { badRequest, forbidden, notFound } from "./http-errors.mjs";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

export async function serveStatic(response, pathname, context) {
  const staticRoot = resolve(context.publicDir);
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeRequestPath(requestPath);
  const filePath = resolve(staticRoot, `.${decoded}`);

  if (!isPathInside(filePath, staticRoot)) {
    throw forbidden("Forbidden");
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw notFound("Not found");
    streamFile(response, filePath);
  } catch {
    if (hasStaticExtension(requestPath)) throw notFound("Not found");
    streamFile(response, join(staticRoot, "index.html"));
  }
}

function decodeRequestPath(requestPath) {
  try {
    return decodeURIComponent(requestPath);
  } catch {
    throw badRequest("Invalid request path.");
  }
}

function streamFile(response, filePath) {
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}

function hasStaticExtension(requestPath) {
  return Boolean(extname(requestPath));
}

function isPathInside(filePath, staticRoot) {
  return filePath === staticRoot || filePath.startsWith(`${staticRoot}${sep}`);
}
