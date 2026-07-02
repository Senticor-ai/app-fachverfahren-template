#!/usr/bin/env node
// Minimaler, abhängigkeitsfreier Static-Server für das gebaute SPA-Bundle (apps/antragsservice/dist).
// Die Referenz-App ist ein reines Vite-Bundle (kein App-Server mehr) — im Container wird STATIC_DIR
// ausgeliefert, mit SPA-Fallback auf index.html (react-router-Routen ohne Datei-Endung).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(
  process.env["STATIC_DIR"] ?? path.join(here, "..", "dist"),
);
const port = Number(process.env["PORT"] ?? 8080);
const host = process.env["HOST"] ?? "0.0.0.0";
const indexHtml = path.join(staticDir, "index.html");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(rawUrl) {
  const decoded = decodeURIComponent(rawUrl.split("?")[0].split("#")[0]);
  // Normalisieren und in staticDir einsperren (kein Directory-Traversal).
  const rel = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  let candidate = path.join(staticDir, rel);
  if (candidate !== staticDir && !candidate.startsWith(staticDir + path.sep))
    return null;
  try {
    const s = await stat(candidate);
    if (s.isDirectory()) candidate = path.join(candidate, "index.html");
    await stat(candidate);
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const url = req.url ?? "/";
    let file = await resolveFile(url);
    if (!file) {
      // Datei-artige Requests (mit Endung) → 404; echte SPA-Routen → index.html.
      if (path.extname(url.split("?")[0])) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }
      file = indexHtml;
    }
    const body = await readFile(file);
    const type =
      MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const immutable =
      file !== indexHtml && file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(
    `antragsservice static server: http://${host}:${port} (dir: ${staticDir})`,
  );
});
