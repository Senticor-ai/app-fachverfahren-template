#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = process.cwd();
const appRoot = join(root, "apps/fachverfahren");
const staticDir = resolve(appRoot, "dist");
const serverEntry = resolve(appRoot, "dist-server/index.js");
const failures = [];
const observations = [];

if (!existsSync(join(staticDir, "index.html"))) {
  failures.push("built app missing apps/fachverfahren/dist/index.html");
}
if (!existsSync(serverEntry)) {
  failures.push("built server missing apps/fachverfahren/dist-server/index.js");
}

if (failures.length === 0) {
  const port = Number(process.env["PWA_CHECK_PORT"] ?? (await findOpenPort()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      STATIC_DIR: staticDir,
      APP_ENABLE_SERVICE_WORKER: "true",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  server.stdout.on("data", (chunk) => logs.push(String(chunk)));
  server.stderr.on("data", (chunk) => logs.push(String(chunk)));

  try {
    await waitForServer(baseUrl);
    await checkRuntime(baseUrl);
    observations.push(`runtime ${baseUrl}`);
  } catch (error) {
    failures.push(String(error));
    if (logs.length > 0) {
      failures.push(`server log:\n${logs.join("").trim()}`);
    }
  } finally {
    server.kill("SIGTERM");
    await waitForExit(server);
  }
}

if (failures.length > 0) {
  console.error("PWA runtime check violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `PWA runtime check passed.${observations.length ? ` ${observations.join("; ")}` : ""}`,
);

async function checkRuntime(baseUrl) {
  const rootResponse = await fetchText(baseUrl, "/");
  expectStatus(rootResponse, 200, "/");
  expectHeader(rootResponse, "cache-control", "no-store", "/");
  expectHeaderIncludes(
    rootResponse,
    "content-security-policy",
    "manifest-src 'self'",
    "/",
  );
  expectHeaderIncludes(
    rootResponse,
    "content-security-policy",
    "worker-src 'self'",
    "/",
  );
  expect(
    rootResponse.body.includes('lang="de"'),
    "index.html must set lang=de",
  );
  expect(
    rootResponse.body.includes("width=device-width") &&
      rootResponse.body.includes("viewport-fit=cover"),
    "index.html must use mobile viewport with viewport-fit=cover",
  );
  for (const required of [
    'name="theme-color"',
    'name="mobile-web-app-capable"',
    'name="apple-mobile-web-app-capable"',
    'name="apple-mobile-web-app-title"',
    'rel="apple-touch-icon"',
    'rel="manifest"',
  ]) {
    expect(
      rootResponse.body.includes(required),
      `index.html missing ${required}`,
    );
  }

  for (const route of [
    "/buerger",
    "/buerger/anmelden",
    "/amt",
    "/amt/vorgang/smoke",
    "/aufsicht",
  ]) {
    const response = await fetchText(baseUrl, route);
    expectStatus(response, 200, route);
    expectHeader(response, "cache-control", "no-store", route);
    expectHeaderIncludes(response, "content-type", "text/html", route);
    expect(
      response.body.includes('id="root"'),
      `${route} must serve the SPA shell`,
    );
  }

  const runtimeConfig = await fetchJson(baseUrl, "/runtime-config.json");
  expectStatus(runtimeConfig, 200, "/runtime-config.json");
  expectHeader(
    runtimeConfig,
    "cache-control",
    "no-store",
    "/runtime-config.json",
  );
  expect(
    runtimeConfig.json.delivery?.serviceWorkerEnabled === true,
    "runtime-config.json must enable the service worker for the PWA check",
  );

  const manifest = await fetchJson(baseUrl, "/manifest.webmanifest");
  expectStatus(manifest, 200, "/manifest.webmanifest");
  expect(manifest.json.id === "/", "manifest.webmanifest must set id=/");
  expect(
    manifest.json.lang === "de-DE",
    "manifest.webmanifest must set lang=de-DE",
  );
  expect(
    manifest.json.start_url === "/",
    "manifest.webmanifest must set start_url=/",
  );
  expect(manifest.json.scope === "/", "manifest.webmanifest must set scope=/");
  expect(
    manifest.json.display === "standalone",
    "manifest.webmanifest must set display=standalone",
  );
  expect(
    manifest.json.theme_color,
    "manifest.webmanifest must set theme_color",
  );
  expect(
    manifest.json.background_color,
    "manifest.webmanifest must set background_color",
  );

  const icons = Array.isArray(manifest.json.icons) ? manifest.json.icons : [];
  expectIcon(icons, "192x192", "image/png", "any");
  expectIcon(icons, "512x512", "image/png", "any");
  expectIcon(icons, "192x192", "image/png", "maskable");
  expectIcon(icons, "512x512", "image/png", "maskable");

  for (const icon of [
    ...icons,
    { src: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  ]) {
    const response = await fetchBinary(baseUrl, icon.src);
    expectStatus(response, 200, icon.src);
    expectHeaderIncludes(response, "content-type", icon.type, icon.src);
    expect(response.bytes > 0, `${icon.src} must not be empty`);
  }

  const serviceWorker = await fetchText(baseUrl, "/service-worker.js");
  expectStatus(serviceWorker, 200, "/service-worker.js");
  expectHeader(
    serviceWorker,
    "cache-control",
    "no-store",
    "/service-worker.js",
  );
  expectHeaderIncludes(
    serviceWorker,
    "content-type",
    "text/javascript",
    "/service-worker.js",
  );
  expect(
    serviceWorker.body.includes("CACHE_PREFIX"),
    "service-worker.js must contain the cache prefix",
  );
  for (const forbidden of [
    "/runtime-config.json",
    "/api/",
    "/internal/",
    "navigate",
  ]) {
    expect(
      !serviceWorker.body.includes(forbidden),
      `service-worker.js must not cache ${forbidden}`,
    );
  }

  const assetPaths = findBuiltAssets();
  for (const assetPath of [assetPaths.css, assetPaths.js]) {
    const response = await fetchText(baseUrl, assetPath);
    expectStatus(response, 200, assetPath);
    expectHeader(
      response,
      "cache-control",
      "public, max-age=31536000, immutable",
      assetPath,
    );
  }

  const css = await fetchText(baseUrl, assetPaths.css);
  for (const [label, pattern] of [
    ["dynamic viewport height", /100dvh/],
    ["safe-area insets", /env\(safe-area-inset-/],
    ["coarse pointer touch targets", /@media\s*\(pointer:\s*coarse\)/],
    ["phone breakpoint", /@media\s*\((?:max-width:\s*40rem|width<=40rem)\)/],
    ["tablet breakpoint", /@media\s*\((?:max-width:\s*52rem|width<=52rem)\)/],
    ["reduced motion", /prefers-reduced-motion/],
    ["standalone display mode", /display-mode:\s*standalone/],
  ]) {
    expect(
      pattern.test(css.body),
      `built CSS missing ${label} responsive/PWA signal`,
    );
  }
}

function findBuiltAssets() {
  const assetsDir = join(staticDir, "assets");
  const files = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
  const css = files.find((file) => /-[A-Za-z0-9_-]{8,}\.css$/.test(file));
  const js = files.find((file) => /^index-[A-Za-z0-9_-]{8,}\.js$/.test(file));
  if (!css) failures.push("built app missing hashed CSS asset");
  if (!js) failures.push("built app missing hashed index JS asset");
  if (!css || !js) throw new Error("built assets are incomplete");
  return { css: `/assets/${css}`, js: `/assets/${js}` };
}

function expectIcon(icons, sizes, type, purpose) {
  expect(
    icons.some(
      (icon) =>
        icon.sizes === sizes &&
        icon.type === type &&
        String(icon.purpose ?? "")
          .split(/\s+/)
          .includes(purpose),
    ),
    `manifest.webmanifest must declare ${sizes} ${purpose} ${type} icon`,
  );
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/livez`);
      if (response.ok) return;
    } catch {
      // Retry until the server has bound the port.
    }
    await delay(250);
  }
  throw new Error("server did not become ready for the PWA runtime check");
}

async function fetchText(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    pathname,
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

async function fetchJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    pathname,
    status: response.status,
    headers: response.headers,
    json: await response.json(),
  };
}

async function fetchBinary(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    pathname,
    status: response.status,
    headers: response.headers,
    bytes: (await response.arrayBuffer()).byteLength,
  };
}

function expectStatus(response, status, label) {
  expect(
    response.status === status,
    `${label} returned ${response.status}, expected ${status}`,
  );
}

function expectHeader(response, name, expected, label) {
  expect(
    response.headers.get(name) === expected,
    `${label} header ${name} must be ${expected}`,
  );
}

function expectHeaderIncludes(response, name, expected, label) {
  expect(
    response.headers.get(name)?.includes(expected),
    `${label} header ${name} must include ${expected}`,
  );
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

async function findOpenPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (typeof address === "object" && address?.port) return address.port;
  throw new Error("could not allocate a local port");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2000).then(() => child.kill("SIGKILL")),
  ]);
}
