#!/usr/bin/env node
// check-openapi — Snapshot-Gate für das intern ausgelieferte OpenAPI-Dokument:
// baut public+internal Fastify-Instanzen IN-PROCESS aus den gebauten dists
// (InMemory-Store, NoSession, Noop-Sink), prüft intern→200 mit allen BFF-Pfaden
// und public→404, normalisiert (stabile Key-Sortierung) und vergleicht bytegenau
// mit schemas/openapi.internal.json. Aktualisieren: `pnpm run check:openapi -- --update`.
// Läuft NACH build:packages (importiert dist/, nicht src/).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const snapshotPath = join(root, "schemas/openapi.internal.json");
const update = process.argv.includes("--update");

// fastify aus dem Kontext des BFF-Pakets auflösen (isolated node_modules:
// das Root kennt fastify nicht als eigene Abhängigkeit).
const requireFromBff = createRequire(
  join(root, "packages/app-bff-fastify/package.json"),
);
const { fastify } = requireFromBff("fastify");

const { appBff, registerOpenApiCollector, registerOpenApiRoute } = await import(
  new URL("../packages/app-bff-fastify/dist/index.js", import.meta.url).href
);
const { NoSessionResolver, NoopAuditSink } = await import(
  new URL("../packages/app-runtime-fastify/dist/index.js", import.meta.url).href
);
const { InMemoryAppStore } = await import(
  new URL("../packages/app-store-postgres/dist/index.js", import.meta.url).href
);

const REQUIRED_PATHS = [
  "/api/capabilities",
  "/api/mailbox",
  "/api/preferences",
  "/api/session",
];

const failures = [];

const publicApp = fastify({ logger: false });
registerOpenApiCollector(publicApp);
await publicApp.register(appBff, {
  appStore: new InMemoryAppStore(),
  sessionResolver: new NoSessionResolver(),
  auditSink: new NoopAuditSink(),
});
const internalApp = fastify({ logger: false });
registerOpenApiRoute(internalApp, publicApp);

try {
  const internal = await internalApp.inject({
    method: "GET",
    url: "/internal/openapi.json",
  });
  if (internal.statusCode !== 200) {
    failures.push(
      `internal /internal/openapi.json returned ${internal.statusCode}`,
    );
  }
  const doc = internal.json();
  for (const path of REQUIRED_PATHS) {
    if (!doc.paths?.[path]) {
      failures.push(`OpenAPI document missing path ${path}`);
    }
  }

  const onPublic = await publicApp.inject({
    method: "GET",
    url: "/internal/openapi.json",
  });
  if (onPublic.statusCode !== 404) {
    failures.push(
      `public /internal/openapi.json must be 404, got ${onPublic.statusCode}`,
    );
  }

  // Prettier-kanonisch formatieren, damit Snapshot-Vergleich und format:check
  // dieselbe Form sehen (Prettier kollabiert z.B. kurze Arrays einzeilig).
  const prettier = await import("prettier");
  const normalized = await prettier.format(JSON.stringify(sortKeysDeep(doc)), {
    parser: "json",
  });
  if (update) {
    writeFileSync(snapshotPath, normalized);
    console.log(`OpenAPI snapshot updated: ${snapshotPath}`);
  } else if (!existsSync(snapshotPath)) {
    failures.push(
      `missing snapshot schemas/openapi.internal.json — run: pnpm run check:openapi -- --update`,
    );
  } else if (readFileSync(snapshotPath, "utf8") !== normalized) {
    failures.push(
      "OpenAPI document drifted from schemas/openapi.internal.json — review the diff and run: pnpm run check:openapi -- --update",
    );
  }
} finally {
  await publicApp.close();
  await internalApp.close();
}

if (failures.length > 0) {
  console.error("OpenAPI contract violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("OpenAPI contract passed.");

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
}
