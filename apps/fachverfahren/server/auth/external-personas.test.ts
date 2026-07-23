// external-personas.test.ts — der AUSFÜHRBARE OIDC-Claim-Vertrag (B5/B6), lange bevor ein
// OIDC-Callback existiert: EIN kanonischer Claim (senticor_personas), explizite Zustands-
// Semantik (fehlt / leer / Werte / unbekannt / malformed) und die Autoritäts-Entscheidung
// je persona_management_mode. Der spätere Keycloak-Adapter übersetzt Provider-Strukturen
// (realm_access & Co.) in GENAU diesen Claim — die App liest nie Provider-Interna.
import { describe, expect, it } from "vitest";
import {
  decideExternalPersonaSync,
  MalformedPersonaClaimError,
  parseExternalPersonaClaim,
  PERSONA_CLAIM,
} from "./external-personas.js";

describe("parseExternalPersonaClaim", () => {
  it("fehlender Claim → absent (Mapping nicht verfügbar, KEINE Mutation implizieren)", () => {
    expect(parseExternalPersonaClaim({})).toEqual({ kind: "absent" });
  });

  it("leeres Array → present/leer (BEWUSSTES Entfernen externer Zuweisungen)", () => {
    expect(parseExternalPersonaClaim({ [PERSONA_CLAIM]: [] })).toEqual({
      kind: "present",
      personas: [],
      ignored: [],
    });
  });

  it("gültige Werte → normalisiert (kanonische Reihenfolge, dupe-frei)", () => {
    expect(
      parseExternalPersonaClaim({
        [PERSONA_CLAIM]: ["aufsicht", "buerger", "aufsicht"],
      }),
    ).toEqual({
      kind: "present",
      personas: ["buerger", "aufsicht"],
      ignored: [],
    });
  });

  it("verfahrens-eigene Persona-Claims werden AKZEPTIERT (Personas sind offen, nichts ignoriert)", () => {
    // Personas sind Erlebnis, keine Autz: ein IdP darf verfahrens-eigene Personas (z.B. `hausmeister`)
    // liefern. Sie werden uebernommen (kanonisch sortiert: Default-Personas zuerst), nichts wird ignoriert.
    expect(
      parseExternalPersonaClaim({
        [PERSONA_CLAIM]: ["sachbearbeitung", "hausmeister"],
      }),
    ).toEqual({
      kind: "present",
      personas: ["sachbearbeitung", "hausmeister"],
      ignored: [],
    });
  });

  it("malformed (kein Array / Nicht-String-Elemente / überlang) → Fehler, NIE überschreiben", () => {
    expect(() =>
      parseExternalPersonaClaim({ [PERSONA_CLAIM]: "buerger" }),
    ).toThrow(MalformedPersonaClaimError);
    expect(() => parseExternalPersonaClaim({ [PERSONA_CLAIM]: [42] })).toThrow(
      MalformedPersonaClaimError,
    );
    expect(() =>
      parseExternalPersonaClaim({
        [PERSONA_CLAIM]: Array.from({ length: 20 }, () => "buerger"),
      }),
    ).toThrow(MalformedPersonaClaimError);
  });
});

// Autoritäts-Matrix: local ignoriert externe Claims; additive mutiert bei absent NICHT;
// authoritative OHNE Claim ist ein Provider-/Konfigurationsfehler → Login ablehnen
// (fail closed — „authoritative" heißt nicht „letzter bekannter Stand für immer").
describe("decideExternalPersonaSync", () => {
  const present = parseExternalPersonaClaim({
    [PERSONA_CLAIM]: ["sachbearbeitung"],
  });
  const absent = parseExternalPersonaClaim({});

  it("local: externe Claims sind irrelevant (noop), auch wenn vorhanden", () => {
    expect(decideExternalPersonaSync("local", present)).toEqual({
      action: "noop",
    });
    expect(decideExternalPersonaSync("local", absent)).toEqual({
      action: "noop",
    });
  });

  it("oidc_additive: vorhandener Claim synct, fehlender Claim mutiert NICHT", () => {
    expect(decideExternalPersonaSync("oidc_additive", present)).toEqual({
      action: "sync",
      personas: ["sachbearbeitung"],
      ignored: [],
    });
    expect(decideExternalPersonaSync("oidc_additive", absent)).toEqual({
      action: "noop",
    });
  });

  it("oidc_authoritative: fehlender Claim → Login ablehnen (fail closed)", () => {
    expect(decideExternalPersonaSync("oidc_authoritative", absent)).toEqual({
      action: "reject_login",
      reason: "claim_missing_in_authoritative_mode",
    });
    expect(decideExternalPersonaSync("oidc_authoritative", present)).toEqual({
      action: "sync",
      personas: ["sachbearbeitung"],
      ignored: [],
    });
  });

  it("leeres Array bleibt in beiden OIDC-Modi ein bewusstes Entfernen (sync auf leer)", () => {
    const empty = parseExternalPersonaClaim({ [PERSONA_CLAIM]: [] });
    expect(decideExternalPersonaSync("oidc_authoritative", empty)).toEqual({
      action: "sync",
      personas: [],
      ignored: [],
    });
  });
});
