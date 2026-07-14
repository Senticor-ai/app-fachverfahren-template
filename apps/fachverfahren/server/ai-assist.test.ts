import { describe, it, expect } from "vitest";

import { HeuristicKiAssist } from "./ai-assist.js";
import type { VorgangKiVorschlag } from "./ai-assist.js";

const NOW = "2026-07-10T00:00:00.000Z";
const ki = new HeuristicKiAssist(() => NOW);
const CTX = {
  requestId: "r1",
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "b1",
};

/** Ruft den kanonischen Port und packt den Erfolgsfall aus (wirft bei failure). */
async function suggest(input: Record<string, unknown>) {
  const r = await ki.suggest(CTX, { task: "vorgang-assist", input });
  if (!r.ok) throw new Error(`unerwartet failure: ${r.error.message}`);
  return r.value;
}

describe("HeuristicKiAssist — kanonischer AiAssistPort, assistiv + erklärbar", () => {
  it("leitet hohe Priorität + eilig-Label aus knapper Frist ab", async () => {
    const s = await suggest({ faelligIso: "2026-07-12T00:00:00.000Z" }); // 2 Tage
    const v = s.value as VorgangKiVorschlag;
    expect(v.prioritaet).toBe("hoch");
    expect(v.labels).toContain("eilig");
    expect(s.marking).toBe("ki-vorschlag");
    expect(s.reviewRequired).toBe(true);
    expect(s.euAiActClass).toBe("limited-risk");
    expect(s.modelId).toBe("heuristik:frist-betrag");
    expect(s.sources.length).toBeGreaterThan(0);
  });

  it("schlägt bei hohem Betrag einen Entscheidungs-ENTWURF vor (nie final)", async () => {
    const s = await suggest({ daten: { betrag: "1500,00" } });
    const v = s.value as VorgangKiVorschlag;
    expect(v.entscheidungsentwurf).toBeTypeOf("string");
    expect(s.rationale).toContain("Betrag");
  });

  it("bleibt ohne Signale schwach + transparent", async () => {
    const s = await suggest({});
    expect(s.confidence).toBeLessThanOrEqual(0.5);
    expect(s.reviewRequired).toBe(true);
  });

  it("ist deterministisch (gleicher Input → gleiche Antwort)", async () => {
    const request = {
      task: "vorgang-assist",
      input: { faelligIso: "2026-07-20T00:00:00.000Z" },
    };
    const a = await ki.suggest(CTX, request);
    const b = await ki.suggest(CTX, request);
    expect(a).toEqual(b);
  });

  it("lehnt high-risk-Aufgaben ab — die KI entscheidet nie autonom", async () => {
    const r = await ki.suggest(CTX, {
      task: "vorgang-assist",
      input: {},
      maxClass: "high-risk",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toContain("high-risk");
  });
});
