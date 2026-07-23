// ki-entwurf.test — der KI-Agenten-Pfad für Bescheide (#59/#60): der chos-Agent entwirft eine Begründung
// (limited-risk, HITL), und ein FREIGEGEBENER Entwurf wird zur Template-Freitext-Sektion. Läuft ohne
// laufendes chos über den InMemoryChosAgentClient-Fake.
import type { VerwaltungsaktDto } from "@senticor/app-bff-contracts";
import {
  createChosAiAssistPort,
  InMemoryChosAgentClient,
  type AiSuggestion,
  type PortCallContext,
} from "@senticor/platform-contracts";
import { describe, expect, it } from "vitest";
import {
  entwerfeBescheidBegruendung,
  freitextAusEntwurf,
} from "./ki-entwurf.js";

const VA: VerwaltungsaktDto = {
  aktenzeichen: "IGM-2026-0042",
  issuedAt: "2026-07-20T10:00:00.000Z",
  issuedBy: "sb.mueller",
  tenor: { leistung: "Bewilligung" },
  rechtsbehelf: {
    art: "widerspruch",
    fristWert: 1,
    fristEinheit: "monat",
    stelle: "Amt 50",
    norm: "§ 70 VwGO",
  },
  fiktionTage: 3,
  fiktionNorm: "§ 41 Abs. 2 VwVfG",
  tenorHerkunft: "server-nachgerechnet",
  checksumSha256: "a".repeat(64),
};

const ctx: PortCallContext = {
  requestId: "req-1",
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  purpose: "bescheid-entwurf",
};

function suggestion(value: unknown): AiSuggestion {
  return {
    value,
    confidence: 0.5,
    modelId: "chos:mesh",
    rationale: "r",
    sources: ["chos:handoff"],
    marking: "ki-vorschlag",
    euAiActClass: "limited-risk",
    reviewRequired: true,
  };
}

describe("entwerfeBescheidBegruendung (chos-Agent, AAL-2 Advise)", () => {
  it("liefert einen HITL-Vorschlag (limited-risk, reviewRequired) — nie final", async () => {
    const port = createChosAiAssistPort(new InMemoryChosAgentClient());
    const res = await entwerfeBescheidBegruendung(port, ctx, {
      va: VA,
      behoerde: "Stadt Musterstadt",
      hinweise: "kurz begründen",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.marking).toBe("ki-vorschlag");
    expect(res.value.euAiActClass).toBe("limited-risk");
    expect(res.value.reviewRequired).toBe(true);
  });
});

describe("freitextAusEntwurf (nach menschlicher Freigabe)", () => {
  it("String mit Doppel-Zeilenumbruch → mehrere Absätze", () => {
    const sektion = freitextAusEntwurf(
      suggestion("Absatz eins.\n\nAbsatz zwei."),
    );
    expect(sektion.kind).toBe("freitext");
    if (sektion.kind !== "freitext") return;
    expect(sektion.absaetze).toEqual(["Absatz eins.", "Absatz zwei."]);
    expect(sektion.ueberschrift).toBe("Begründung");
  });

  it("String-Array → Absätze", () => {
    const sektion = freitextAusEntwurf(suggestion(["eins", "zwei"]));
    if (sektion.kind !== "freitext") throw new Error("erwartet freitext");
    expect(sektion.absaetze).toEqual(["eins", "zwei"]);
  });

  it("Objekt mit {text} → Absätze", () => {
    const sektion = freitextAusEntwurf(suggestion({ text: "aus Objekt" }));
    if (sektion.kind !== "freitext") throw new Error("erwartet freitext");
    expect(sektion.absaetze).toEqual(["aus Objekt"]);
  });

  it("leerer/unverwertbarer Entwurf → sichtbarer Platzhalter (kein stilles Verschlucken)", () => {
    const sektion = freitextAusEntwurf(suggestion(42));
    if (sektion.kind !== "freitext") throw new Error("erwartet freitext");
    expect(sektion.absaetze).toEqual(["(kein Begründungstext übernommen)"]);
  });
});
