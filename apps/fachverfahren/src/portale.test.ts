import { describe, expect, it } from "vitest";
import { aktivesPortal, portale, waehlePortal } from "./portale.js";
import { beispielConfig } from "./leistung.config.beispiel.js";

// Testet die Portal-Registry (#21): die Auswahl per Id (fail-safe), die byte-stabile Default-Vorgabe und die
// Eigenständigkeit des 2. Demo-Portals (eigene Verfahren-Teilmenge + Marke) — die DATA-Basis für „mehrere Bürger-Apps".

describe("Portal-Registry (#21) — Auswahl + Invarianten", () => {
  it("das erste Portal ist der volle Default (keine Verfahren-Einschränkung, Start buerger)", () => {
    const standard = portale[0]!;
    expect(standard.id).toBe("buergerdienste");
    expect(standard.enabledProcedures).toBeUndefined(); // ⇒ ALLE Verfahren
    expect(standard.startPersona).toBe("buerger");
    expect(standard.marke).toBeDefined();
  });

  it("Portal-Ids sind eindeutig", () => {
    const ids = portale.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("waehlePortal ohne Id ⇒ Default-Portal (byte-stabil)", () => {
    expect(waehlePortal(undefined)).toBe(portale[0]);
  });

  it("waehlePortal mit unbekannter Id ⇒ fail-safe auf das Default-Portal (nie leer/kaputt)", () => {
    expect(waehlePortal("gibt-es-nicht")).toBe(portale[0]);
  });

  it("aktivesPortal ist im Test (ohne VITE_PORTAL_ID) das Default-Portal", () => {
    expect(aktivesPortal).toBe(portale[0]);
  });

  it("Demo-Portal 'bescheinigungen' ist ein eigenständiges Portal: nur das Bescheinigungs-Verfahren, eigene Marke", () => {
    const portal = waehlePortal("bescheinigungen");
    // Im unveränderten Vorlagen-Zustand existiert das Demo-Portal.
    expect(portal.id).toBe("bescheinigungen");
    expect(portal.enabledProcedures).toEqual([beispielConfig.id]);
    // Eigene Marke, deutlich anders als der Default (belegt White-Labeling je Portal).
    expect(portal.marke?.brand?.primary).toBeDefined();
    expect(portal.marke?.brand?.primary).not.toBe(
      portale[0]!.marke?.brand?.primary,
    );
  });
});
