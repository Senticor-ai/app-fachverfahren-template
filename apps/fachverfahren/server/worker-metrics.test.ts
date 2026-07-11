import { describe, expect, it } from "vitest";
import { mitFrist, renderBacklogMetrics } from "./worker-metrics.js";

describe("renderBacklogMetrics — Prometheus-Text des Outbox-Rückstaus (#10)", () => {
  it("rendert HELP/TYPE + die drei Zustands-Gauges", () => {
    const text = renderBacklogMetrics({ due: 7, claimable: 4, scheduled: 2 });
    expect(text).toContain("# HELP app_automation_backlog");
    expect(text).toContain("# TYPE app_automation_backlog gauge");
    expect(text).toContain('app_automation_backlog{state="due"} 7');
    expect(text).toContain('app_automation_backlog{state="claimable"} 4');
    expect(text).toContain('app_automation_backlog{state="scheduled"} 2');
    // Prometheus-Textformat endet mit Zeilenumbruch.
    expect(text.endsWith("\n")).toBe(true);
  });

  it("rendert Nullwerte EXPLIZIT (leerer Rückstau ⇒ Gauge=0, nicht fehlend — der Scaler skaliert dann auf min)", () => {
    const text = renderBacklogMetrics({ due: 0, claimable: 0, scheduled: 0 });
    expect(text).toContain('app_automation_backlog{state="due"} 0');
    expect(text).toContain('app_automation_backlog{state="claimable"} 0');
    expect(text).toContain('app_automation_backlog{state="scheduled"} 0');
  });
});

describe("mitFrist — Fristbindung der Rückstau-Abfrage (#10, Review-Fix)", () => {
  it("liefert das Ergebnis, wenn die Ladung vor der Frist fertig ist", async () => {
    const stats = await mitFrist(
      async () => ({ due: 3, claimable: 2, scheduled: 1 }),
      1000,
    );
    expect(stats).toEqual({ due: 3, claimable: 2, scheduled: 1 });
  });

  it("lehnt nach der Frist ab, wenn die Ladung hängt (der Scrape blockiert NICHT unbegrenzt)", async () => {
    await expect(
      // Ladung, die nie auflöst (hängende DB) ⇒ die Frist muss greifen.
      mitFrist(() => new Promise<never>(() => {}), 20),
    ).rejects.toThrow(/Zeitüberschreitung/);
  });

  it("reicht einen echten Ladefehler durch (kein Verschlucken vor der Frist)", async () => {
    await expect(
      mitFrist(() => Promise.reject(new Error("db weg")), 1000),
    ).rejects.toThrow("db weg");
  });
});
