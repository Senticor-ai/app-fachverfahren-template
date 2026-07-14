#!/usr/bin/env node
// smoke-runtime — Prozess-Level-Rauchtest der gebauten Runtime: startet
// apps/<domain>/dist-server/index.js OHNE Datenbank (UnavailableAppStore-Pfad)
// und prüft den vollen Auslieferungs- und Isolations-Vertrag über echte HTTP-Ports:
// Health, SPA, immutable Asset, /api/session→401-Envelope, public /internal/*→404
// (nie SPA-Fallback), internal Metrics+OpenAPI→200, SIGTERM→sauberer Exit.
// Renderer-sicher: App-Verzeichnis via DOMAIN oder Autodetect des einzigen apps/*-Eintrags.
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const domain = process.env.DOMAIN ?? detectSingleAppDir();
const appRoot = join(root, "apps", domain);
const serverEntry = join(appRoot, "dist-server/index.js");
const staticDir = join(appRoot, "dist");

const PORT = Number(process.env.SMOKE_PORT ?? 43189);
const INTERNAL_PORT = Number(process.env.SMOKE_INTERNAL_PORT ?? 43190);
const publicBase = `http://127.0.0.1:${PORT}`;
const internalBase = `http://127.0.0.1:${INTERNAL_PORT}`;
const SHUTDOWN_TIMEOUT_MS = 10_000;

if (!existsSync(serverEntry) || !existsSync(join(staticDir, "index.html"))) {
  console.error(
    `smoke-runtime: build artifacts missing (${display(serverEntry)}, ${display(
      join(staticDir, "index.html"),
    )}) — run: pnpm run build:app && pnpm run build:server`,
  );
  process.exit(1);
}

const hashedAsset = readdirSync(join(staticDir, "assets")).find((file) =>
  /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(file),
);
if (!hashedAsset) {
  console.error("smoke-runtime: no content-hashed asset found in dist/assets");
  process.exit(1);
}

// BEWUSST ohne APP_PG_URL/APP_PG_DIRECT_URL: der Rauchtest beweist, dass die
// Runtime ohne Datenbank startet und die BFF-Routen sauber degradieren (401/503).
const childEnv = { ...process.env };
delete childEnv.APP_PG_URL;
delete childEnv.APP_PG_DIRECT_URL;
delete childEnv.AUTH_BOOTSTRAP_ADMIN_EMAIL;
const child = spawn(process.execPath, [serverEntry], {
  cwd: root,
  env: {
    ...childEnv,
    PORT: String(PORT),
    INTERNAL_PORT: String(INTERNAL_PORT),
    STATIC_DIR: staticDir,
    APP_ALLOWED_HOSTS: `127.0.0.1:${PORT},localhost:${PORT}`,
    APP_SHUTDOWN_TIMEOUT_MS: String(SHUTDOWN_TIMEOUT_MS),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let childOutput = "";
child.stdout.on("data", (chunk) => (childOutput += chunk));
child.stderr.on("data", (chunk) => (childOutput += chunk));

const failures = [];

try {
  await waitForLiveness();
  await check("GET /readyz is 200", async () => {
    const response = await fetch(`${publicBase}/readyz`);
    assert(response.status === 200, `status ${response.status}`);
  });
  await check("GET / serves the SPA shell", async () => {
    const response = await fetch(publicBase);
    const body = await response.text();
    assert(response.status === 200, `status ${response.status}`);
    assert(
      String(response.headers.get("content-type")).includes("text/html"),
      `content-type ${response.headers.get("content-type")}`,
    );
    assert(body.includes('id="root"'), "missing #root mount");
  });
  await check("hashed asset is immutable", async () => {
    const response = await fetch(`${publicBase}/assets/${hashedAsset}`);
    assert(response.status === 200, `status ${response.status}`);
    assert(
      response.headers.get("cache-control") ===
        "public, max-age=31536000, immutable",
      `cache-control ${response.headers.get("cache-control")}`,
    );
  });
  await check("GET /api/session is 401 with error envelope", async () => {
    const response = await fetch(`${publicBase}/api/session`);
    assert(response.status === 401, `status ${response.status}`);
    const body = await response.json();
    assert(
      body.error === "authentication required",
      `body ${JSON.stringify(body)}`,
    );
  });
  for (const path of ["/internal/metrics", "/internal/openapi.json"]) {
    await check(`public ${path} is 404 (never SPA fallback)`, async () => {
      const response = await fetch(`${publicBase}${path}`);
      assert(response.status === 404, `status ${response.status}`);
      const body = await response.json();
      assert(body.status === "not-found", `body ${JSON.stringify(body)}`);
    });
  }
  await check("internal /internal/metrics exposes app_build_info", async () => {
    const response = await fetch(`${internalBase}/internal/metrics`);
    assert(response.status === 200, `status ${response.status}`);
    assert(
      (await response.text()).includes("app_build_info"),
      "missing app_build_info",
    );
  });
  await check("internal /internal/openapi.json documents the BFF", async () => {
    const response = await fetch(`${internalBase}/internal/openapi.json`);
    assert(response.status === 200, `status ${response.status}`);
    const doc = await response.json();
    assert(Boolean(doc.paths?.["/api/session"]), "missing /api/session path");
  });
  await check("SIGTERM shuts down cleanly (exit 0)", async () => {
    const exit = waitForExit();
    child.kill("SIGTERM");
    const code = await withTimeout(exit, SHUTDOWN_TIMEOUT_MS + 5_000);
    assert(code === 0, `exit code ${code}`);
  });
} finally {
  if (child.exitCode === null) child.kill("SIGKILL");
}

if (failures.length > 0) {
  console.error("Runtime smoke test failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("--- runtime output ---");
  console.error(childOutput);
  process.exit(1);
}

console.log("Runtime smoke test passed.");

async function check(name, run) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForLiveness() {
  const deadline = Date.now() + 45_000;
  for (;;) {
    if (child.exitCode !== null) {
      throw new Error(
        `runtime exited early with code ${child.exitCode}\n${childOutput}`,
      );
    }
    try {
      const response = await fetch(`${publicBase}/livez`);
      if (response.status === 200) return;
    } catch {
      // Port noch nicht offen — weiter warten.
    }
    if (Date.now() > deadline) {
      throw new Error(`runtime did not become live in 45s\n${childOutput}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function waitForExit() {
  return new Promise((resolve) => child.once("exit", resolve));
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function detectSingleAppDir() {
  const apps = readdirSync(join(root, "apps"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (apps.length !== 1) {
    console.error(
      `smoke-runtime: expected exactly one apps/* directory, found ${apps.join(", ")} — set DOMAIN=<app>`,
    );
    process.exit(1);
  }
  return apps[0];
}

function display(path) {
  return path.replace(`${root}`, "");
}
