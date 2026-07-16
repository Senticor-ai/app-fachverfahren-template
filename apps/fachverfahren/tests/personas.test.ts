// personas.test.ts — Vertrag der Client-Personas-Logik: Personas sind ARBEITSBEREICHE
// (Produkt-Erlebnis/Navigation), keine Autorisierung. Der Fallback ist capability-
// gesteuert: NUR ein Alt-Server ohne userPersonas-Capability bekommt „alle drei";
// meldet der Server die Capability und liefert trotzdem keine personas, gilt fail
// closed LEER (ein Server-Bug darf nicht alle Sichten aufreißen).
import { describe, expect, it } from "vitest";

import type { LeistungConfig } from "@senticor/fachverfahren-kit";
import {
  allowedPersonas,
  PERSONA_HOME,
  personaBereiche,
  personaDescriptors,
  personaHome,
  personaRoute,
  sichtbareBereiche,
} from "../src/personas.js";
import type { SessionPrincipal } from "../src/session-state.js";

const basePrincipal: SessionPrincipal = {
  actorId: "actor.1",
  email: "sb@example.org",
  personas: ["sachbearbeitung"],
  permissions: ["boards.collaborate"],
};

describe("allowedPersonas", () => {
  it("liefert die zugewiesenen Arbeitsbereiche in kanonischer Reihenfolge, unbekannte Werte gefiltert", () => {
    expect(
      allowedPersonas(
        {
          ...basePrincipal,
          personas: [
            "aufsicht",
            "buerger",
            "hausmeister",
          ] as SessionPrincipal["personas"],
        },
        { userPersonas: true },
      ),
    ).toEqual(["buerger", "aufsicht"]);
  });

  it("leere Zuweisung bleibt LEER (Null-Arbeitsbereiche ist ein gültiger Zustand)", () => {
    expect(
      allowedPersonas(
        { ...basePrincipal, personas: [] },
        { userPersonas: true },
      ),
    ).toEqual([]);
  });

  it("personas fehlt + Capability gemeldet → fail closed LEER", () => {
    const principal = { ...basePrincipal };
    delete principal.personas;
    expect(allowedPersonas(principal, { userPersonas: true })).toEqual([]);
  });

  it("personas fehlt + KEINE Capability (Alt-Server) → Legacy-Fallback alle drei", () => {
    const principal = { ...basePrincipal };
    delete principal.personas;
    expect(allowedPersonas(principal, {})).toEqual([
      "buerger",
      "sachbearbeitung",
      "aufsicht",
    ]);
    expect(allowedPersonas(principal, undefined)).toEqual([
      "buerger",
      "sachbearbeitung",
      "aufsicht",
    ]);
  });

  it("ohne Principal gibt es keine Arbeitsbereiche", () => {
    expect(allowedPersonas(null, { userPersonas: true })).toEqual([]);
  });
});

describe("personaHome", () => {
  it("führt zur ERSTEN zugewiesenen Persona (kanonische Reihenfolge)", () => {
    expect(personaHome(["aufsicht", "buerger"], [])).toBe("/buerger");
    expect(personaHome(["aufsicht"], [])).toBe("/aufsicht");
  });

  it("ohne Arbeitsbereiche: /boards NUR mit boards.collaborate, sonst Landing", () => {
    expect(personaHome([], ["boards.collaborate"])).toBe("/boards");
    expect(personaHome([], [])).toBe("/");
    expect(personaHome([], undefined)).toBe("/");
  });
});

describe("personaDescriptors", () => {
  it("filtert die Descriptor-Liste (Config oder Defaults) auf die zugewiesenen Keys", () => {
    const descriptors = personaDescriptors(["sachbearbeitung"], {});
    expect(descriptors.map((entry) => entry.key)).toEqual(["sachbearbeitung"]);
  });

  it("leere Zuweisung → leere Liste (die Shell blendet den Wechsler aus)", () => {
    expect(personaDescriptors([], {})).toEqual([]);
  });
});

// ── WELLE C: die BEREICHE der Landing kommen aus config.personas (EINE Wahrheit), nicht aus
//    einem hartkodierten Array. Das ist der Vertrag, der den generischen Start-Screen ablöst:
//    trägt die Naht die Personas DIESES Verfahrens, zeigt die Landing SIE; fehlen sie, bleibt
//    das bisherige Default-Verhalten (fail-open, kein Bruch bestehender Apps).
const verfahrensPersonas = {
  personas: [
    {
      key: "buerger",
      label: "Antragsteller:in",
      sub: "Gewerbe an-/um-/abmelden",
      home: "/buerger",
    },
    {
      key: "sachbearbeitung",
      label: "Gewerbeamt",
      sub: "Anmeldung prüfen und eintragen",
      home: "/amt",
    },
  ],
} as const satisfies Pick<LeistungConfig, "personas">;

describe("personaRoute", () => {
  it("nimmt die home-Route AUS der Config (die Config ist die Wahrheit)", () => {
    expect(personaRoute("sachbearbeitung", verfahrensPersonas)).toBe("/amt");
  });

  it("fällt ohne config.personas auf die App-Routen-Konvention zurück (fail-open)", () => {
    expect(personaRoute("sachbearbeitung", {})).toBe(
      PERSONA_HOME.sachbearbeitung,
    );
    expect(personaRoute("aufsicht", verfahrensPersonas)).toBe("/aufsicht");
  });

  it("ignoriert eine nicht-absolute home-Route (kein toter Link)", () => {
    expect(
      personaRoute("buerger", {
        personas: [{ key: "buerger", label: "X", home: "buerger" }],
      }),
    ).toBe("/buerger");
  });
});

describe("personaBereiche", () => {
  it("leitet die Bereichs-Einstiege AUS config.personas ab (verfahrensspezifisch statt generisch)", () => {
    const bereiche = personaBereiche(verfahrensPersonas);
    expect(
      bereiche
        .filter((bereich) => bereich.persona)
        .map((bereich) => [bereich.label, bereich.href, bereich.beschreibung]),
    ).toEqual([
      ["Antragsteller:in", "/buerger", "Gewerbe an-/um-/abmelden"],
      ["Gewerbeamt", "/amt", "Anmeldung prüfen und eintragen"],
      // PER-KEY FAIL-OPEN: `aufsicht` ist im Fachkonzept NICHT abgeleitet worden (die Config kennt sie nicht) —
      // der Bereich bleibt GENERISCH stehen statt zu verschwinden. Wurzel: ein partielles Persona-Modell darf keine
      // Sackgasse sein; die Route /aufsicht ist montiert und die Rolle zuweisbar, ein „unsichtbarer" Arbeitsbereich
      // wäre ein toter Einstieg (die Vorfassung liess ihn per `config.personas ?? DEFAULT_PERSONAS` wegfallen).
      ["Aufsicht", "/aufsicht", "Kennzahlen / Audit"],
    ]);
    // Der Boards-Workspace ist KEINE Persona-Sicht und bleibt unabhängig von der Config erhalten.
    expect(bereiche.at(-1)).toMatchObject({
      href: "/boards",
      permission: "boards.collaborate",
    });
  });

  it("FAIL-OPEN ohne config.personas: die generischen Kit-Defaults (bisheriges Verhalten)", () => {
    expect(
      personaBereiche({})
        .filter((bereich) => bereich.persona)
        .map((bereich) => bereich.persona),
    ).toEqual(["buerger", "sachbearbeitung", "aufsicht"]);
  });

  it("PER-KEY FAIL-OPEN: ein 1-von-3-Modell laesst die uebrigen Arbeitsbereiche generisch stehen (keine Sackgasse)", () => {
    const bereiche = personaBereiche({
      personas: [{ key: "buerger", label: "Antragsteller:in", sub: "Vorgang melden" }],
    }).filter((bereich) => bereich.persona);
    expect(bereiche.map((b) => b.persona)).toEqual([
      "buerger",
      "sachbearbeitung",
      "aufsicht",
    ]);
    // Der abgeleitete Bereich fuehrt …
    expect(bereiche[0]).toMatchObject({
      label: "Antragsteller:in",
      beschreibung: "Vorgang melden",
    });
    // … die nicht abgeleiteten bleiben generisch (statt zu verschwinden).
    expect(bereiche[1].label).toBe("Sachbearbeitung");
  });

  it("PER-KEY FAIL-OPEN: ein Eintrag OHNE home nutzt die App-Routen-Konvention (Engine erfindet keine Route)", () => {
    // Die Fabrik schreibt `home` NUR, wenn ein Artefakt eine Route nennt — die Routen-Wahrheit gehoert der App.
    const bereiche = personaBereiche({
      personas: [{ key: "sachbearbeitung", label: "Gewerbeamt" }],
    }).filter((bereich) => bereich.persona);
    expect(bereiche.find((b) => b.persona === "sachbearbeitung")?.href).toBe(
      PERSONA_HOME.sachbearbeitung,
    );
  });
});

describe("sichtbareBereiche", () => {
  const bereiche = personaBereiche(verfahrensPersonas);

  it("unangemeldet sind ALLE Einstiege sichtbar (der Klick bounct durchs Session-Gate)", () => {
    expect(sichtbareBereiche(bereiche, false, null, undefined)).toEqual(
      bereiche,
    );
  });

  it("angemeldet: nur zugewiesene Arbeitsbereiche + Boards nur mit Permission", () => {
    expect(
      sichtbareBereiche(bereiche, true, basePrincipal, {
        userPersonas: true,
      }).map((bereich) => bereich.href),
    ).toEqual(["/amt", "/boards"]);
  });

  it("Konto ohne Arbeitsbereich und ohne Boards-Permission sieht NICHTS (gültiger Null-Zustand)", () => {
    expect(
      sichtbareBereiche(
        bereiche,
        true,
        { ...basePrincipal, personas: [], permissions: [] },
        { userPersonas: true },
      ),
    ).toEqual([]);
  });
});
