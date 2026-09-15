// THE BADGE MUST NOT CERTIFY WHAT THE RUN ITSELF DENIES.
//
// THE CASE, measured 2026-09-09 on a generated application: the citizen screen carried «VORLÄUFIG · §-BELEGT»
// above 96,00 €/Jahr, while the very same run recorded all 29 legal bases as «(Annahme)», the relevant
// municipal statute as a knowledge gap, and `SAETZE_BELEGT = false` in the seam. The badge certified exactly
// what the run denies about itself.
import { describe, expect, it } from "vitest";
import { resultBadge } from "./ergebnis-plakette.js";

describe("resultBadge", () => {
  it("THE CASE: rates reported as unbacked ⇒ the badge does NOT certify", () => {
    const p = resultBadge({
      aiSuggestion: false,
      provisional: true,
      ratesBacked: false,
    });
    expect(p.claimsBacked).toBe(false);
    expect(p.text).not.toContain("§-belegt");
    expect(p.text).toContain("ANNAHME");
  });

  it("…and the heading says so in plain words, not only the badge", () => {
    const p = resultBadge({
      aiSuggestion: false,
      provisional: false,
      ratesBacked: false,
    });
    expect(p.heading).toMatch(/ANNAHMEN, nicht belegt/);
  });

  it("POSITIVE CONTROL: backed rates ⇒ the badge still certifies", () => {
    const p = resultBadge({
      aiSuggestion: false,
      provisional: false,
      ratesBacked: true,
    });
    expect(p.claimsBacked).toBe(true);
    expect(p.text).toBe("§-belegt · Prüfschema");
  });

  // ⛔ FAIL-OPEN: an application that does NOT know behaves exactly as before — otherwise the change would be
  // a silent tightening for every existing application, and that is exactly what it must not be.
  it("FAIL-OPEN: with nothing reported, the previous behaviour stays unchanged", () => {
    const unset = resultBadge({ aiSuggestion: false, provisional: true });
    const backed = resultBadge({
      aiSuggestion: false,
      provisional: true,
      ratesBacked: true,
    });
    expect(unset).toEqual(backed);
  });

  it("an AI suggestion stays an AI suggestion — and never certifies", () => {
    for (const s of [undefined, true, false] as const) {
      const p = resultBadge({
        aiSuggestion: true,
        provisional: false,
        ratesBacked: s,
      });
      expect(p.text).toBe("KI-Vorschlag");
      expect(p.claimsBacked).toBe(false);
    }
  });

  // COUNTER-CHECK: the old rule would have certified in the target case — otherwise this witness measures nothing.
  it("COUNTER-CHECK: the old rule (aiSuggestion alone) would have shown «§-belegt» in the target case", () => {
    const oldRule = (ai: boolean, provisional: boolean) =>
      ai
        ? "KI-Vorschlag"
        : provisional
          ? "vorläufig · §-belegt"
          : "§-belegt · Prüfschema";
    expect(oldRule(false, true)).toContain("§-belegt");
    expect(
      resultBadge({
        aiSuggestion: false,
        provisional: true,
        ratesBacked: false,
      }).text,
    ).not.toContain("§-belegt");
  });
});
