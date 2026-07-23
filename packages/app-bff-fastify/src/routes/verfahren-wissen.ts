// VERFAHRENS-WIKI-Routen — das generelle, KI-gestützte Wissen EINES Fachverfahrens (verfahrens-scoped,
// append-only, behörden-scoped). Die durable Wiki-Ebene der Brücke Mensch↔KI-Agent↔Composable: Mensch UND
// Agent hinterlassen Wissen/Fähigkeiten/Reflexionen mit strukturierten, agenten-konsumierbaren Metadaten.
// Kontext (tenant/authority/actor) kommt AUSSCHLIESSLICH aus der Sitzung. Dieselben Guardrails wie der Fall-
// Blackboard: der KI-Agent liest die bisherigen Einträge (injektions-neutralisiert) als Kontext.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ErrorEnvelopeSchema,
  KiWissenRequestSchema,
  VerfahrenWissenEintragParamsSchema,
  VerfahrenWissenParamsSchema,
  WissenEintragRequestSchema,
  WissenReviewRequestSchema,
  WissenVerfahrenExportDtoSchema,
  WissenViewDtoSchema,
  WissenViewListDtoSchema,
  type WissenExportEintragDto,
  type WissenViewDto,
} from "@senticor/app-bff-contracts";
import type { VerfahrensWissenEintrag } from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  neutralisiereInjektion,
  scanInjection,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

const KINDS = new Set<WissenViewDto["kind"]>([
  "hypothese",
  "teilergebnis",
  "frage",
  "befund",
  "entscheidung",
  "reflexion",
  "metadatum",
  "evidenz",
  "wissen",
  "faehigkeit",
  "notiz",
]);
function asKind(v: string): WissenViewDto["kind"] {
  return KINDS.has(v as WissenViewDto["kind"])
    ? (v as WissenViewDto["kind"])
    : "notiz";
}

/** Marker-`art` der append-only Prüfung. Diese Einträge sind KEIN Wissen — sie werden beim Lesen aus
 *  der Wissens-Liste gefiltert und tragen nur die Ableitung des Prüfstatus. */
const REVIEW_ART = "wissen.reviewed";
type ReviewEntscheidung = "bestaetigt" | "verworfen";

/** Ein KI-Peer (nicht `human:` → Modell/Agent). Nur KI-Wissen ist prüfpflichtig. */
function istKi(urheber: string): boolean {
  return !urheber.startsWith("human:");
}

/** eintragId → Prüf-Entscheidung aus den append-only `wissen.reviewed`-Markern (erste Entscheidung gilt). */
function reviewMapOf(
  eintraege: VerfahrensWissenEintrag[],
): Map<string, ReviewEntscheidung> {
  const map = new Map<string, ReviewEntscheidung>();
  for (const e of eintraege) {
    if (e.art !== REVIEW_ART) continue;
    const bezug = e.metadaten["bezugEintragId"];
    const entscheidung = e.metadaten["entscheidung"];
    if (
      typeof bezug === "string" &&
      (entscheidung === "bestaetigt" || entscheidung === "verworfen") &&
      !map.has(bezug)
    ) {
      map.set(bezug, entscheidung);
    }
  }
  return map;
}

/** Prüfstatus EINES Eintrags: menschliches Wissen ist nicht prüfpflichtig; KI-Wissen ist `offen` bis eine
 *  Prüf-Entscheidung vorliegt (append-only abgeleitet, NICHT im unveränderlichen Eintrag gespeichert). */
function reviewStatusOf(
  e: VerfahrensWissenEintrag,
  reviews: Map<string, ReviewEntscheidung>,
): WissenViewDto["reviewStatus"] {
  if (!istKi(e.urheber)) return "nicht-erforderlich";
  return reviews.get(e.eintragId) ?? "offen";
}

/** Store-Eintrag → Ansicht (quelle aus dem urheber-Peer abgeleitet; Injektions-Verdacht compute-on-read). */
function toWissenView(
  e: VerfahrensWissenEintrag,
  reviews: Map<string, ReviewEntscheidung>,
): WissenViewDto {
  return {
    eintragId: e.eintragId,
    procedureId: e.procedureId,
    procedureVersion: e.procedureVersion,
    kind: asKind(e.art),
    quelle: istKi(e.urheber) ? "ki" : "mensch",
    urheber: e.urheber,
    text: e.text,
    metadaten: e.metadaten,
    verdacht: scanInjection(e.text).suspicious,
    reviewStatus: reviewStatusOf(e, reviews),
    erstelltAm: e.occurredAt,
  };
}

/** Store-Eintrag → Export-Form (Text injektions-NEUTRALISIERT für die Agent-Weiterverarbeitung). */
function toExportEintrag(
  e: VerfahrensWissenEintrag,
  reviews: Map<string, ReviewEntscheidung>,
): WissenExportEintragDto {
  return {
    eintragId: e.eintragId,
    kind: asKind(e.art),
    quelle: istKi(e.urheber) ? "ki" : "mensch",
    urheber: e.urheber,
    text: neutralisiereInjektion(e.text),
    metadaten: e.metadaten,
    reviewStatus: reviewStatusOf(e, reviews),
    erstelltAm: e.occurredAt,
  };
}

/** Nur die eigentlichen Wissens-Einträge (Prüf-Marker herausgefiltert). */
function nurWissen(
  eintraege: VerfahrensWissenEintrag[],
): VerfahrensWissenEintrag[] {
  return eintraege.filter((e) => e.art !== REVIEW_ART);
}

export function registerVerfahrenWissenRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseRead.permission },
    deps,
  );
  const writeAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseNoteWrite.permission },
    deps,
  );
  const errorResponses = {
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
  };

  async function append(
    session: ReturnType<typeof sessionOf>,
    procedureId: string,
    procedureVersion: string,
    art: string,
    urheber: string,
    text: string,
    metadaten: Record<string, unknown>,
  ): Promise<VerfahrensWissenEintrag> {
    return deps.wissenStore.appendEintrag({
      eintragId: `wissen.${randomUUID()}`,
      procedureId,
      procedureVersion,
      tenantId: session.tenantId,
      authorityId: session.authorityId,
      jurisdictionId: session.jurisdictionId,
      actorId: session.actorId,
      art,
      urheber,
      text,
      metadaten,
      occurredAt: new Date().toISOString(),
    });
  }

  // ── Wissens-Eintrag schreiben (Mensch) ─────────────────────────────────────────────────────────
  typed.post(
    "/api/verfahren/:procedureId/:version/wissen",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "Verfahrens-Wissen schreiben (Mensch) — append-only",
        params: VerfahrenWissenParamsSchema,
        body: WissenEintragRequestSchema,
        response: { 201: WissenViewDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let eintrag: VerfahrensWissenEintrag;
      try {
        eintrag = await append(
          session,
          request.params.procedureId,
          request.params.version,
          request.body.kind ?? "wissen",
          `human:${session.rbacRoles[0] ?? "mitarbeitend"}`,
          request.body.text,
          request.body.metadaten ?? {},
        );
      } catch {
        return storeUnavailable(request, reply);
      }
      // Menschliches Wissen ist nicht prüfpflichtig; frischer Eintrag hat keine Prüf-Marker.
      return reply.code(201).send(toWissenView(eintrag, new Map()));
    },
  );

  // ── KI-Wissens-Eintrag (via AiAssistPort, mit Wiki-Kontext) ────────────────────────────────────
  typed.post(
    "/api/verfahren/:procedureId/:version/wissen/ki",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "KI-Verfahrens-Wissen erzeugen (liest das bisherige Wiki als Kontext)",
        params: VerfahrenWissenParamsSchema,
        body: KiWissenRequestSchema,
        response: {
          201: WissenViewDtoSchema,
          422: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      // AGENTISCHE TEILNAHME: der Agent liest das bisherige Verfahrens-Wiki (injektions-neutralisiert).
      let bisher: VerfahrensWissenEintrag[];
      try {
        bisher = await deps.wissenStore.listEintraege({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          procedureId: request.params.procedureId,
          procedureVersion: request.params.version,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Fail-safe am LESE-Kontext: verworfenes KI-Wissen darf den nächsten KI-Vorschlag NICHT kontaminieren.
      const wikiReviews = reviewMapOf(bisher);
      const wiki = nurWissen(bisher)
        .filter((e) => reviewStatusOf(e, wikiReviews) !== "verworfen")
        .map((e) => ({
          art: e.art,
          urheber: e.urheber,
          text: neutralisiereInjektion(e.text),
        }));

      const result = await deps.aiAssist.suggest(
        {
          requestId: requestIdOf(request),
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          actor: { actorId: session.actorId, actorType: "employee" },
          purpose: "verfahren-wissen",
        },
        {
          task: request.body.task,
          input: {
            ...(request.body.input ?? {}),
            verfahren: {
              procedureId: request.params.procedureId,
              version: request.params.version,
            },
            wiki,
          },
        },
      );
      if (!result.ok) {
        const status =
          result.error.code === "ai-assist/high-risk-refused" ? 422 : 503;
        return reply.code(status).send({
          error: result.error.message,
          requestId: requestIdOf(request),
        });
      }
      const text =
        typeof result.value.value === "string"
          ? result.value.value
          : JSON.stringify(result.value.value);
      let eintrag: VerfahrensWissenEintrag;
      try {
        eintrag = await append(
          session,
          request.params.procedureId,
          request.params.version,
          request.body.kind ?? "teilergebnis",
          result.value.modelId,
          text,
          {
            konfidenz: result.value.confidence,
            quellen: result.value.sources,
            rationale: result.value.rationale,
          },
        );
      } catch {
        return storeUnavailable(request, reply);
      }
      // Frischer KI-Entwurf: prüfpflichtig, reviewStatus leitet zu "offen" ab (kein Marker vorhanden).
      return reply.code(201).send(toWissenView(eintrag, new Map()));
    },
  );

  // ── Verfahrens-Wiki lesen ──────────────────────────────────────────────────────────────────────
  typed.get(
    "/api/verfahren/:procedureId/:version/wissen",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "Das Wissen eines Verfahrens lesen (chronologisch, behörden-scoped)",
        params: VerfahrenWissenParamsSchema,
        response: { 200: WissenViewListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let eintraege: VerfahrensWissenEintrag[];
      try {
        eintraege = await deps.wissenStore.listEintraege({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          procedureId: request.params.procedureId,
          procedureVersion: request.params.version,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const reviews = reviewMapOf(eintraege);
      return reply.send({
        eintraege: nurWissen(eintraege).map((e) => toWissenView(e, reviews)),
      });
    },
  );

  // ── Verfahrens-Wissens-EXPORT (Brücke für die agentische Weiterverarbeitung) ──────────────────
  typed.get(
    "/api/verfahren/:procedureId/:version/wissen/export",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "Kontext-Bundle des Verfahrens-Wissens (neutralisiert) für die agentische Weiterverarbeitung",
        params: VerfahrenWissenParamsSchema,
        response: { 200: WissenVerfahrenExportDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let eintraege: VerfahrensWissenEintrag[];
      try {
        eintraege = await deps.wissenStore.listEintraege({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          procedureId: request.params.procedureId,
          procedureVersion: request.params.version,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Verworfenes Wissen darf sich NICHT über die Brücke in Agent-Skills/Kontext fortpflanzen (fail-safe);
      // bestätigtes/offenes Wissen wird mit seinem Prüfstatus exportiert, damit der Konsument gewichten kann.
      const reviews = reviewMapOf(eintraege);
      return reply.send({
        procedureId: request.params.procedureId,
        procedureVersion: request.params.version,
        eintraege: nurWissen(eintraege)
          .filter((e) => reviewStatusOf(e, reviews) !== "verworfen")
          .map((e) => toExportEintrag(e, reviews)),
      });
    },
  );

  // ── KI-Wissens-Entwurf PRÜFEN (bestätigen/verwerfen) ─────────────────────────────────────────────
  // Zwei-Ebenen-Symmetrie zum Fall-Blackboard: KI-Wissen ist prüfpflichtig, weil sein Blast-Radius ALLE
  // künftigen Fälle des Verfahrens ist. Die Prüfung ist selbst append-only (`wissen.reviewed`-Marker); der
  // effektive Status des unveränderlichen Eintrags wird beim Lesen abgeleitet. Einmalig (409).
  typed.post(
    "/api/verfahren/:procedureId/:version/wissen/:eintragId/review",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "Einen KI-Wissens-Entwurf prüfen (bestätigen/verwerfen)",
        params: VerfahrenWissenEintragParamsSchema,
        body: WissenReviewRequestSchema,
        response: {
          200: WissenViewDtoSchema,
          409: ErrorEnvelopeSchema,
          422: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let eintraege: VerfahrensWissenEintrag[];
      try {
        eintraege = await deps.wissenStore.listEintraege({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          procedureId: request.params.procedureId,
          procedureVersion: request.params.version,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const ziel = eintraege.find(
        (e) => e.eintragId === request.params.eintragId && e.art !== REVIEW_ART,
      );
      // Kein solcher Eintrag in DIESEM Verfahren → 404 (kein Zugriff über eine fremde eintragId).
      if (!ziel)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      // Nur KI-Wissen ist prüfpflichtig; menschliches Wissen hat keinen Prüf-Zustand.
      if (!istKi(ziel.urheber))
        return reply.code(422).send({
          error: "nur KI-Wissen ist prüfpflichtig",
          requestId: requestIdOf(request),
        });
      // Einmalig: ein bereits geprüfter Entwurf → 409 (append-only, keine zweite Entscheidung).
      if (reviewMapOf(eintraege).has(ziel.eintragId))
        return reply.code(409).send({
          error: "Wissens-Eintrag bereits geprüft",
          requestId: requestIdOf(request),
        });

      try {
        await append(
          session,
          request.params.procedureId,
          request.params.version,
          REVIEW_ART,
          `human:${session.rbacRoles[0] ?? "mitarbeitend"}`,
          "",
          {
            bezugEintragId: ziel.eintragId,
            entscheidung: request.body.entscheidung,
          },
        );
      } catch {
        return storeUnavailable(request, reply);
      }
      // Den geprüften Eintrag mit dem NEUEN abgeleiteten Status zurückgeben.
      const reviews = new Map<string, ReviewEntscheidung>([
        [ziel.eintragId, request.body.entscheidung],
      ]);
      return reply.send(toWissenView(ziel, reviews));
    },
  );
}
