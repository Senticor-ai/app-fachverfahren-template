import { describe, it, expect } from "vitest";
import { HeuristicKiAssist } from "./ai-assist.js";

const NOW = "2026-07-10T00:00:00.000Z";
const ki = new HeuristicKiAssist(() => NOW);

describe("HeuristicKiAssist — assistiv, erklärbar, deterministisch", () => {
  it("leitet hohe Priorität + eilig-Label aus knapper Frist ab", async () => {
    const s = await ki.suggest(
      {
        tenantId: "t1",
        authorityId: "b1",
        procedureId: "leistung",
        taskId: "task-1",
        faelligIso: "2026-07-12T00:00:00.000Z", // 2 Tage
      },
      {},
    );
    expect(s.vorschlag.prioritaet).toBe("hoch");
    expect(s.vorschlag.labels).toContain("eilig");
    expect(s.marking).toBe("ki-vorschlag");
    expect(s.reviewRequired).toBe(true);
    expect(s.euAiActClass).toBe("limited-risk");
    expect(s.quellen.length).toBeGreaterThan(0);
  });

  it("schlägt bei hohem Betrag einen Entscheidungs-ENTWURF vor (nie final)", async () => {
    const s = await ki.suggest(
      {
        tenantId: "t1",
        authorityId: "b1",
        procedureId: "leistung",
        taskId: "task-2",
      },
      { daten: { betrag: "1500,00" } },
    );
    expect(s.vorschlag.entscheidungsentwurf).toBeTypeOf("string");
    expect(s.begruendung).toContain("Betrag");
  });

  it("bleibt ohne Signale schwach + transparent", async () => {
    const s = await ki.suggest(
      {
        tenantId: "t1",
        authorityId: "b1",
        procedureId: "leistung",
        taskId: "t3",
      },
      {},
    );
    expect(s.konfidenz).toBeLessThanOrEqual(0.5);
    expect(s.reviewRequired).toBe(true);
  });

  it("ist deterministisch (gleicher Input → gleicher Vorschlag)", async () => {
    const ctx = {
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      taskId: "t4",
      faelligIso: "2026-07-20T00:00:00.000Z",
    };
    const a = await ki.suggest(ctx, {});
    const b = await ki.suggest(ctx, {});
    expect(a).toEqual(b);
  });
});
