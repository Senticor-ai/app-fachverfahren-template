// AKTENVERMERK-Routen — der unveränderliche, attribuierbare Fall-Vermerk. Anders als die editierbare
// Arbeits-Notiz (taskKind "notiz" in app_tasks) lebt ein Vermerk im APPEND-ONLY Fall-Audit
// (app_audit_events, DB-Trigger-gesichert): einmal geschrieben, nie geändert — eine Korrektur ist ein
// NEUER Vermerk. Verfasst von MENSCH oder KI:
//  - Mensch: POST /vermerke → `case.note.added` mit quelle="mensch".
//  - KI: POST /vermerke/ki → ruft den (austauschbaren) AiAssistPort, hält den ENTWURF als `case.note.added`
//    mit quelle="ki", modelId, marking="ki-vorschlag", reviewStatus="offen" fest — prüfpflichtig, die
//    rechtsnahe Bewertung bleibt beim Menschen (HCAI/EU-AI-Act). ERSTE Verbindung AiAssist ↔ Fall.
// Mandant/Behörde/Akteur kommen AUSSCHLIESSLICH aus der Sitzung; jede Route prüft zuerst die Behörden-
// Zugehörigkeit des Falls (404 sonst, kein Existenz-Orakel).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  CaseIdParamsSchema,
  ErrorEnvelopeSchema,
  KiVermerkRequestSchema,
  VermerkDtoSchema,
  VermerkIdParamsSchema,
  VermerkListDtoSchema,
  VermerkRequestSchema,
  VermerkReviewRequestSchema,
  WissenExportDtoSchema,
  type VermerkDto,
  type WissenEintragDto,
} from "@senticor/app-bff-contracts";
import type { AppAuditEvent, AppCase } from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  createFachlicheAuditEvent,
  INJEKTION_PLATZHALTER,
  neutralisiereInjektion,
  scanInjection,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

const NOTE_EVENT_TYPE = "case.note.added";
const REVIEW_EVENT_TYPE = "case.note.reviewed";
/** Rechtsgrundlage der Aktenführung, falls das Verfahren keine eigene liefert (Aktenmäßigkeitsprinzip). */
const DEFAULT_NOTE_LEGAL_BASIS = "§ 29 VwVfG";

type ReviewEntscheidung = "bestaetigt" | "verworfen";

const VERMERK_KINDS = new Set<VermerkDto["kind"]>([
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

/** Frei-formigen payload-Wert → gültigen Zell-Typ (Default `notiz`). */
function asKind(v: unknown): VermerkDto["kind"] {
  return typeof v === "string" && VERMERK_KINDS.has(v as VermerkDto["kind"])
    ? (v as VermerkDto["kind"])
    : "notiz";
}

/** Baut die Abbildung vermerkId → Prüf-Entscheidung aus den append-only `case.note.reviewed`-Ereignissen
 *  (die erste Entscheidung gilt; ein zweiter Review wird server-seitig abgelehnt). */
function reviewMapOf(events: AppAuditEvent[]): Map<string, ReviewEntscheidung> {
  const map = new Map<string, ReviewEntscheidung>();
  for (const e of events) {
    if (e.eventType !== REVIEW_EVENT_TYPE) continue;
    const vermerkId = e.payload["vermerkId"];
    const entscheidung = e.payload["entscheidung"];
    if (
      typeof vermerkId === "string" &&
      (entscheidung === "bestaetigt" || entscheidung === "verworfen") &&
      !map.has(vermerkId)
    ) {
      map.set(vermerkId, entscheidung);
    }
  }
  return map;
}

/** Ein `case.note.added`-Audit-Ereignis → VermerkDto. Der effektive Prüfstatus kommt (bei KI-Vermerken)
 *  aus den `case.note.reviewed`-Ereignissen (`override`), NICHT aus der unveränderlichen Notiz-payload. */
function toVermerkDto(
  e: AppAuditEvent,
  fallbackCaseId: string,
  override?: ReviewEntscheidung,
): VermerkDto {
  const p = e.payload;
  const quelle = p["quelle"] === "ki" ? "ki" : "mensch";
  const rs = p["reviewStatus"];
  const gespeichert =
    rs === "offen" ||
    rs === "bestaetigt" ||
    rs === "verworfen" ||
    rs === "nicht-erforderlich"
      ? rs
      : quelle === "ki"
        ? "offen"
        : "nicht-erforderlich";
  const reviewStatus = override ?? gespeichert;
  const modelId = typeof p["modelId"] === "string" ? p["modelId"] : null;
  const urheber =
    typeof p["urheber"] === "string" && p["urheber"].length > 0
      ? p["urheber"]
      : quelle === "ki"
        ? (modelId ?? "ki")
        : `human:${e.actorId}`;
  const text = typeof p["text"] === "string" ? p["text"] : "";
  const md = p["metadaten"];
  const metadaten =
    typeof md === "object" && md !== null && !Array.isArray(md)
      ? (md as Record<string, unknown>)
      : {};
  return {
    vermerkId: e.auditEventId,
    caseId: e.caseId ?? fallbackCaseId,
    text,
    kind: asKind(p["kind"]),
    quelle,
    urheber,
    autorActorId: e.actorId,
    modelId,
    sichtbarkeit: p["sichtbarkeit"] === "private" ? "private" : "public",
    bezugVermerkId:
      typeof p["bezugVermerkId"] === "string" ? p["bezugVermerkId"] : null,
    reviewStatus,
    metadaten,
    // Injektions-Verdacht compute-on-read (immer konsistent zum Text; die Zelle bleibt unverändert).
    verdacht: scanInjection(text).suspicious,
    erstelltAm: e.occurredAt,
  };
}

/** VermerkDto → WissenEintragDto (Export-Form): der Text wird injektions-NEUTRALISIERT (ein
 *  weiterverarbeitender Agent darf nicht über eine manipulierte Zelle gekapert werden). */
function toWissenEintrag(v: VermerkDto): WissenEintragDto {
  return {
    eintragId: v.vermerkId,
    kind: v.kind,
    quelle: v.quelle,
    urheber: v.urheber,
    text: v.verdacht ? INJEKTION_PLATZHALTER : v.text,
    metadaten: v.metadaten,
    bezugEintragId: v.bezugVermerkId,
    reviewStatus: v.reviewStatus,
    erstelltAm: v.erstelltAm,
  };
}

export function registerVermerkRoutes(
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

  /** Akte im BEHÖRDEN-Scope laden (Prädikat, keine Nachprüfung); undefined ⇒ 404. */
  async function loadOwnedCase(
    session: ReturnType<typeof sessionOf>,
    caseId: string,
  ): Promise<AppCase | undefined> {
    return deps.caseStore.getCase({
      tenantId: session.tenantId,
      caseId,
      scope: "authority",
      authorityId: session.authorityId,
    });
  }

  /** Rechtsgrundlage aus dem Verfahren (Verfahren = DATEN); Fallback Aktenmäßigkeit. */
  function legalBasisFor(appCase: AppCase): string {
    const procedure = deps.procedureRegistry.get(
      appCase.procedureId,
      appCase.procedureVersion,
    );
    return procedure?.legalBasisIds[0] ?? DEFAULT_NOTE_LEGAL_BASIS;
  }

  /** Schreibt EIN `case.note.added`-Ereignis append-only + liefert das DTO. */
  async function appendVermerk(
    appCase: AppCase,
    session: ReturnType<typeof sessionOf>,
    requestId: string,
    payload: Record<string, unknown>,
    summary: string,
  ): Promise<VermerkDto> {
    const event = createFachlicheAuditEvent({
      eventType: NOTE_EVENT_TYPE,
      actorId: session.actorId,
      actingAuthorityId: appCase.authorityId,
      purpose: "aktenvermerk",
      legalBasisId: legalBasisFor(appCase),
      caseId: appCase.caseId,
      requestId,
      summary,
    });
    const stored: AppAuditEvent = {
      auditEventId: event.auditEventId,
      caseId: appCase.caseId,
      tenantId: session.tenantId,
      authorityId: appCase.authorityId,
      jurisdictionId: appCase.jurisdictionId,
      actorId: session.actorId,
      eventType: event.eventType,
      purpose: event.purpose,
      legalBasisId: event.legalBasisId,
      requestId,
      payload: { ...payload, summary },
      occurredAt: event.occurredAt,
    };
    await deps.caseStore.appendAuditEvent(stored);
    return toVermerkDto(stored, appCase.caseId);
  }

  // ── Menschlicher Aktenvermerk ─────────────────────────────────────────────────────────────────
  typed.post(
    "/api/cases/:id/vermerke",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["vermerke"],
        summary: "Aktenvermerk schreiben (Mensch) — append-only",
        params: CaseIdParamsSchema,
        body: VermerkRequestSchema,
        response: { 201: VermerkDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const appCase = await loadOwnedCase(session, request.params.id).catch(
        () => "error" as const,
      );
      if (appCase === "error") return storeUnavailable(request, reply);
      if (!appCase)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      let dto: VermerkDto;
      try {
        dto = await appendVermerk(
          appCase,
          session,
          requestIdOf(request),
          {
            text: request.body.text,
            kind: request.body.kind ?? "notiz",
            quelle: "mensch",
            // Peer-Kennung: der Mensch schreibt als `human:<rolle>` (Rolle aus der Sitzung).
            urheber: `human:${session.rbacRoles[0] ?? "mitarbeitend"}`,
            sichtbarkeit: request.body.sichtbarkeit ?? "public",
            reviewStatus: "nicht-erforderlich",
            ...(request.body.bezugVermerkId !== undefined
              ? { bezugVermerkId: request.body.bezugVermerkId }
              : {}),
            ...(request.body.metadaten !== undefined
              ? { metadaten: request.body.metadaten }
              : {}),
          },
          `Aktenvermerk (Mensch) zu ${appCase.caseId}`,
        );
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.code(201).send(dto);
    },
  );

  // ── KI-Aktenvermerk-Entwurf (via AiAssistPort) ────────────────────────────────────────────────
  typed.post(
    "/api/cases/:id/vermerke/ki",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["vermerke"],
        summary: "KI-Aktenvermerk-Entwurf erzeugen (prüfpflichtig, ki-vorschlag)",
        params: CaseIdParamsSchema,
        body: KiVermerkRequestSchema,
        response: {
          201: VermerkDtoSchema,
          422: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const appCase = await loadOwnedCase(session, request.params.id).catch(
        () => "error" as const,
      );
      if (appCase === "error") return storeUnavailable(request, reply);
      if (!appCase)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      // AGENTISCHE TEILNAHME (Blackboard-Retrieval): der Agent LIEST die geteilte Akte — die bisherigen
      // PUBLIC-Zellen (der Blackboard-Stand) + Fall-Metadaten fließen als Kontext in den Vorschlag. So
      // trägt der Agent zur LAUFENDEN Konversation bei, statt kontextfrei zu raten. PII-arm: nur die
      // Zell-Kurzform (kind/urheber/text); private Entwürfe bleiben draußen; in PROD über neutralisierte
      // Signale/Redaction. Die Sitzungs-Identität bleibt der einzige Autoritäts-Kontext.
      let bisher: AppAuditEvent[];
      try {
        bisher = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const blackboard = bisher
        .filter((e) => e.eventType === NOTE_EVENT_TYPE)
        .map((e) => toVermerkDto(e, appCase.caseId))
        .filter((v) => v.sichtbarkeit === "public")
        .map((v) => ({
          kind: v.kind,
          urheber: v.urheber,
          // SOTA-Guardrail: eine Zelle mit Prompt-Injektions-Muster darf den lesenden Agenten nicht kapern
          // — neutralisiert statt roh weitergereicht (die Zelle selbst bleibt unverändert in der Akte).
          text: neutralisiereInjektion(v.text),
        }));

      // Den (austauschbaren) AiAssistPort fragen — Kontext AUSSCHLIESSLICH aus der Sitzung + geteilter Akte.
      const result = await deps.aiAssist.suggest(
        {
          requestId: requestIdOf(request),
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          actor: { actorId: session.actorId, actorType: "employee" },
          purpose: "aktenvermerk",
        },
        {
          task: request.body.task,
          input: {
            ...(request.body.input ?? {}),
            akte: {
              caseId: appCase.caseId,
              state: appCase.state,
              zellen: blackboard,
            },
          },
        },
      );
      if (!result.ok) {
        // Ehrliches Mapping: high-risk-Ablehnung → 422, kein Modell → 503; NIE ein fingierter Vermerk.
        const status =
          result.error.code === "ai-assist/high-risk-refused" ? 422 : 503;
        return reply.code(status).send({
          error: result.error.message,
          requestId: requestIdOf(request),
        });
      }
      const entwurf =
        typeof result.value.value === "string"
          ? result.value.value
          : JSON.stringify(result.value.value);
      let dto: VermerkDto;
      try {
        dto = await appendVermerk(
          appCase,
          session,
          requestIdOf(request),
          {
            text: entwurf,
            // Ein KI-Beitrag ist typischerweise ein Zwischenergebnis; der Aufrufer kann den Zell-Typ steuern.
            kind: request.body.kind ?? "teilergebnis",
            quelle: "ki",
            // Peer-Kennung des Agenten = die Modell-Kennung (Mensch und Agent sind gleichrangige Knoten).
            urheber: result.value.modelId,
            modelId: result.value.modelId,
            marking: "ki-vorschlag",
            reviewRequired: true,
            reviewStatus: "offen",
            sichtbarkeit: "public",
            angefordertVon: session.actorId,
            // Der KI-Wiki-Eintrag trägt die STRUKTURIERTE AI-Provenienz als agenten-konsumierbare Metadaten
            // (Konfidenz/Quellen/Rationale) — genau, was ein nachgelagerter Agent zur Weiterverarbeitung braucht.
            metadaten: {
              ...(request.body.metadaten ?? {}),
              konfidenz: result.value.confidence,
              quellen: result.value.sources,
              rationale: result.value.rationale,
            },
            ...(request.body.bezugVermerkId !== undefined
              ? { bezugVermerkId: request.body.bezugVermerkId }
              : {}),
          },
          `KI-Aktenvermerk-Entwurf (${result.value.modelId}) zu ${appCase.caseId}`,
        );
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.code(201).send(dto);
    },
  );

  // ── Aktenvermerke lesen ───────────────────────────────────────────────────────────────────────
  typed.get(
    "/api/cases/:id/vermerke",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["vermerke"],
        summary: "Aktenvermerke eines Falls lesen (chronologisch)",
        params: CaseIdParamsSchema,
        response: { 200: VermerkListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const appCase = await loadOwnedCase(session, request.params.id).catch(
        () => "error" as const,
      );
      if (appCase === "error") return storeUnavailable(request, reply);
      if (!appCase)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const reviews = reviewMapOf(events);
      const vermerke = events
        .filter((e) => e.eventType === NOTE_EVENT_TYPE)
        .map((e) =>
          toVermerkDto(e, appCase.caseId, reviews.get(e.auditEventId)),
        );
      return reply.send({ vermerke });
    },
  );

  // ── Wissens-/Kontext-EXPORT (die Brücke für die agentische Weiterverarbeitung) ────────────────
  typed.get(
    "/api/cases/:id/vermerke/export",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["vermerke"],
        summary: "Kontext-Bundle der Akte für die agentische Weiterverarbeitung (public, neutralisiert)",
        params: CaseIdParamsSchema,
        response: { 200: WissenExportDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const appCase = await loadOwnedCase(session, request.params.id).catch(
        () => "error" as const,
      );
      if (appCase === "error") return storeUnavailable(request, reply);
      if (!appCase)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const reviews = reviewMapOf(events);
      const eintraege = events
        .filter((e) => e.eventType === NOTE_EVENT_TYPE)
        .map((e) => toVermerkDto(e, appCase.caseId, reviews.get(e.auditEventId)))
        .filter((v) => v.sichtbarkeit === "public")
        .map(toWissenEintrag);
      return reply.send({
        caseId: appCase.caseId,
        procedureId: appCase.procedureId,
        procedureVersion: appCase.procedureVersion,
        state: appCase.state,
        eintraege,
      });
    },
  );

  // ── KI-Vermerk-Entwurf PRÜFEN (bestätigen/verwerfen) ──────────────────────────────────────────
  // Schließt den HITL-Kreis: ein KI-Entwurf (reviewStatus "offen") wird von einem Menschen bestätigt
  // (in die Akte übernommen) oder verworfen. Die Prüfung ist selbst append-only (`case.note.reviewed`);
  // der effektive Status des (unveränderlichen) Vermerks wird beim Lesen daraus abgeleitet. Einmalig (409).
  typed.post(
    "/api/cases/:id/vermerke/:vermerkId/review",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["vermerke"],
        summary: "Einen KI-Vermerk-Entwurf prüfen (bestätigen/verwerfen)",
        params: VermerkIdParamsSchema,
        body: VermerkReviewRequestSchema,
        response: {
          200: VermerkDtoSchema,
          409: ErrorEnvelopeSchema,
          422: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const appCase = await loadOwnedCase(session, request.params.id).catch(
        () => "error" as const,
      );
      if (appCase === "error") return storeUnavailable(request, reply);
      if (!appCase)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const note = events.find(
        (e) =>
          e.eventType === NOTE_EVENT_TYPE &&
          e.auditEventId === request.params.vermerkId,
      );
      // Kein solcher Vermerk an DIESEM Fall → 404 (kein Cross-Case-Zugriff über eine fremde vermerkId).
      if (!note)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      // Nur KI-Entwürfe sind prüfpflichtig; ein menschlicher Vermerk hat keinen Review-Zustand.
      if (note.payload["quelle"] !== "ki")
        return reply.code(422).send({
          error: "nur KI-Vermerke sind prüfpflichtig",
          requestId: requestIdOf(request),
        });
      // Einmalig: ein bereits geprüfter Entwurf → 409 (append-only, keine zweite Entscheidung).
      if (reviewMapOf(events).has(note.auditEventId))
        return reply.code(409).send({
          error: "Vermerk bereits geprüft",
          requestId: requestIdOf(request),
        });

      const event = createFachlicheAuditEvent({
        eventType: REVIEW_EVENT_TYPE,
        actorId: session.actorId,
        actingAuthorityId: appCase.authorityId,
        purpose: "aktenvermerk-pruefung",
        legalBasisId: legalBasisFor(appCase),
        caseId: appCase.caseId,
        requestId: requestIdOf(request),
        summary: `KI-Vermerk ${note.auditEventId} ${request.body.entscheidung}`,
      });
      try {
        await deps.caseStore.appendAuditEvent({
          auditEventId: event.auditEventId,
          caseId: appCase.caseId,
          tenantId: session.tenantId,
          authorityId: appCase.authorityId,
          jurisdictionId: appCase.jurisdictionId,
          actorId: session.actorId,
          eventType: event.eventType,
          purpose: event.purpose,
          legalBasisId: event.legalBasisId,
          requestId: requestIdOf(request),
          payload: {
            vermerkId: note.auditEventId,
            entscheidung: request.body.entscheidung,
            summary: event.summary,
          },
          occurredAt: event.occurredAt,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send(
        toVermerkDto(note, appCase.caseId, request.body.entscheidung),
      );
    },
  );
}
