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

describe("BFF Spine-Run POST /api/composables/:id/spine/:aufgabe", () => {
  it("führt eine rechtsnahe Aufgabe (pruefung) aus → Vorschlag mit reviewRequired=true, rechtsnah=true", async () => {
    const { app } = await appWith([composable()]);
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/spine/pruefung",
      payload: { input: { sachverhalt: "synthetisch" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.composableId).toBe("musterverfahren");
    expect(body.aufgabe).toBe("pruefung");
    expect(body.rechtsnah).toBe(true);
    expect(body.autonomy).toBe("AAL-2");
    // Der Kern der HCAI-Doktrin: die KI liefert einen Vorschlag, die Entscheidung bleibt menschlich.
    expect(body.suggestion.reviewRequired).toBe(true);
    expect(body.suggestion.marking).toBe("ki-vorschlag");
    await app.close();
  });

  it("eine reine Assistenz-Aufgabe ist nicht rechtsnah (rechtsnah=false)", async () => {
    const { app } = await appWith([composable()]);
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/spine/assistenz",
      payload: { input: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rechtsnah).toBe(false);
    // Auch hier: reviewRequired bleibt true (der Port erzwingt es).
    expect(res.json().suggestion.reviewRequired).toBe(true);
    await app.close();
  });

  it("422, wenn die Aufgabe am Spine NICHT deklariert ist (kein Erfinden von Fähigkeiten)", async () => {
    // composable() deklariert nur assistenz+pruefung → subsumtion ist nicht dabei.
    const { app } = await appWith([composable()]);
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/spine/subsumtion",
      payload: { input: {} },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain("nicht deklariert");
    await app.close();
  });

  it("404, wenn das Composable keinen Spine-Agent hat", async () => {
    const { spine: _weg, ...ohneSpine } = composable();
    void _weg;
    const { app } = await appWith([ohneSpine]);
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/spine/assistenz",
      payload: { input: {} },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("403 ohne ai.assist (Bürger-Rolle darf den Spine nicht ausführen)", async () => {
    const { app } = await appWith([composable()], citizenSession());
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/spine/assistenz",
      payload: { input: {} },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
