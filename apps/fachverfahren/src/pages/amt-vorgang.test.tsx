// amt-vorgang.test — THE REVIEWER BEHIND THE MASK (Z3), held on the template's REAL config path.
//
// The composable used to live only on its own chat page (/amt/assistent); the case mask — the one place a
// caseworker decides — named no composable at all. This witness holds what the cut claims:
//   1. WHICH composable reviews: the processing surface, selected by `ARCHETYPEN.bearbeitung.id` + `hasSpine` — the
//      id the server mounts it under and keys its archetype on, and the same discovery the assistant page uses.
//      The fixtures are PRODUCED, not typed: `ausVorlage(...)` → `mapManifestToComposable` (the SDK's own archetype
//      template and mount mapper), plus the template's real fallback registry.
//   2. WHEN the mask stays dark: not mounted, no spine, review task not declared, or the role may not run spines —
//      each a verified absence, decided BEFORE anything is offered. A failed lookup is NOT dark: it rejects with its
//      status, and the page names it.
//   3. THAT the mask lights up on the template's real `leistungConfig`, which offers no `ki.assist` — a gate on a
//      field nobody produces would be dark for every real caller.
//   4. WHAT the mask sends: PII-poor signals only. No personal value of the applicant leaves the browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  caseReviewContext,
  createFachverfahrenStore,
  ReviewWorkspace,
  type KiAssistPort,
} from "@senticor/fachverfahren-kit";
import {
  ARCHETYPEN,
  ausVorlage,
  mapManifestToComposable,
  type AgenticComposable,
  type Archetyp,
} from "@senticor/public-sector-sdk";
import { composables as templateFallback } from "../../server/composables.muster.js";
import { leistungConfig } from "../leistung.config.js";
import { findCaseReviewer } from "./amt-vorgang.js";

type Answer = { status: number; body: unknown };
type Call = { method: string; url: string };

/** Stubs `fetch` with fixed answers keyed by "METHOD path"; anything unlisted answers 404. */
function stubFetch(answers: Record<string, Answer>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url });
    const answer = answers[`${method} ${url}`] ?? {
      status: 404,
      body: { error: "not found" },
    };
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A composable as the SDK's archetype template + mount mapper produce it — the path a generated app takes. */
function produced(
  archetyp: Archetyp,
  fill: { titel: string; faehigkeiten?: string[]; id?: string },
): AgenticComposable {
  const vorlage = ausVorlage(archetyp, {
    titel: fill.titel,
    domain: "musterantrag",
    aufgabenbereich: "handles the cases of this procedure",
    ...(fill.faehigkeiten ? { faehigkeiten: fill.faehigkeiten } : {}),
  });
  if (!vorlage.manifest) throw new Error(vorlage.meldung);
  return mapManifestToComposable({
    ...vorlage.manifest,
    ...(fill.id ? { id: fill.id } : {}),
  });
}

/** The server's discovery answers for a registry — the list plus one detail per composable. */
function discovery(list: readonly AgenticComposable[]): Record<string, Answer> {
  const answers: Record<string, Answer> = {
    "GET /api/composables": {
      status: 200,
      body: {
        composables: list.map((c) => ({
          id: c.id,
          version: c.version,
          displayName: c.displayName,
          klasse: c.klasse,
          status: c.status,
          assurance: c.assurance,
          enabled: true,
          hasSpine: c.spine !== undefined,
          herkunft: { art: "lokal-abgeleitet" },
        })),
      },
    },
  };
  for (const c of list)
    answers[`GET /api/composables/${c.id}`] = {
      status: 200,
      body: {
        id: c.id,
        ...(c.spine ? { spine: { aufgaben: [...c.spine.aufgaben] } } : {}),
      },
    };
  return answers;
}

describe("findCaseReviewer — which composable reviews, and when the mask stays dark", () => {
  it("finds the processing surface the SDK's archetype template produces", async () => {
    const surface = produced("bearbeitung", {
      titel: "Sachbearbeitung / Fachdienst",
      faehigkeiten: ["normbezogene-pruefung"],
    });
    // PREMISE, measured rather than assumed: the archetype's authority (erlaesst-va, HITL) is what makes the
    // mount mapper declare the check — the producer of the gate is the SDK, not this fixture.
    expect(surface.spine?.aufgaben).toContain("pruefung");
    stubFetch(discovery([surface]));

    const found = await findCaseReviewer();

    expect(found?.id).toBe(ARCHETYPEN.bearbeitung.id);
    expect(found?.displayName).toBe("Sachbearbeitung / Fachdienst");
  });

  it("stays dark on the bare template: its fallback registry carries no processing surface", async () => {
    // POSITIVE CONTROL: the fallback DOES carry a spine that declares the check — only under another id. Without
    // this line, "dark" could just mean "nothing here has a spine".
    expect(
      templateFallback.some((c) => c.spine?.aufgaben.includes("pruefung")),
    ).toBe(true);
    const calls = stubFetch(discovery(templateFallback));

    expect(await findCaseReviewer()).toBeNull();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/composables",
    ]);
  });

  it("stays dark on a spine-carrying composable under another archetype's id", async () => {
    const oversight = produced("aufsicht", {
      titel: "Aufsicht",
      faehigkeiten: ["musterauswertung"],
    });
    expect(oversight.spine).toBeDefined();
    stubFetch(discovery([oversight]));

    expect(await findCaseReviewer()).toBeNull();
  });

  it("stays dark when the processing surface carries no spine", async () => {
    const surface = produced("bearbeitung", {
      titel: "Sachbearbeitung / Fachdienst",
    });
    expect(surface.spine).toBeUndefined();
    stubFetch(discovery([surface]));

    expect(await findCaseReviewer()).toBeNull();
  });

  it("stays dark when the spine does not declare the review task — decided up front, so no request can fail on it", async () => {
    // A mis-cut stelle: the processing id, but an authority without HITL/erlaesst-va — the mapper then declares
    // assistance only. The spine route would answer 422 «nicht deklariert» (routes/composables.ts); the mask never
    // offers what would fail that way.
    const miscut = produced("aufsicht", {
      titel: "Sachbearbeitung / Fachdienst",
      faehigkeiten: ["musterauswertung"],
      id: ARCHETYPEN.bearbeitung.id,
    });
    expect(miscut.spine?.aufgaben).toEqual(["assistenz"]);
    const calls = stubFetch(discovery([miscut]));

    expect(await findCaseReviewer()).toBeNull();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/composables",
      `GET /api/composables/${ARCHETYPEN.bearbeitung.id}`,
    ]);
  });

  it("stays dark when the role may not run spines — a 403 is an answer, not a failure", async () => {
    stubFetch({
      "GET /api/composables": { status: 403, body: { error: "forbidden" } },
    });
    expect(await findCaseReviewer()).toBeNull();
  });

  it("a failed lookup is NOT dark: it rejects with its status so the page can name it", async () => {
    stubFetch({
      "GET /api/composables": { status: 500, body: { error: "boom" } },
    });
    await expect(findCaseReviewer()).rejects.toMatchObject({ status: 500 });
  });
});

describe("the case mask on the template's REAL config path", () => {
  const store = createFachverfahrenStore(leistungConfig);
  const vorgang = store.list()[0];
  const idle: KiAssistPort = {
    schlageVor: () =>
      Promise.reject(new Error("a static render never requests a review")),
  };

  function mask(withReviewer: boolean): string {
    if (!vorgang) throw new Error("the template seed carries no case");
    return renderToStaticMarkup(
      <ReviewWorkspace
        config={leistungConfig}
        port={store}
        vorgangId={vorgang.id}
        rolle="sachbearbeitung"
        onClose={() => undefined}
        {...(withReviewer
          ? {
              reviewer: {
                label: "Sachbearbeitung / Fachdienst",
                riskClass: "begrenzt" as const,
                port: idle,
              },
            }
          : {})}
      />,
    );
  }

  it("premise: the template's config offers no ki.assist — the mask must light up without it", () => {
    expect(leistungConfig.ki?.assist).toBeUndefined();
  });

  it("renders the reviewer inside the case mask when one is passed", () => {
    const html = mask(true);
    expect(html).toContain("Prüfung durch Sachbearbeitung / Fachdienst");
    expect(html).toContain("Prüfung anfordern");
  });

  it("renders no trace of a reviewer when none is passed — dark is the mask as before", () => {
    const html = mask(false);
    // POSITIVE CONTROL: this IS the case mask — its case number is on it.
    expect(html).toContain(vorgang?.vorgangsnummer ?? "(no case)");
    expect(html).not.toContain("Prüfung anfordern");
    expect(html).not.toContain("Prüfung durch");
  });
});

describe("caseReviewContext — what the mask sends is PII-poor", () => {
  // ⛔ BOUND TO THE DECLARATION, NOT TO THE DEMO (2026-09-14). This witness used to submit the Musterantrag's own
  // data (`antragsteller.vorname`, `anliegen.kategorie: "express"`) and expected its six labels. Every generated
  // procedure replaces the seam, so in a clone it read `[]` against six Musterantrag labels and turned the shipped
  // `test` gate red — measured on a generated municipal tax procedure, 1 of 4 failures. The PROPERTY does not
  // depend on the procedure: whatever the config DECLARES as detail fields travels as filled/empty, never as value.
  it("no personal value of the applicant leaves; the declared fields travel as filled/empty only", () => {
    const declared = leistungConfig.detailSektionen.flatMap(
      (section) => section.felder,
    );
    // POSITIVE CONTROL: without declared fields this witness would measure nothing.
    expect(declared.length).toBeGreaterThan(0);

    // One unique sentinel per declared field, at its declared path — the value a real applicant would type there.
    const antragsdaten: Record<string, unknown> = {};
    const sentinels = declared.map((f, i) => {
      const value = `pii-sentinel-${i}-zq`;
      const keys = f.pfad.split(".");
      let node = antragsdaten;
      for (const key of keys.slice(0, -1))
        node = (node[key] ??= {}) as Record<string, unknown>;
      node[keys[keys.length - 1]!] = value;
      return value;
    });
    // The case is built directly: this witness judges what the MASK sends, not the calculation behind it.
    const vorgang = {
      id: "v-probe",
      vorgangsnummer: "PROBE-1",
      eingangIso: "2026-09-14T00:00:00.000Z",
      antragsdaten,
      status: leistungConfig.statusMachine.initial,
      nachweise: [],
      history: [],
    } as never;

    const context = caseReviewContext(leistungConfig, vorgang);
    const sent = JSON.stringify(context);
    for (const value of sentinels)
      expect(
        sent,
        `the personal value "${value}" must not leave`,
      ).not.toContain(value);
    // POSITIVE CONTROL: the context names every declared field and knows it is filled.
    const fields = (context as { fields: { field: string; filled: boolean }[] })
      .fields;
    expect(fields.map((f) => f.field)).toEqual(declared.map((f) => f.label));
    expect(fields.every((f) => f.filled)).toBe(true);
  });
});
