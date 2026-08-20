// GET /api/composables — DISCOVERY der Agentic Composables (CHOS Blueprint v5.0). Read-only Data Plane:
// Lesen/Auffinden braucht keinen Capability-Token (Blueprint §15), nur eine Sitzung (session.read). Die
// deterministische Naht existiert IMMER (Plattformregel §9); ohne registrierte Composables ist die Liste leer.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { randomUUID } from "node:crypto";
import {
  ComposableChatRequestSchema,
  ComposableChatReplyDtoSchema,
  ComposableDetailDtoSchema,
  ComposableListDtoSchema,
  ComposableSpineParamsSchema,
  SpineRunRequestSchema,
  SpineRunResultDtoSchema,
  EvidenceLedgerDtoSchema,
  ErrorEnvelopeSchema,
  CaseIdParamsSchema,
  type ComposableChatDateiRefDto,
  type ComposableDetailDto,
  type ComposableHerkunftDto,
  type ComposableSummaryDto,
  type EvidenceEntryDto,
} from "@senticor/app-bff-contracts";
import type {
  EvidenceEntry,
  VerfahrensWissenEintrag,
} from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  certificationReadiness,
  createAppDataAuditEvent,
  HITL_PFLICHT_AUFGABEN,
  istEnabled,
  istRechtsnah,
  neutralisiereInjektion,
  type AgenticComposable,
  type SpineAufgabe,
} from "@senticor/public-sector-sdk";
import type {
  AiChatTurn,
  AttachmentRef,
  PortCallContext,
} from "@senticor/platform-contracts";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";
import { kuratierteWissensEintraege } from "./verfahren-wissen.js";

/** Reuse-Herkunft → Wire-DTO. Fehlt sie am Composable, ist die Stelle lokal abgeleitet (absent ⇒ lokal —
 *  evidence-driven, nie geraten; die EINE Wahrheit ist die Mount-Provenienz, die der Loader anhängt). */
function toHerkunft(c: AgenticComposable): ComposableHerkunftDto {
  const h = c.herkunft;
  if (!h || h.art !== "registry-mount") return { art: "lokal-abgeleitet" };
  return {
    art: "registry-mount",
    quelle: h.quelle.map((q) => ({
      verbundId: q.verbundId,
      tenant: q.tenant,
      ...(q.publishedAt !== undefined ? { publishedAt: q.publishedAt } : {}),
    })),
    ...(h.version !== undefined ? { version: h.version } : {}),
    ...(h.recordHash !== undefined ? { recordHash: h.recordHash } : {}),
    ...(h.mountedAt !== undefined ? { mountedAt: h.mountedAt } : {}),
  };
}

function toSummary(c: AgenticComposable): ComposableSummaryDto {
  return {
    id: c.id,
    version: c.version,
    displayName: c.displayName,
    klasse: c.klasse,
    status: c.status,
    assurance: c.assurance,
    enabled: istEnabled(c),
    hasSpine: c.spine !== undefined,
    herkunft: toHerkunft(c),
  };
}

function toDetail(c: AgenticComposable): ComposableDetailDto {
  return {
    id: c.id,
    version: c.version,
    displayName: c.displayName,
    klasse: c.klasse,
    status: c.status,
    assurance: c.assurance,
    enabled: istEnabled(c),
    outcome: {
      fuerWen: c.outcome.fuerWen,
      ergebnis: c.outcome.ergebnis,
      messung: c.outcome.messung,
      nichtScope: c.outcome.nichtScope,
    },
    owners: { ...c.owners } as Record<string, string>,
    ...(c.moduleId !== undefined ? { moduleId: c.moduleId } : {}),
    ...(c.spine
      ? {
          spine: {
            role: c.spine.role,
            autonomy: c.spine.autonomy,
            aufgaben: [...c.spine.aufgaben],
            skills: [...c.spine.skills],
            knowledgeDomains: [...c.spine.knowledgeDomains],
            rechtsnah: istRechtsnah(c.spine),
          },
        }
      : {}),
    evals: [...c.evals],
    replaceableBy: [...c.replaceableBy],
    herkunft: toHerkunft(c),
    certification: certificationReadiness(c),
    // BEIDE SEITEN auf den Draht. Der Anspruch reist, der Programm-Koerper nie — er liegt beim Herausgeber
    // unter `.chos/business-logic` und wird weder beim Publish noch beim Mount noch im Container-Payload
    // transportiert. Ein gemountetes Composable zeigt deshalb die Kennung und ihre Grundlagen, nicht die Tabelle.
    ...(c.strukturiert?.length
      ? {
          strukturiert: c.strukturiert.map((s) => ({
            id: s.id,
            ergebnis: s.ergebnis,
            ...(s.klasse !== undefined ? { klasse: s.klasse } : {}),
            ...(s.programm !== undefined ? { programm: s.programm } : {}),
            ...(s.grundlagen !== undefined
              ? { grundlagen: [...s.grundlagen] }
              : {}),
            ...(s.evalSuite !== undefined ? { evalSuite: s.evalSuite } : {}),
            ...(s.erzeugtVon !== undefined ? { erzeugtVon: s.erzeugtVon } : {}),
            ...(s.freigegebenVon !== undefined
              ? { freigegebenVon: s.freigegebenVon }
              : {}),
          })),
        }
      : {}),
    ...(c.benutzt?.length
      ? {
          benutzt: c.benutzt.map((k) => ({
            wissen: k.wissen,
            werkzeug: k.werkzeug,
          })),
        }
      : {}),
  };
}

/** BlobStorage-AttachmentRef → Wire-DTO (identische Felder, explizit gemappt). */
function toDateiRef(ref: AttachmentRef): ComposableChatDateiRefDto {
  return {
    attachmentId: ref.attachmentId,
    fileName: ref.fileName,
    mimeType: ref.mimeType,
    sizeBytes: ref.sizeBytes,
    checksumSha256: ref.checksumSha256,
  };
}

/** Textartige MIME-Typen, deren Inhalt die Antwort ERDEN darf (dekodiert, injektions-neutralisiert,
 *  gedeckelt). Binärdateien reisen nur als Metadaten — nie Roh-Bytes an das Modell. */
function istTextartig(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  );
}

/** Obergrenze je Datei-Erdungstext (PII-/Kontext-Deckel). */
const DATEI_TEXT_DECKEL = 20_000;

function toEvidenceDto(e: EvidenceEntry): EvidenceEntryDto {
  return {
    evidenceId: e.evidenceId,
    entryType: e.entryType,
    actorId: e.actorId,
    summary: e.summary,
    refs: { ...e.refs },
    occurredAt: e.occurredAt,
    prevHash: e.prevHash,
    entryHash: e.entryHash,
  };
}

export function registerComposableRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  // KATALOG-DISCOVERY verlangt `ai.assist`, nicht `session.read`: die Liste der handelnden Stellen
  // (Fähigkeiten, Autonomiegrad, Wissensdomänen) ist eine Innenansicht der Behörde. Mit `session.read`
  // konnte JEDE angemeldete Bürger:in sie abrufen — ein kostenloses Verzeichnis der Angriffsfläche.
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.aiAssist.permission },
    deps,
  );
  // Den Spine AUSFÜHREN ist eine agentische (KI-)Handlung → ai.assist-Permission (nur Sachbearbeitung),
  // getrennt vom read-only Discovery (session.read).
  const spineAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.aiAssist.permission },
    deps,
  );
  // Evidence lesen ist eine behördliche Oversight-Sicht (case.read) — nicht bürger-öffentlich.
  const evidenceAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseRead.permission },
    deps,
  );
  const errorResponses = {
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
  };

  typed.get(
    "/api/composables",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Agentic Composables auflisten (Discovery — versionierte Fähigkeitseinheiten mit Spine-Agent)",
        response: { 200: ComposableListDtoSchema, ...errorResponses },
      },
    },
    async () => {
      const list = deps.composableRegistry?.list() ?? [];
      return { composables: list.map(toSummary) };
    },
  );

  typed.get(
    "/api/composables/:id",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Ein Composable im Detail — inkl. Contract Envelope, Spine-Agent und Zertifizierungsreife",
        params: CaseIdParamsSchema,
        response: { 200: ComposableDetailDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const found = deps.composableRegistry?.get(request.params.id);
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      return reply.send(toDetail(found));
    },
  );

  // POST /api/composables/:id/spine/:aufgabe — den SPINE-AGENT eine Aufgabe ausführen lassen (Nutzer-Mandat:
  // Assistenz → Prüfung/Subsumtion/Review/Strukturierung). Läuft über den AiAssistPort (AAL-2 „Advise"): das
  // Ergebnis ist IMMER ein Vorschlag mit reviewRequired=true — nie eine Entscheidung. Für rechtsnahe Aufgaben
  // (HITL-pflichtig) bleibt die Entscheidung zwingend menschlich (Vier-Augen serverseitig). Die Aufgabe muss am
  // Spine DEKLARIERT sein (sonst 422) — ein Agent kann keine Fähigkeit erfinden, die das Composable nicht trägt.
  typed.post(
    "/api/composables/:id/spine/:aufgabe",
    {
      config: spineAuth.config,
      preHandler: spineAuth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Den Spine-Agent eine Aufgabe ausführen lassen (assistiv, HCAI — reviewRequired, nie eine Entscheidung)",
        params: ComposableSpineParamsSchema,
        body: SpineRunRequestSchema,
        response: {
          200: SpineRunResultDtoSchema,
          422: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id, aufgabe } = request.params;
      const found = deps.composableRegistry?.get(id);
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      if (!found.spine)
        return reply.code(404).send({
          error: "dieses Composable hat keinen Spine-Agent",
          requestId: requestIdOf(request),
        });
      // Die Aufgabe muss am Spine deklariert sein — deckt zugleich ungültige Aufgaben-Namen ab.
      if (!found.spine.aufgaben.includes(aufgabe as SpineAufgabe))
        return reply.code(422).send({
          error: `Aufgabe '${aufgabe}' ist für diesen Spine nicht deklariert`,
          requestId: requestIdOf(request),
        });

      const session = sessionOf(request);
      const now = new Date().toISOString();
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "employee" },
        purpose: "spine-run",
      };
      // Der Spine berät nur (limited-risk) — high-risk-Autonomie lehnt der Port ab; reviewRequired bleibt true.
      const result = await deps.aiAssist.suggest(context, {
        task: `spine:${id}:${aufgabe}`,
        input: request.body.input,
        maxClass: "limited-risk",
      });
      if (!result.ok) {
        const status =
          result.error.code === "ai-assist/high-risk-refused" ? 422 : 503;
        return reply.code(status).send({
          error: result.error.message,
          requestId: requestIdOf(request),
        });
      }

      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "spine.suggestion.created",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `Spine-Vorschlag '${aufgabe}' für Composable '${id}' erzeugt (${result.value.modelId})`,
          resource: { type: "composable-spine", id: `${id}:${aufgabe}` },
        }),
      });

      // EVIDENCE-LEDGER (Blueprint §15.3): die agentische Handlung hash-verkettet + tamper-evident festhalten —
      // NUR Metadaten (Akteur/Aufgabe/Modell), nie der Vorschlagsinhalt (kein PII in der Kette).
      if (deps.evidenceLedger) {
        await deps.evidenceLedger.append({
          evidenceId: `ev.${randomUUID()}`,
          ledgerId: `composable:${id}`,
          tenantId: session.tenantId,
          actorId: session.actorId,
          entryType: "spine.suggestion",
          summary: `Spine-Vorschlag '${aufgabe}' (${result.value.modelId})`,
          refs: {
            composableId: id,
            aufgabe,
            modelId: result.value.modelId,
            ...(request.body.caseId ? { caseId: request.body.caseId } : {}),
          },
          occurredAt: now,
        });
      }

      return reply.code(200).send({
        composableId: id,
        aufgabe,
        rechtsnah: HITL_PFLICHT_AUFGABEN.includes(aufgabe as SpineAufgabe),
        autonomy: found.spine.autonomy,
        suggestion: result.value,
      });
    },
  );

  // POST /api/composables/:id/chat — das Composable als LINGUISTISCHER Agent (Ziel-1 S5): eine governed
  // Konversations-Runde mit dem Spine-Agent. GOVERNED heißt: (1) nur mit deklariertem Spine + Autonomie
  // oberhalb AAL-0 (deny-by-default aus dem Manifest); (2) GEERDET auf das kuratierte Verfahrens-Wissen der
  // knowledgeDomains (dieselbe Kurations-Wahrheit wie das Wiki — verworfenes KI-Wissen kontaminiert nie);
  // die zitierfähigen Quellen leitet der SERVER ab, nie die Modell-Antwort (keine erfundenen Normen);
  // (3) HITL: die Antwort ist ein AiSuggestion-VORSCHLAG (reviewRequired=true, limited-risk) — nie eine
  // Entscheidung; (4) EVIDENZIERT: jede Runde landet als chat.turn hash-verkettet im Evidence-Ledger (nur
  // Metadaten, nie Inhalt). Datei rein/raus über den BlobStoragePort (Muster Nachweis-Upload).
  typed.post(
    "/api/composables/:id/chat",
    {
      config: spineAuth.config,
      preHandler: spineAuth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Mit dem Spine-Agent eines Composables chatten (geerdet, evidenziert, HCAI — reviewRequired, nie eine Entscheidung)",
        params: CaseIdParamsSchema,
        body: ComposableChatRequestSchema,
        response: {
          200: ComposableChatReplyDtoSchema,
          400: ErrorEnvelopeSchema,
          422: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const found = deps.composableRegistry?.get(id);
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      // Chat ist eine agentische (linguistische) Fähigkeit — ohne Spine gibt es sie nicht (deny-by-default).
      if (!found.spine)
        return reply.code(404).send({
          error: "dieses Composable hat keinen Spine-Agent",
          requestId: requestIdOf(request),
        });
      // AAL-0 = Deterministic only: das Manifest erlaubt KEINE agentische Konversation (Autonomie-Decke).
      if (found.spine.autonomy === "AAL-0")
        return reply.code(422).send({
          error:
            "Autonomie AAL-0 (deterministic only) erlaubt keine agentische Konversation",
          requestId: requestIdOf(request),
        });

      const session = sessionOf(request);
      const now = new Date().toISOString();
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "employee" },
        purpose: "composable-chat",
      };

      // ── ERDUNG: kuratiertes Verfahrens-Wissen der knowledgeDomains (Domain ↔ procedureId-Konvention). ──
      const domains = found.spine.knowledgeDomains;
      const verfahren = deps.procedureRegistry
        .list()
        .filter((p) => domains.includes(p.procedureId));
      let wissen: VerfahrensWissenEintrag[] = [];
      try {
        for (const p of verfahren) {
          const eintraege = await deps.wissenStore.listEintraege({
            tenantId: session.tenantId,
            authorityId: session.authorityId,
            procedureId: p.procedureId,
            procedureVersion: p.version,
          });
          wissen = wissen.concat(kuratierteWissensEintraege(eintraege));
        }
      } catch {
        // Fail-closed: ohne lesbare Wissens-Basis keine „geerdete" Antwort vortäuschen.
        return storeUnavailable(request, reply);
      }
      const wissenKontext = wissen.map((e) => ({
        quelle: `wissen:${e.eintragId}`,
        art: e.art,
        text: neutralisiereInjektion(e.text),
      }));
      // Zitierfähige Quellen leitet der SERVER ab (Evidence-Wahrheit) — nie aus der Modell-Antwort.
      const quellen = [
        ...wissen.map((e) => `wissen:${e.eintragId}`),
        ...domains.map((d) => `domain:${d}`),
      ];

      // ── Datei-IN: BlobStorage-Ablage; textartige Inhalte erden zusätzlich (neutralisiert, gedeckelt). ──
      const dateienRein: AttachmentRef[] = [];
      const dateiKontext: {
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        text?: string;
      }[] = [];
      for (const datei of request.body.dateien ?? []) {
        const bytes = new Uint8Array(
          Buffer.from(datei.contentBase64, "base64"),
        );
        if (bytes.byteLength === 0)
          return reply.code(400).send({
            error: `leerer oder ungültiger Inhalt: ${datei.fileName}`,
            requestId: requestIdOf(request),
          });
        const put = await deps.blobStorage.put(
          { ...context, purpose: "composable-chat-datei" },
          { fileName: datei.fileName, mimeType: datei.mimeType, bytes },
        );
        if (!put.ok)
          return reply.code(503).send({
            error: put.error.message,
            requestId: requestIdOf(request),
          });
        dateienRein.push(put.value);
        dateiKontext.push({
          fileName: put.value.fileName,
          mimeType: put.value.mimeType,
          sizeBytes: put.value.sizeBytes,
          ...(istTextartig(datei.mimeType)
            ? {
                text: neutralisiereInjektion(
                  Buffer.from(bytes).toString("utf8"),
                ).slice(0, DATEI_TEXT_DECKEL),
              }
            : {}),
        });
      }

      // ── Provider-Runde: converse (Chat-Naht) mit suggest-Fallback (Verlauf reist im input). ──────────
      const history: AiChatTurn[] = [
        ...(request.body.verlauf ?? []).map((t): AiChatTurn => ({
          role: t.rolle === "assistent" ? "assistant" : "user",
          text: t.text,
        })),
        { role: "user", text: request.body.nachricht },
      ];
      const task = `composable-chat:${id}`;
      const input: Record<string, unknown> = {
        composable: {
          id: found.id,
          displayName: found.displayName,
          klasse: found.klasse,
          autonomy: found.spine.autonomy,
          aufgaben: found.spine.aufgaben,
          knowledgeDomains: domains,
        },
        regeln: [
          "Antworte NUR geerdet auf die mitgegebenen Wissenseinträge (wissen[]) und Dateien.",
          "Zitiere Belege über ihre quelle (wissen:<eintragId>); erfinde NIE Normen oder Paragraphen.",
          "Du berätst nur (Advise) — du triffst keine Entscheidung.",
        ],
        wissen: wissenKontext,
        ...(dateiKontext.length > 0 ? { dateien: dateiKontext } : {}),
        ...(request.body.caseId ? { caseId: request.body.caseId } : {}),
      };
      const result = deps.aiAssist.converse
        ? await deps.aiAssist.converse(context, {
            task,
            history,
            input,
            maxClass: "limited-risk",
          })
        : await deps.aiAssist.suggest(context, {
            task,
            input: { ...input, verlauf: history },
            maxClass: "limited-risk",
          });
      if (!result.ok) {
        const status =
          result.error.code === "ai-assist/high-risk-refused" ? 422 : 503;
        return reply.code(status).send({
          error: result.error.message,
          requestId: requestIdOf(request),
        });
      }
      const antwortText =
        typeof result.value.value === "string"
          ? result.value.value
          : JSON.stringify(result.value.value);

      // ── Datei-OUT: die Antwort zusätzlich als Markdown-Datei ablegen + zurückgeben. ─────────────────
      let dateiRaus: { ref: AttachmentRef; contentBase64: string } | undefined;
      if (request.body.antwortAlsDatei === true) {
        const bytes = new Uint8Array(Buffer.from(antwortText, "utf8"));
        const put = await deps.blobStorage.put(
          { ...context, purpose: "composable-chat-antwort" },
          {
            fileName: `antwort-${id}-${Date.now()}.md`,
            mimeType: "text/markdown",
            bytes,
          },
        );
        if (!put.ok)
          return reply.code(503).send({
            error: put.error.message,
            requestId: requestIdOf(request),
          });
        dateiRaus = {
          ref: put.value,
          contentBase64: Buffer.from(bytes).toString("base64"),
        };
      }

      const geerdet = wissen.length > 0;
      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "composable.chat.turn",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `Chat-Runde für Composable '${id}' (${result.value.modelId}, ${wissen.length} Wissenseinträge)`,
          resource: { type: "composable-chat", id },
        }),
      });
      // EVIDENCE-LEDGER (Blueprint §15.3): jede Chat-Runde hash-verkettet + tamper-evident — NUR Metadaten
      // (Akteur/Modell/Erdung/Datei-Referenzen), NIE der Nachrichten-/Antwort-Inhalt (kein PII in der Kette).
      if (deps.evidenceLedger) {
        await deps.evidenceLedger.append({
          evidenceId: `ev.${randomUUID()}`,
          ledgerId: `composable:${id}`,
          tenantId: session.tenantId,
          actorId: session.actorId,
          entryType: "chat.turn",
          summary: `Chat-Runde (${result.value.modelId}) — ${geerdet ? "geerdet" : "ungeerdet"}`,
          refs: {
            composableId: id,
            modelId: result.value.modelId,
            geerdet: String(geerdet),
            wissensEintraege: String(wissen.length),
            ...(request.body.caseId ? { caseId: request.body.caseId } : {}),
            ...(dateienRein.length > 0
              ? {
                  dateienRein: dateienRein.map((r) => r.attachmentId).join(","),
                }
              : {}),
            ...(dateiRaus ? { dateiRaus: dateiRaus.ref.attachmentId } : {}),
          },
          occurredAt: now,
        });
      }

      return reply.code(200).send({
        composableId: id,
        autonomy: found.spine.autonomy,
        rechtsnah: istRechtsnah(found.spine),
        antwort: {
          ...result.value,
          value: antwortText,
        },
        erdung: {
          geerdet,
          wissensEintraege: wissen.length,
          quellen,
        },
        dateienRein: dateienRein.map(toDateiRef),
        ...(dateiRaus
          ? {
              datei: {
                ref: toDateiRef(dateiRaus.ref),
                contentBase64: dateiRaus.contentBase64,
              },
            }
          : {}),
      });
    },
  );

  // GET /api/composables/:id/evidence — der hash-verkettete Evidence-Ledger dieses Composables (Blueprint
  // §15.3/§27: exportierbar + verifizierbar). Behördliche Oversight-Sicht (case.read). `chain.valid`
  // beweist die Unversehrtheit; ein Bruch nennt den Index (brokenAt).
  typed.get(
    "/api/composables/:id/evidence",
    {
      config: evidenceAuth.config,
      preHandler: evidenceAuth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Evidence-Ledger eines Composables — hash-verketteter, verifizierbarer Nachweis der Spine-Handlungen",
        params: CaseIdParamsSchema,
        response: { 200: EvidenceLedgerDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const found = deps.composableRegistry?.get(request.params.id);
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      const session = sessionOf(request);
      const ledgerId = `composable:${request.params.id}`;
      const entries = deps.evidenceLedger
        ? await deps.evidenceLedger.list({
            tenantId: session.tenantId,
            ledgerId,
          })
        : [];
      const chain = deps.evidenceLedger
        ? await deps.evidenceLedger.verify({
            tenantId: session.tenantId,
            ledgerId,
          })
        : { valid: true, length: 0 };
      return reply.send({
        ledgerId,
        entries: entries.map(toEvidenceDto),
        chain,
      });
    },
  );
}
