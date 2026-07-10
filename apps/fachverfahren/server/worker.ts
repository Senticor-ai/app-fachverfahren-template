#!/usr/bin/env node
// server/worker.ts — der eigenständige Automations-WORKER (Event-Driven Architecture / horizontale Skalierung).
//
// Trennt die EVENT-Verarbeitung (transaktionale Automations-Outbox + zeitgetriebener Deadline-Scanner) vom WEB-
// Prozess: der Web-Prozess skaliert für Requests (HPA), der Worker für Events. Mehrere Worker-Replicas koordinieren
// über `FOR UPDATE SKIP LOCKED` im Store — kein Doppel-Claim, kein Event-Sturm, kein Doppelfeuern von Fristen. Der
// Worker serviert KEINEN Domain-Traffic; nur ein minimaler `/livez`-HTTP-Endpunkt (K8s-Liveness), der auf einem
// veralteten Heartbeat (letzter ABGESCHLOSSENER Tick) mit 503 antwortet, damit ein hängender Worker neu startet.
//
// Sinnvoll nur mit GETEILTEM Zustand (Postgres: APP_PG_URL/APP_PG_DIRECT_URL). Mit In-Memory-Store hätte ein separater
// Prozess seinen eigenen, leeren Store — der Worker warnt dann und läuft ins Leere.
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import { closePgPools } from "@senticor/app-store-postgres";
import {
  automationEngineDepsFrom,
  automationTickRunner,
  buildDomainApiFromEnv,
  logError,
  logInfo,
  parseNonNegativeInt,
} from "./index.js";

export interface WorkerHandle {
  stop: () => Promise<void>;
}

/** Startet den Worker-Loop: baut die Domain-/Engine-Deps aus der Umgebung und feuert `runAutomationTick` im Intervall.
 *  Gibt `undefined` zurück, wenn keine Automations-Datenschicht konfiguriert ist (nichts zu tun). */
export async function startWorker(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkerHandle | undefined> {
  const domainApi = await buildDomainApiFromEnv(env);
  if (!domainApi?.automationStore) {
    logError("worker.no-automation-store", {
      hint: "APP_LEISTUNG_CONTRACT (+ APP_PG_URL für geteilten Zustand) erforderlich",
    });
    return undefined;
  }
  const usesPostgres = Boolean(env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"]);
  if (!usesPostgres)
    logInfo("worker.warning", {
      warning:
        "In-Memory-Store: ein separater Worker-Prozess hat seinen eigenen leeren Zustand — für echte Skalierung Postgres konfigurieren",
    });

  const pollMs = Math.max(
    250,
    parseNonNegativeInt(
      env["APP_WORKER_POLL_MS"] ?? env["APP_AUTOMATION_POLL_MS"],
      2000,
    ),
  );
  // Heartbeat: der Zeitpunkt des zuletzt ABGESCHLOSSENEN Ticks (via onSettled, NICHT beim Timer-Feuern). Nur so
  // erkennt die Liveness einen HÄNGENDEN Tick: bleibt ein Tick stecken, veraltet dieser Wert → /livez 503 → Neustart.
  // Startwert „jetzt", damit das erste maxAlterMs-Fenster vor dem ersten Tick-Abschluss gesund ist.
  let letzterTick = Date.now();
  const runTick = automationTickRunner(
    automationEngineDepsFrom(domainApi),
    () => {
      letzterTick = Date.now();
    },
  );
  const timer = setInterval(runTick, pollMs);

  // Minimaler HTTP-Liveness-Server (portabel, kein Shell/`stat` nötig). Der Worker serviert KEINEN Domain-Traffic;
  // nur `/livez` (200, solange der letzte Tick nicht älter als das Vielfache des Poll-Intervalls ist).
  const healthPort = parseNonNegativeInt(env["APP_WORKER_HEALTH_PORT"], 0);
  let health: Server | undefined;
  if (healthPort > 0) {
    const maxAlterMs = Math.max(30_000, pollMs * 6);
    health = createServer((req, res) => {
      const frisch = Date.now() - letzterTick < maxAlterMs;
      const ok = req.url === "/livez" && frisch;
      res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: ok ? "ok" : "stale", letzterTick }));
    });
    health.listen(healthPort, () =>
      logInfo("worker.health", { port: healthPort }),
    );
    health.unref();
  }
  logInfo("worker.started", { pollMs, postgres: usesPostgres, healthPort });

  const stop = async () => {
    clearInterval(timer);
    if (health) await new Promise<void>((r) => health!.close(() => r()));
    await closePgPools().catch(() => {});
    logInfo("worker.stopped", {});
  };
  return { stop };
}

// Prozess-Entrypoint: starten + SIGTERM/SIGINT sauber behandeln (K8s-Rolling-Update ohne hängenden Claim).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  void startWorker().then((handle) => {
    if (!handle) {
      process.exitCode = 1;
      return;
    }
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.on(signal, () => {
        logInfo("worker.shutdown", { signal });
        void handle.stop().then(() => process.exit(0));
      });
    }
  });
}
