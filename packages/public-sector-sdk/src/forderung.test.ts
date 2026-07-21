// forderung.test — die reine Sollstellungs-/Restbetrag-Ableitung (#62, ADR-0007 §2): order-unabhängig,
// ganzzahlige Cent, Status-Vorrang, Mahnbarkeit gegen injizierte Zeit.
import { describe, expect, it } from "vitest";
import {
  berechneForderungsstand,
  forderungsstandAusAudit,
  istForderungMahnbar,
  planeMahnung,
  FORDERUNG_GESTELLT,
  FORDERUNG_ZAHLUNG_EINGEGANGEN,
  FORDERUNG_GEMAHNT,
  FORDERUNG_NIEDERGESCHLAGEN,
  FORDERUNG_GESTUNDET,
  type ForderungEreignis,
} from "./forderung.js";

const gestellt = (
  betragCent: number,
  faelligIso: string,
  occurredAt = "2026-01-01T00:00:00.000Z",
): ForderungEreignis => ({
  art: FORDERUNG_GESTELLT,
  betragCent,
  faelligIso,
  occurredAt,
});
const zahlung = (
  betragCent: number,
  occurredAt = "2026-01-05T00:00:00.000Z",
): ForderungEreignis => ({
  art: FORDERUNG_ZAHLUNG_EINGEGANGEN,
  betragCent,
  occurredAt,
});

describe("berechneForderungsstand", () => {
  it("keine Sollstellung → status 'keine', alles 0", () => {
    expect(berechneForderungsstand([])).toEqual({
      status: "keine",
      sollCent: 0,
      gezahltCent: 0,
      offenCent: 0,
      mahnstufe: 0,
    });
  });

  it("offene Sollstellung ohne Zahlung → 'offen', offen = soll", () => {
    const s = berechneForderungsstand([gestellt(12000, "2026-02-01")]);
    expect(s.status).toBe("offen");
    expect(s.sollCent).toBe(12000);
    expect(s.offenCent).toBe(12000);
    expect(s.faelligIso).toBe("2026-02-01");
  });

  it("Teilzahlung → 'teilweise-bezahlt', offen = soll − gezahlt", () => {
    const s = berechneForderungsstand([
      gestellt(12000, "2026-02-01"),
      zahlung(5000),
    ]);
    expect(s.status).toBe("teilweise-bezahlt");
    expect(s.gezahltCent).toBe(5000);
    expect(s.offenCent).toBe(7000);
  });

  it("Vollzahlung (auch über mehrere Eingänge) → 'erledigt', offen 0 — order-unabhängig", () => {
    const s = berechneForderungsstand([
      zahlung(7000, "2026-03-01"),
      gestellt(12000, "2026-02-01"),
      zahlung(5000, "2026-02-10"),
    ]);
    expect(s.status).toBe("erledigt");
    expect(s.offenCent).toBe(0);
  });

  it("Niederschlagung hat Vorrang (auch bei offenem Rest)", () => {
    const s = berechneForderungsstand([
      gestellt(12000, "2026-02-01"),
      { art: FORDERUNG_NIEDERGESCHLAGEN, occurredAt: "2026-04-01" },
    ]);
    expect(s.status).toBe("niedergeschlagen");
    expect(s.offenCent).toBe(12000);
  });

  it("Stundung → 'gestundet' + verlängerte Fälligkeit gewinnt", () => {
    const s = berechneForderungsstand([
      gestellt(12000, "2026-02-01"),
      {
        art: FORDERUNG_GESTUNDET,
        faelligIso: "2026-06-01",
        occurredAt: "2026-02-15",
      },
    ]);
    expect(s.status).toBe("gestundet");
    expect(s.faelligIso).toBe("2026-06-01");
  });

  it("Mahnungen werden gezählt (Mahnstufe)", () => {
    const s = berechneForderungsstand([
      gestellt(12000, "2026-02-01"),
      { art: FORDERUNG_GEMAHNT, occurredAt: "2026-03-01" },
      { art: FORDERUNG_GEMAHNT, occurredAt: "2026-04-01" },
    ]);
    expect(s.mahnstufe).toBe(2);
  });

  it("ungültige/negative Beträge verfälschen die Summe nicht (defensiv)", () => {
    const s = berechneForderungsstand([
      gestellt(12000, "2026-02-01"),
      { art: FORDERUNG_ZAHLUNG_EINGEGANGEN, betragCent: -50, occurredAt: "x" },
      {
        art: FORDERUNG_ZAHLUNG_EINGEGANGEN,
        betragCent: Number.NaN,
        occurredAt: "y",
      },
    ]);
    expect(s.gezahltCent).toBe(0);
    expect(s.offenCent).toBe(12000);
  });
});

describe("forderungsstandAusAudit (READ-Brücke aus dem Fall-Audit)", () => {
  it("liest nur forderung.*-Ereignisse + rechnet den Stand (Betrag/Fälligkeit aus payload)", () => {
    const stand = forderungsstandAusAudit([
      { eventType: "case.transitioned", occurredAt: "2026-01-01" },
      {
        eventType: FORDERUNG_GESTELLT,
        payload: { betragCent: 12000, faelligIso: "2026-02-01" },
        occurredAt: "2026-01-02",
      },
      {
        eventType: FORDERUNG_ZAHLUNG_EINGEGANGEN,
        payload: { betragCent: 5000 },
        occurredAt: "2026-01-10",
      },
    ]);
    expect(stand.status).toBe("teilweise-bezahlt");
    expect(stand.offenCent).toBe(7000);
    expect(stand.faelligIso).toBe("2026-02-01");
  });

  it("kein forderung.*-Ereignis → status 'keine'", () => {
    expect(
      forderungsstandAusAudit([
        { eventType: "case.disclosed", occurredAt: "2026-01-01" },
      ]).status,
    ).toBe("keine");
  });

  it("liest eine EINGEBETTETE Sollstellung aus payload.forderung (atomar mit dem Übergang)", () => {
    const stand = forderungsstandAusAudit([
      {
        eventType: "case.transitioned",
        payload: {
          newState: "rueckforderung_festgesetzt",
          forderung: {
            art: FORDERUNG_GESTELLT,
            betragCent: 9000,
            faelligIso: "2026-03-01",
          },
        },
        occurredAt: "2026-02-01",
      },
    ]);
    expect(stand.status).toBe("offen");
    expect(stand.offenCent).toBe(9000);
    expect(stand.faelligIso).toBe("2026-03-01");
  });
});

describe("istForderungMahnbar", () => {
  it("offen + fällig erreicht → mahnbar", () => {
    const s = berechneForderungsstand([gestellt(12000, "2026-02-01")]);
    expect(istForderungMahnbar(s, "2026-02-02")).toBe(true);
  });
  it("offen aber noch nicht fällig → nicht mahnbar", () => {
    const s = berechneForderungsstand([gestellt(12000, "2026-02-01")]);
    expect(istForderungMahnbar(s, "2026-01-15")).toBe(false);
  });
  it("erledigt/gestundet/niedergeschlagen → nie mahnbar", () => {
    const erledigt = berechneForderungsstand([
      gestellt(100, "2026-02-01"),
      zahlung(100),
    ]);
    const gestundet = berechneForderungsstand([
      gestellt(100, "2026-02-01"),
      { art: FORDERUNG_GESTUNDET, faelligIso: "2026-09-01", occurredAt: "z" },
    ]);
    expect(istForderungMahnbar(erledigt, "2027-01-01")).toBe(false);
    expect(istForderungMahnbar(gestundet, "2027-01-01")).toBe(false);
  });

  it("eine Mahnung VERLÄNGERT die Frist → nicht sofort erneut mahnbar (kein Dauer-Mahnen)", () => {
    const stand = berechneForderungsstand([
      gestellt(12000, "2026-02-01", "2026-01-01"),
      {
        art: FORDERUNG_GEMAHNT,
        faelligIso: "2026-03-15",
        occurredAt: "2026-02-05",
      },
    ]);
    // Maßgeblich ist jetzt die Mahn-Frist (jüngstes fristsetzendes Ereignis).
    expect(stand.faelligIso).toBe("2026-03-15");
    expect(stand.mahnstufe).toBe(1);
    expect(istForderungMahnbar(stand, "2026-02-10")).toBe(false); // vor der neuen Frist
    expect(istForderungMahnbar(stand, "2026-03-20")).toBe(true); // nach der neuen Frist
  });
});

describe("planeMahnung (überfällig + Stufe unter Obergrenze)", () => {
  const offenFaellig = berechneForderungsstand([gestellt(12000, "2026-02-01")]);
  it("mahnbar + Stufe 0 → Mahnung", () => {
    expect(planeMahnung(offenFaellig, "2026-02-02")).toBe(true);
  });
  it("Obergrenze erreicht → keine weitere Mahnung (dann Vollstreckung/Niederschlagung)", () => {
    const dreiMalGemahnt = berechneForderungsstand([
      gestellt(12000, "2026-02-01", "2026-01-01"),
      {
        art: FORDERUNG_GEMAHNT,
        faelligIso: "2026-02-01",
        occurredAt: "2026-02-02",
      },
      {
        art: FORDERUNG_GEMAHNT,
        faelligIso: "2026-02-01",
        occurredAt: "2026-02-03",
      },
      {
        art: FORDERUNG_GEMAHNT,
        faelligIso: "2026-02-01",
        occurredAt: "2026-02-04",
      },
    ]);
    expect(dreiMalGemahnt.mahnstufe).toBe(3);
    expect(planeMahnung(dreiMalGemahnt, "2026-06-01")).toBe(false);
  });
  it("nicht mahnbar → keine Mahnung", () => {
    expect(planeMahnung(offenFaellig, "2026-01-01")).toBe(false);
  });
});
