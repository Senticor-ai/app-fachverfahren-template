#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const appRoot = join(root, "apps/antragsservice");
const publicRoot = join(appRoot, "public");
const distRoot = join(appRoot, "dist");
const failures = [];

const requiredPublicFiles = [
  "robots.txt",
  "manifest.webmanifest",
  "favicon.svg",
  "icon.svg",
  ".well-known/security.txt",
  "preview-reporter.js",
  "service-worker.js",
];

for (const file of requiredPublicFiles) {
  requireFile(join(publicRoot, file), `missing public standards asset ${file}`);
}

const sourceIndex = read(join(appRoot, "index.html"));
if (sourceIndex) {
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(sourceIndex)) {
    failures.push(
      "apps/antragsservice/index.html must not contain inline scripts",
    );
  }
  if (!sourceIndex.includes('src="/preview-reporter.js"')) {
    failures.push("index.html must load the external preview reporter");
  }
  if (!sourceIndex.includes('rel="manifest"')) {
    failures.push("index.html must link manifest.webmanifest");
  }
}

const robots = read(join(publicRoot, "robots.txt"));
if (robots && !/User-agent:\s*\*\s+Disallow:\s*\//s.test(robots)) {
  failures.push("robots.txt must disallow indexing by default");
}

const manifest = read(join(publicRoot, "manifest.webmanifest"));
if (manifest) {
  const parsed = JSON.parse(manifest);
  if (parsed.display !== "standalone") {
    failures.push("manifest.webmanifest must use display=standalone");
  }
  if (!Array.isArray(parsed.icons) || parsed.icons.length === 0) {
    failures.push("manifest.webmanifest must declare at least one icon");
  }
}

const serviceWorker = read(join(publicRoot, "service-worker.js"));
if (serviceWorker) {
  for (const forbidden of [
    "/runtime-config.json",
    "/api/",
    "/internal/",
    "navigate",
  ]) {
    if (serviceWorker.includes(forbidden)) {
      failures.push(`service-worker.js must not cache ${forbidden}`);
    }
  }
  if (!serviceWorker.includes("assets")) {
    failures.push("service-worker.js must limit caching to immutable assets");
  }
}

const server = read(join(appRoot, "server/index.ts"));
if (server) {
  for (const required of [
    "Content-Security-Policy",
    "Content-Security-Policy-Report-Only",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "public, max-age=31536000, immutable",
    "no-store",
    "/internal/build-info",
    "/internal/metrics",
  ]) {
    if (!server.includes(required)) {
      failures.push(`server runtime missing ${required}`);
    }
  }
}

if (existsSync(distRoot)) {
  const distIndex = read(join(distRoot, "index.html"));
  if (distIndex && /<script(?![^>]*\bsrc=)[^>]*>/i.test(distIndex)) {
    failures.push("built dist/index.html must not contain inline scripts");
  }
  for (const file of requiredPublicFiles) {
    requireFile(join(distRoot, file), `built app missing ${file}`);
  }
  const assetsDir = join(distRoot, "assets");
  if (!existsSync(assetsDir)) {
    failures.push("built app missing assets directory");
  } else {
    const unhashed = readdirSync(assetsDir).filter(
      (file) =>
        /\.(?:js|css)$/.test(file) &&
        !/-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(file),
    );
    for (const file of unhashed) {
      failures.push(`built asset is not content-hashed: assets/${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Web-delivery contract violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Web-delivery contract passed.");

function requireFile(path, message) {
  if (!existsSync(path)) failures.push(message);
}

function read(path) {
  if (!existsSync(path)) {
    failures.push(`missing ${display(path)}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function display(path) {
  return path.replace(`${root}/`, "");
}
