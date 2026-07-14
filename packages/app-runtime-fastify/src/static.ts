// static — SPA-Auslieferung über @fastify/static; die POLITIK bleibt hier: redeploy-
// sichere Cache-Header (index.html/Wurzeldokumente no-store, content-gehashte Assets
// immutable), 404-JSON für fehlende Dateien MIT Extension, SPA-Fallback für
// extensionslose Pfade, 405 für Nicht-GET/HEAD, Dotfile-Verzeichnisse (.well-known)
// erlaubt. Traversal-Abwehr und HEAD-Semantik liefert @fastify/send; der Vertrag ist
// in static.test.ts implementierungsneutral gepinnt.
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import type { RuntimeConfig } from "./config.js";
import { IMMUTABLE, NO_STORE } from "./constants.js";
import { safePathname } from "./hooks.js";

export function registerStaticDelivery(
  app: FastifyInstance,
  config: RuntimeConfig,
): void {
  app.register(fastifyStatic, {
    root: config.staticDir,
    wildcard: true,
    index: "index.html",
    // Cache-Politik UND Content-Types sind UNSERE (setHeaders); Validator-Header
    // bleiben aus, damit sich das Verhalten gegenüber der bisherigen Runtime nicht
    // ändert (kein etag/last-modified/range-Handling, das Proxies anders cachen
    // ließe; .js bleibt text/javascript nach RFC 9239 — @fastify/send würde das
    // veraltete application/javascript senden, check:pwa-runtime pinnt das).
    cacheControl: false,
    etag: false,
    lastModified: false,
    acceptRanges: false,
    contentType: false,
    // Delivery-Vertrag verlangt /.well-known/security.txt (check-web-delivery).
    dotfiles: "allow",
    serveDotFiles: true,
    setHeaders: (res, filePath) => {
      res.setHeader(
        "cache-control",
        cachePolicyForFile(config.staticDir, filePath),
      );
      res.setHeader("content-type", contentType(filePath));
    },
  });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return reply
        .code(405)
        .header("Allow", "GET, HEAD")
        .header("Cache-Control", NO_STORE)
        .send({ status: "method-not-allowed" });
    }
    const pathname = safePathname(request.url);
    if (path.extname(pathname)) {
      return reply
        .code(404)
        .header("Cache-Control", NO_STORE)
        .send({ status: "not-found" });
    }
    return reply.header("Cache-Control", NO_STORE).sendFile("index.html");
  });
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

function cachePolicyForFile(staticDir: string, filePath: string): string {
  const relative = path.relative(staticDir, filePath);
  const pathname = `/${relative.split(path.sep).join("/")}`;
  return cachePolicy(pathname);
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
