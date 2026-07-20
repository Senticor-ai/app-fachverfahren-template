// zone-gate.test — der ZONEN-ROUTE-GATE des BFF (BSI-Netzsegmentierung, Angriffsflächen-Reduktion). appBff registriert
// eine Routen-Familie NUR, wenn ihre Flächen die `allowedSurfaces` der Zone schneiden (Infra-Familien immer). Beweist:
//   (1) undefined ⇒ ALLE Familien (fail-open, heutiger Ein-App-Zustand);
//   (2) die internet-exponierte Bürger-Zone bekommt NUR Infra + buerger + mailbox — KEINE Back-Office-Endpunkte
//       (cases/tasks/vermerke/verfahren-wissen): die harte Angriffsflächen-Invariante;
//   (3) die interne Sachbearbeitungs-/Aufsichts-Zone bekommt Back-Office, aber KEINE Bürger-Familie;
//   (4) Infra (session/capabilities/preferences/ai-assist) ist in JEDER Zone präsent;
//   (5) leere Flächen-Liste ⇒ fail-open (kein versehentliches Total-Aussperren).
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  MemoryAuditSink,
  NoSessionResolver,
} from "@senticor/app-runtime-fastify";
import {
  InMemoryAppStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import { createInMemoryProcedureRegistry } from "@senticor/public-sector-sdk";
import { appBff, type BffSurface } from "./plugin.js";

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

/** Baut appBff mit den gegebenen allowedSurfaces und sammelt die registrierten /api-URLs (ohne HEAD-Duplikate). */
async function collectApiUrls(
  allowedSurfaces?: readonly BffSurface[],
): Promise<string[]> {
  const app = fastify({ logger: false });
  apps.push(app);
  const urls = new Set<string>();
  app.addHook("onRoute", (route) => {
    if (route.method === "HEAD") return;
    if (route.url.startsWith("/api/")) urls.add(route.url);
  });
  await app.register(appBff, {
    appStore: new InMemoryAppStore(),
    caseStore: new InMemoryCaseStore(),
    taskStore: new InMemoryTaskStore(),
    procedureRegistry: createInMemoryProcedureRegistry([]),
    sessionResolver: new NoSessionResolver(),
    auditSink: new MemoryAuditSink(),
    ...(allowedSurfaces ? { allowedSurfaces } : {}),
  });
  await app.ready();
  return [...urls];
}

const INFRA = [
  "/api/session",
  "/api/capabilities",
  "/api/ai/assist",
  "/api/preferences",
];
const hasAll = (urls: string[], needles: string[]): boolean =>
  needles.every((n) => urls.includes(n));
const hasBuerger = (urls: string[]): boolean =>
  urls.some((u) => u.startsWith("/api/buerger"));
const hasMailbox = (urls: string[]): boolean => urls.includes("/api/mailbox");
// Back-Office = die Fall-/Aufgaben-/Wissens-Familien (registerCaseRoutes/TaskRoutes/VerfahrenWissenRoutes).
const hasBackoffice = (urls: string[]): boolean =>
  urls.some(
    (u) =>
      u.startsWith("/api/cases") ||
      u.startsWith("/api/tasks") ||
      u.startsWith("/api/verfahren"),
  );

describe("Zonen-Route-Gate (appBff.allowedSurfaces)", () => {
  it("(1) undefined ⇒ ALLE Familien registriert (fail-open, Ein-App)", async () => {
    const urls = await collectApiUrls(undefined);
    expect(hasAll(urls, INFRA)).toBe(true);
    expect(hasBuerger(urls)).toBe(true);
    expect(hasMailbox(urls)).toBe(true);
    expect(hasBackoffice(urls)).toBe(true);
  });

  it("(2) Bürger-Zone (exponiert) ⇒ Infra + buerger + mailbox, KEIN Back-Office (harte Invariante)", async () => {
    const urls = await collectApiUrls(["buerger"]);
    expect(hasAll(urls, INFRA)).toBe(true);
    expect(hasBuerger(urls)).toBe(true);
    expect(hasMailbox(urls)).toBe(true); // scope-split: eigenes Postfach
    expect(hasBackoffice(urls)).toBe(false); // KEIN Fall-/Aufgaben-/Wissens-Endpunkt am internet-exponierten Pod
  });

  it("(3) Sachbearbeitungs-/Aufsichts-Zone ⇒ Back-Office, KEINE Bürger-Familie", async () => {
    const urls = await collectApiUrls(["sachbearbeitung", "aufsicht"]);
    expect(hasAll(urls, INFRA)).toBe(true);
    expect(hasBackoffice(urls)).toBe(true);
    expect(hasBuerger(urls)).toBe(false);
  });

  it("(4) reine Aufsichts-Zone ⇒ liest Fälle/Vermerke/Wissen (nur-lesend bricht nicht), kein Bürger", async () => {
    const urls = await collectApiUrls(["aufsicht"]);
    expect(urls).toContain("/api/cases");
    expect(urls.some((u) => u.startsWith("/api/verfahren"))).toBe(true);
    expect(hasBuerger(urls)).toBe(false);
  });

  it("(5) leere Flächen-Liste (zonierte STRUKTUR-Zone) ⇒ NUR Infra, KEINE Fläche — NICHT fail-open", async () => {
    // Wurzel eines Green-Wash-Befunds: `[]` ist eine zonierte Daten-Zone (z. B. datenhaltung), die keine Fläche servieren
    // darf — NICHT dasselbe wie `undefined` (nicht zoniert, fail-open). Nur Infra registriert; kein Bürger/Back-Office/Postfach.
    const urls = await collectApiUrls([]);
    expect(hasAll(urls, INFRA)).toBe(true);
    expect(hasBackoffice(urls)).toBe(false);
    expect(hasBuerger(urls)).toBe(false);
    expect(hasMailbox(urls)).toBe(false);
  });

  it("(6) undefined ≠ [] : nur `undefined` ist fail-open (die Sentinel-Disziplin)", async () => {
    const failOpen = await collectApiUrls(undefined);
    const structural = await collectApiUrls([]);
    expect(hasBackoffice(failOpen)).toBe(true); // nicht zoniert ⇒ alles
    expect(hasBackoffice(structural)).toBe(false); // zonierte Struktur-Zone ⇒ nichts
  });
});
