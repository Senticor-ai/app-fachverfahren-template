// static — SPA-Auslieferung mit redeploy-sicherer Cache-Politik: index.html/Root-Dateien
// no-store, content-gehashte Assets immutable, SPA-Fallback für extensionslose Pfade,
// Traversal-Schutz, HEAD ohne Body. (Umbau auf @fastify/static: Issue #11, Phase B —
// die Politik hier ist der Vertrag, die Dateiauslieferung das austauschbare Detail.)
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "./config.js";
import { IMMUTABLE, NO_STORE } from "./constants.js";
import { safePathname } from "./hooks.js";

export async function serveStatic(
  request: FastifyRequest,
  reply: FastifyReply,
  config: RuntimeConfig,
) {
  const pathname = safePathname(request.url);
  const staticFile = await resolveStaticFile(config.staticDir, pathname);
  if (!staticFile) {
    if (path.extname(pathname)) {
      return reply
        .code(404)
        .header("Cache-Control", NO_STORE)
        .send({ status: "not-found" });
    }
    return sendFile({
      request,
      reply,
      filePath: path.join(config.staticDir, "index.html"),
      cacheControl: NO_STORE,
    });
  }
  return sendFile({
    request,
    reply,
    filePath: staticFile,
    cacheControl: cachePolicy(pathname),
  });
}

async function sendFile({
  request,
  reply,
  filePath,
  cacheControl,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  filePath: string;
  cacheControl: string;
}) {
  const body = await readFile(filePath);
  reply.header("Cache-Control", cacheControl).type(contentType(filePath));
  if (request.method === "HEAD") {
    return reply.send();
  }
  return reply.send(body);
}

async function resolveStaticFile(
  staticDir: string,
  pathname: string,
): Promise<string | null> {
  const normalized = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const relative = normalized.replace(/^[/\\]+/, "");
  let candidate = path.join(staticDir, relative);
  if (
    candidate !== staticDir &&
    !candidate.startsWith(`${staticDir}${path.sep}`)
  ) {
    return null;
  }
  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      candidate = path.join(candidate, "index.html");
    }
    await access(candidate, constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

export function cachePolicy(pathname: string): string {
  if (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/runtime-config.json" ||
    pathname === "/service-worker.js"
  ) {
    return NO_STORE;
  }
  if (
    /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|svg)$/.test(pathname)
  ) {
    return IMMUTABLE;
  }
  return NO_STORE;
}

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".webmanifest":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
