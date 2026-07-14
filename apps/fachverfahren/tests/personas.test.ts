// personas.test.ts — Vertrag der Client-Personas-Logik: Personas sind ARBEITSBEREICHE
// (Produkt-Erlebnis/Navigation), keine Autorisierung. Der Fallback ist capability-
// gesteuert: NUR ein Alt-Server ohne userPersonas-Capability bekommt „alle drei";
// meldet der Server die Capability und liefert trotzdem keine personas, gilt fail
// closed LEER (ein Server-Bug darf nicht alle Sichten aufreißen).
import { describe, expect, it } from "vitest";

import {
  allowedPersonas,
  personaDescriptors,
  personaHome,
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
