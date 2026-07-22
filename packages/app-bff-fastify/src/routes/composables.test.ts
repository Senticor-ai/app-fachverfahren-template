import { describe, expect, it } from "vitest";
import {
  createInMemoryComposableRegistry,
  type AgenticComposable,
} from "@senticor/public-sector-sdk";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

function composable(over: Partial<AgenticComposable> = {}): AgenticComposable {
  return {
    id: "musterverfahren",
    version: "1.0.0",
    displayName: "Musterverfahren",
    klasse: "outcome",
    status: "certified",
    assurance: "CAL-2",
    outcome: {
      fuerWen: "Sachbearbeitung",
      ergebnis: "beschiedener Antrag",
      messung: "Durchlaufzeit",
      nichtScope: [],
    },
    owners: { capabilityOwner: "amt", serviceOwner: "fachbereich" },
    moduleId: "musterverfahren",
    spine: {
      role: "musterverfahren-spine",
      autonomy: "AAL-2",
      aufgaben: ["assistenz", "pruefung"],
      skills: ["vollstaendigkeitspruefung"],
      knowledgeDomains: ["musterverfahren"],
    },
    evals: ["eval:smoke"],
    replaceableBy: [],
    ...over,
  };
}

function appWith(
  composables: AgenticComposable[],
  session = caseworkerSession(),
) {
  return buildBffApp({
    session,
    composableRegistry: createInMemoryComposableRegistry(composables),
  });
}

describe("BFF /api/composables (Discovery)", () => {
  it("listet die registrierten Composables mit enabled/hasSpine", async () => {
    const { app } = await appWith([composable()]);
    const res = await app.inject({ method: "GET", url: "/api/composables" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.composables).toHaveLength(1);
    expect(body.composables[0]).toMatchObject({
      id: "musterverfahren",
      enabled: true,
      hasSpine: true,
      klasse: "outcome",
    });
    await app.close();
  });

  it("liefert Detail inkl. Spine (rechtsnah abgeleitet) + Zertifizierungsreife", async () => {
    const { app } = await appWith([composable()]);
    const res = await app.inject({
      method: "GET",
      url: "/api/composables/musterverfahren",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spine.autonomy).toBe("AAL-2");
    // aufgaben enthält "pruefung" → rechtsnah=true.
    expect(body.spine.rechtsnah).toBe(true);
    expect(body.certification.certifiable).toBe(true);
    await app.close();
  });

  it("nennt fehlende Ebenen bei einem unvollständigen Composable", async () => {
    const { moduleId: _weg, ...ohneModul } = composable({
      status: "candidate",
    });
    void _weg;
    const { app } = await appWith([ohneModul]);
    const res = await app.inject({
      method: "GET",
      url: "/api/composables/musterverfahren",
    });
    const body = res.json();
    expect(body.certification.certifiable).toBe(false);
    expect(body.certification.fehlend).toContain(
      "moduleId (deterministische Naht)",
    );
    await app.close();
  });

  it("404 für ein unbekanntes Composable", async () => {
    const { app } = await appWith([composable()]);
    const res = await app.inject({
      method: "GET",
      url: "/api/composables/gibt-es-nicht",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("ohne registrierte Registry ist die Liste leer (Naht existiert trotzdem)", async () => {
    const { app } = await buildBffApp({ session: caseworkerSession() });
    const res = await app.inject({ method: "GET", url: "/api/composables" });
    expect(res.statusCode).toBe(200);
    expect(res.json().composables).toEqual([]);
    await app.close();
  });

  it("401/403 ohne Sitzung bzw. ohne session.read", async () => {
    const { app } = await buildBffApp({}); // keine Sitzung
    const res = await app.inject({ method: "GET", url: "/api/composables" });
    expect([401, 403]).toContain(res.statusCode);
    await app.close();
  });

  it("auch die Bürger-Rolle darf Composables entdecken (session.read)", async () => {
    const { app } = await appWith([composable()], citizenSession());
    const res = await app.inject({ method: "GET", url: "/api/composables" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
