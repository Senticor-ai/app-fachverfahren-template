// test:e2e — echter End-to-End-Rauchtest OHNE Browser: baut die App real (vite build → dist/) und prüft via
// fastify `app.inject()`, dass der Produktions-Server das gebaute SPA auf ALLEN Persona-Routen ausliefert
// (Bürger/Amt/Aufsicht) sowie die interne Health-Route antwortet. Deterministisch, hermetisch, CI-tauglich —
// deckt die Lücke zwischen „Unit-Test gegen synthetisches Verzeichnis" (server/index.test.ts) und „echtes Bundle".
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildPublicServer,
  readRuntimeConfig,
} from "../../apps/fachverfahren/server/index.js";

const STATIC_DIR = fileURLToPath(
  new URL("../../apps/fachverfahren/dist", import.meta.url),
);

// Alle client-seitigen Persona-Routen: das SPA wird für jede als index.html (mit #root-Mount) ausgeliefert.
const PERSONA_ROUTES = ["/", "/buerger", "/amt", "/aufsicht"];

beforeAll(async () => {
  // Reales Bundle erzeugen (schnell via rolldown/vite). Danach MUSS dist/index.html existieren.
  execFileSync("pnpm", ["--filter", "@senticor/fachverfahren", "build"], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    stdio: "ignore",
  });
  await access(`${STATIC_DIR}/index.html`, constants.R_OK);
}, 180_000);

function publicApp() {
  const config = readRuntimeConfig({
    STATIC_DIR,
    NODE_ENV: "production",
    APP_ENABLE_SERVICE_WORKER: "false",
  });
  return buildPublicServer({
    config,
    state: { startupComplete: true, shuttingDown: false },
  });
}

describe("Persona-Routen (echtes dist/)", () => {
  it("liefert das gebaute SPA auf jeder Persona-Route (200 · HTML · #root-Mount)", async () => {
    const app = publicApp();
    try {
      for (const url of PERSONA_ROUTES) {
        const res = await app.inject({
          method: "GET",
          url,
          headers: { accept: "text/html" },
        });
        expect(res.statusCode, `${url} → Status`).toBe(200);
        expect(res.headers["content-type"], `${url} → content-type`).toContain(
          "text/html",
        );
        expect(res.body, `${url} → SPA-Mount`).toContain('id="root"');
      }
    } finally {
      await app.close();
    }
  });

  it("Health-Route /livez antwortet (Liveness)", async () => {
    const app = publicApp();
    try {
      const res = await app.inject({ method: "GET", url: "/livez" });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
