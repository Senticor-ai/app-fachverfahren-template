// Rückstau-Metrik (#10) — der Outbox-Backlog als Prometheus-Text. EINE Wahrheit für BEIDE Scrape-Pfade: den
// /metrics-Endpunkt des eigenständigen Workers UND das /internal/metrics des Web-Prozesses (der In-Process-Poller).
// Der Autoscaler (KEDA/Custom-HPA) skaliert das Worker-Deployment auf diesem Signal — der Event-Rückstau ist die
// natürliche Skalierungsachse (nicht CPU: ein CPU-idler Worker mit riesigem Rückstau MUSS hochskalieren).
import type { AutomationBacklogStats } from "@senticor/app-store-postgres";

/** Frist für die Rückstau-Abfrage im Scrape-Pfad (ms). Bindet eine lahme/hängende DB, damit der Scrape NICHT blockiert:
 *  am /internal/metrics bleiben so die Basis-Metriken (HTTP/Build), am Worker-/metrics wird 500 geantwortet statt zu
 *  hängen. Grösser als das DB-seitige `statement_timeout` (in backlogStats), damit im Normalfall die DB zuerst abbricht
 *  (und die Verbindung freigibt) und diese app-seitige Frist nur der Backstop für eine tote TCP-Verbindung ist. */
export const BACKLOG_SCRAPE_TIMEOUT_MS = 4000;

/** Bindet eine (potenziell hängende) asynchrone Ladung an eine Frist: lehnt nach `ms` ab, statt unbegrenzt zu warten.
 *  Der Timer wird bei Abschluss gelöscht (kein offener Handle, der den Prozess wachhält). */
export function mitFrist<T>(laden: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Zeitüberschreitung nach ${ms}ms`)),
      ms,
    );
    laden().then(
      (wert) => {
        clearTimeout(timer);
        resolve(wert);
      },
      (fehler: unknown) => {
        clearTimeout(timer);
        reject(fehler instanceof Error ? fehler : new Error(String(fehler)));
      },
    );
  });
}

/** Rendert den Outbox-Rückstau als Prometheus-Gauge `app_automation_backlog{state=…}`. `due` = fälliger Rückstand
 *  (Skalierungsachse), `claimable` = gerade frei greifbar (deckungsgleich zum Claim), `scheduled` = noch nicht fällig. */
export function renderBacklogMetrics(stats: AutomationBacklogStats): string {
  return [
    "# HELP app_automation_backlog Unverarbeitete Automations-Outbox-Events nach Zustand.",
    "# TYPE app_automation_backlog gauge",
    `app_automation_backlog{state="due"} ${stats.due}`,
    `app_automation_backlog{state="claimable"} ${stats.claimable}`,
    `app_automation_backlog{state="scheduled"} ${stats.scheduled}`,
    "",
  ].join("\n");
}
