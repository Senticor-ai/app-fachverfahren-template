// dev-api — startet die lokale App-Runtime (Fastify, apps/fachverfahren/server) für die
// Entwicklung: `pnpm dev` serviert die SPA über Vite und proxied /auth + /api an DIESE Runtime
// (apps/fachverfahren/dev-proxy.ts, Default http://127.0.0.1:8080). Ohne laufende Runtime zeigt
// die App „Server nicht erreichbar".
//
// Ablauf: Store-Paket bauen (die Runtime lädt @senticor/app-store-postgres aus dist/) →
// Migrationen fahren → Server-Bundle bauen → Runtime starten. Voraussetzung ist NUR ein
// erreichbares Postgres samt existierender Datenbank (Default: dev/postgres.yaml, app/app/app;
// eigene Instanz via APP_PG_URL). Beim ersten Start richtet man den Admin im Browser auf der
// Landing ("/") mit dem Bootstrap-Token ein (Default „dev-setup", NUR für lokale Entwicklung) —
// alternativ legt AUTH_BOOTSTRAP_ADMIN_EMAIL/-PASSWORD den Admin beim Start automatisch an.
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Dev-Defaults ÜBER die real gesetzte Umgebung legen — gesetzte Werte gewinnen immer.
 *  PORT 8080 = Default des Vite-Dev-Proxys; APP_PG_URL = dev/postgres.yaml (app/app/app). */
export function resolveDevApiEnv(env = process.env) {
  const resolved = {
    ...env,
    HOST: env.HOST ?? "127.0.0.1",
    PORT: env.PORT ?? "8080",
    INTERNAL_PORT: env.INTERNAL_PORT ?? "9090",
    APP_PG_URL: env.APP_PG_URL ?? "postgres://app:app@127.0.0.1:5432/app",
  };
  // Auto-Bootstrap (AUTH_BOOTSTRAP_ADMIN_*) macht das Token-Setup überflüssig — dann kein
  // Default-Token injizieren, damit der Einmal-Setup-Endpunkt nicht unnötig offen ist.
  if (!env.AUTH_BOOTSTRAP_ADMIN_EMAIL && env.BOOTSTRAP_TOKEN === undefined) {
    resolved.BOOTSTRAP_TOKEN = "dev-setup";
  }
  return resolved;
}

function run(label, command, args, env) {
  console.log(`[dev-api] ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    if (label.startsWith("Migrationen")) {
      console.error(
        `[dev-api] Migrationen fehlgeschlagen. Läuft Postgres und existiert die Datenbank aus APP_PG_URL (${env.APP_PG_URL})? Anlegen z. B. mit: CREATE DATABASE <name>;`,
      );
    }
    process.exit(result.status ?? 1);
  }
}

function main() {
  const env = resolveDevApiEnv();
  run(
    "Store-Paket bauen (@senticor/app-store-postgres)",
    "pnpm",
    ["--filter", "@senticor/app-store-postgres", "build"],
    env,
  );
  run(
    `Migrationen fahren (${env.APP_PG_URL})`,
    "pnpm",
    ["--filter", "@senticor/app-store-postgres", "db:migrate"],
    env,
  );
  run(
    "Server-Bundle bauen (@senticor/fachverfahren build:server)",
    "pnpm",
    ["--filter", "@senticor/fachverfahren", "build:server"],
    env,
  );
  console.log(
    `[dev-api] Runtime startet auf http://${env.HOST}:${env.PORT}` +
      (env.BOOTSTRAP_TOKEN
        ? ` — Einmal-Setup auf der Landing ("/") mit Bootstrap-Token "${env.BOOTSTRAP_TOKEN}"`
        : ""),
  );
  const server = spawn("node", ["apps/fachverfahren/dist-server/index.js"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  server.on("exit", (code) => process.exit(code ?? 0));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
