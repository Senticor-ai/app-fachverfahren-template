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

// Bekannte statische Asset-Extensions: eine fehlende Datei mit einer davon ist eine Asset-Anfrage und
// wird 404-JSON beantwortet (ein 200-HTML für eine .js/.css-Anfrage bräche Asset-Laden/Caching). ALLES
// andere fällt auf das SPA-Index zurück — insbesondere Client-Routen mit einem Punkt im letzten Segment
// (z. B. /amt/akte/case.<uuid>: echte caseIds SIND punkthaltig), die sonst fälschlich als Datei-Anfrage
// gälten und beim Deep-Link/Reload 404 statt der App lieferten.
const STATIC_ASSET_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".webmanifest",
  ".map",
  ".svg",
  ".png",
  ".ico",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".txt",
  ".xml",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".wasm",
  ".pdf",
]);

/** Präfixe, unter denen SCHNITTSTELLEN liegen — nie Client-Routen. Ein unbekannter Pfad darunter ist
 *  ein Fehler, keine Seite. Bewusst hier (Delivery-Politik) und nicht je Anwendung wiederholt. */
const SCHNITTSTELLEN_PRAEFIXE = ["/api/", "/auth/", "/internal/"] as const;

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
    // `res` ist seit @fastify/static v10 eine Fastify-`Reply`, nicht mehr die rohe Node-Antwort.
    // GEMESSEN an v10.1.3: `constructor.name === "_Reply"`, `typeof res.header === "function"`,
    // `typeof res.setHeader === "undefined"`. Unter v9 lief hier `res.setHeader(...)`; unter v10 warf
    // das `TypeError: res.setHeader is not a function` — INNERHALB des Plugins, also als unbehandelte
    // Ablehnung. Die zwoelf Zeugen des Delivery-Vertrags liefen daraufhin in ihr 20-s-Zeitlimit, statt
    // eine Meldung zu zeigen: der Fehler erreichte den Aufrufer nie.
    setHeaders: (res, filePath) => {
      res.header(
        "cache-control",
        cachePolicyForFile(config.staticDir, filePath),
      );
      res.header("content-type", contentType(filePath));
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
    // ── SCHNITTSTELLEN-PFADE FALLEN NIE AUF DIE SPA ZURÜCK ──────────────────────────────────────
    // Ein nicht registrierter `/api/…`-Pfad bekam bisher den History-Fallback: 200 + die komplette
    // Anwendung als HTML. Drei Folgen, alle schlecht:
    //   • eine Prüfung „erreicht die Aussenzone diesen Endpunkt?" liest 200 und schliesst „ja" —
    //     der Endpunkt existiert gar nicht. Genau so entsteht ein falsches Sicherheitsurteil.
    //   • ein Client, der JSON erwartet, bekommt HTML und scheitert an einer Stelle, die nichts mit
    //     der Ursache zu tun hat (die Clients tragen deshalb bereits Notbehelfs-Prüfungen).
    //   • jede Endpunkt-Sondierung bekommt kostenlos das gesamte Anwendungs-Bundle ausgeliefert.
    // Deshalb: Schnittstellen-Präfixe antworten sauber mit 404-JSON. Die SPA-Routen sind alles Übrige.
    if (SCHNITTSTELLEN_PRAEFIXE.some((p) => pathname.startsWith(p))) {
      return reply
        .code(404)
        .header("Cache-Control", NO_STORE)
        .send({ status: "not-found" });
    }
    // NUR fehlende Dateien mit BEKANNTER Asset-Extension → 404-JSON; punkthaltige Client-Routen
    // (z. B. /amt/akte/case.<uuid>) sind KEINE Asset-Anfragen und bekommen den History-Fallback.
    const ext = path.extname(pathname).toLowerCase();
    if (ext !== "" && STATIC_ASSET_EXTENSIONS.has(ext)) {
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
