// composable-chat-client.test — THE REVIEWER'S WIRE, held at the seam the case mask calls.
//
// The case mask gets its reviewer through ONE adapter next to the existing composable HTTP seam: it posts the
// review task of the processing surface's composable (`POST /api/composables/:id/spine/pruefung`) and maps the
// server's suggestion onto the kit's KiAssistPort result. What this witness holds:
//   · the exact wire — which URL, which body (the PII-poor input plus the case reference for the evidence ledger);
//   · the five transparency elements, with the reviewing BODY named in the source, not only the model;
//   · a structured answer becomes text (the local echo provider answers with its input object);
//   · fail-closed — a high-risk classification is refused instead of being shown under a limited-risk badge, and a
//     refused request stays a failure carrying its status, never an empty suggestion.
import { afterEach, describe, expect, it, vi } from "vitest";
import { STANDARD_KI_KENNZEICHNUNG } from "@senticor/fachverfahren-kit";
import { HITL_PFLICHT_AUFGABEN } from "@senticor/public-sector-sdk";
import {
  CASE_REVIEW_TASK,
  createCaseReviewer,
  loadComposableDetail,
} from "./composable-chat-client.js";

type Call = { method: string; url: string; body: unknown };

/** Stubs `fetch` with fixed answers keyed by "METHOD path"; anything unlisted answers 404. */
function stubFetch(
  answers: Record<string, { status: number; body: unknown }>,
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
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

const REVIEW_URL = "/api/composables/sachbearbeitung/spine/pruefung";
const REVIEWER = {
  id: "sachbearbeitung",
  displayName: "Sachbearbeitung / Fachdienst",
};

/** The spine route's answer (SpineRunResultDto), with the suggestion fields overridable per case. */
function spineRun(overrides: Record<string, unknown> = {}) {
  return {
    composableId: "sachbearbeitung",
    aufgabe: "pruefung",
    rechtsnah: true,
    autonomy: "AAL-2",
    suggestion: {
      value: "Der Pflichtnachweis fehlt; die Gebühr folgt dem Tarif.",
      confidence: 0.62,
      modelId: "ollama:qwen3",
      rationale: "Ein Pflichtnachweis ist nicht eingereicht.",
      sources: ["ollama:http://localhost:11434"],
      marking: "ki-vorschlag",
      euAiActClass: "limited-risk",
      reviewRequired: true,
      ...overrides,
    },
  };
}

describe("createCaseReviewer — one review per request, a suggestion, never a decision", () => {
  it("posts the review task of THIS composable with the case reference and maps the five transparency elements", async () => {
    const calls = stubFetch({
      [`POST ${REVIEW_URL}`]: { status: 200, body: spineRun() },
    });
    const reviewer = createCaseReviewer(REVIEWER, "case-7");

    const result = await reviewer.port.schlageVor({
      text: "Musterantrag",
      kontext: { status: "In Prüfung" },
    });

    expect(calls).toEqual([
      {
        method: "POST",
        url: REVIEW_URL,
        body: {
          input: { text: "Musterantrag", context: { status: "In Prüfung" } },
          caseId: "case-7",
        },
      },
    ]);
    expect(result).toEqual({
      wert: "Der Pflichtnachweis fehlt; die Gebühr folgt dem Tarif.",
      quelle: "Sachbearbeitung / Fachdienst · ollama:qwen3",
      konfidenz: 0.62,
      begruendung: "Ein Pflichtnachweis ist nicht eingereicht.",
      kennzeichnung: STANDARD_KI_KENNZEICHNUNG,
      reviewErforderlich: true,
    });
    expect(reviewer.label).toBe("Sachbearbeitung / Fachdienst");
  });

  it("declares the risk class the server caps every spine run at (limited-risk ⇒ begrenzt)", () => {
    expect(createCaseReviewer(REVIEWER, "case-7").riskClass).toBe("begrenzt");
  });

  it("turns a structured answer into text instead of '[object Object]' (the local echo answers with its input)", async () => {
    stubFetch({
      [`POST ${REVIEW_URL}`]: {
        status: 200,
        body: spineRun({ value: { text: "Musterantrag" } }),
      },
    });
    const result = await createCaseReviewer(REVIEWER, "case-7").port.schlageVor(
      { text: "Musterantrag" },
    );
    expect(result.wert).toBe(JSON.stringify({ text: "Musterantrag" }));
  });

  it("REFUSES a high-risk classification instead of showing it under a limited-risk badge (fail-closed)", async () => {
    stubFetch({
      [`POST ${REVIEW_URL}`]: {
        status: 200,
        body: spineRun({ euAiActClass: "high-risk" }),
      },
    });
    await expect(
      createCaseReviewer(REVIEWER, "case-7").port.schlageVor({
        text: "Musterantrag",
      }),
    ).rejects.toThrow(/high-risk/);
  });

  it("a refused request stays a failure carrying its status — never an empty suggestion", async () => {
    stubFetch({
      [`POST ${REVIEW_URL}`]: { status: 503, body: { error: "kein Modell" } },
    });
    await expect(
      createCaseReviewer(REVIEWER, "case-7").port.schlageVor({
        text: "Musterantrag",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("the review task is the SDK's HITL-bound check, not a free-standing literal", () => {
    expect(HITL_PFLICHT_AUFGABEN).toContain(CASE_REVIEW_TASK);
  });
});

describe("loadComposableDetail — the declared tasks, read where the spine route reads them", () => {
  it("GETs the one composable and returns its spine as served", async () => {
    const calls = stubFetch({
      "GET /api/composables/sachbearbeitung": {
        status: 200,
        body: {
          id: "sachbearbeitung",
          spine: { aufgaben: ["assistenz", "pruefung"] },
        },
      },
    });
    const detail = await loadComposableDetail("sachbearbeitung");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/composables/sachbearbeitung",
    ]);
    expect(detail.spine?.aufgaben).toEqual(["assistenz", "pruefung"]);
  });
});
