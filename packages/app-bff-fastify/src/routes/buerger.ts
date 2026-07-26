// GET/POST /api/buerger/antraege — die BÜRGER-Sicht auf die EIGENEN Anträge.
//
// WARUM EINE EIGENE ROUTEN-FAMILIE statt eines `scope`-Felds auf /api/cases:
// `scopeOf` (route-auth.ts) läse den Scope aus QUERY/BODY mit Default „own", und der Handler leitete ihn
// unabhängig davon nochmal ab. Divergieren die beiden, prüft die Policy „own" und der Handler holt
// Behörden-Daten. Verschärfend: ein nicht im Schema deklariertes `scope` wirft Fastify STILL weg
// (removeAdditional) — der Fallback wäre lautlos. HIER ist der Scope durch die ROUTE impliziert und
// kommt gar nicht mehr von der Leitung: der Vektor existiert nicht, statt bewacht zu werden.
//
// EIGENTÜMERSCHAFT KOMMT AUSSCHLIESSLICH AUS DER SITZUNG (`session.actorId`), NIE aus Query/Body —
// Präzedenz mailbox.ts. Der Store filtert im PRÄDIKAT (`scope: "owner"`), nicht der Handler in einer
// Nachprüfung: ein fremder Antrag kommt gar nicht erst zurück → 404, kein 403-Existenz-Orakel.
//
// Der Server INTERPRETIERT `data` NICHT (Antragsdaten/Berechnung sind für ihn opak — die fachliche
// Config liegt ausserhalb seines rootDir). Er stempelt Kennung/Version/Zeit/Eigentümer und auditiert.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Type, type TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AntragDtoSchema,
  AntragEinreichenRequestSchema,
  AntragIdParamsSchema,
  AntragListDtoSchema,
  ErrorEnvelopeSchema,
  NachweisDownloadDtoSchema,
  NachweisIdParamsSchema,
  NachweisListDtoSchema,
  NachweisRefDtoSchema,
  NachweisUploadRequestSchema,
  VerwaltungsaktDtoSchema,
  WiderspruchDtoSchema,
  WiderspruchRequestSchema,
  type AntragDto,
  type NachweisRefDto,
  type VerwaltungsaktDto,
} from "@senticor/app-bff-contracts";
import type { AppAuditEvent, AppCase } from "@senticor/app-store-postgres";
import {
  ANLAGEN_REGELN_DEFAULT,
  auslieferungsMimeTyp,
  builtInPermissions,
  createFachlicheAuditEvent,
  forderungsstandAusAudit,
  formatiereEingangsnummer,
  FORDERUNG_ZAHLUNG_EINGEGANGEN,
  HERKUNFT_EXTERN,
  HERKUNFT_PAYLOAD_KEY,
  HITL_PFLICHT_PAYLOAD_KEY,
  istRechtsbehelfVerfristet,
  pruefeAnlage,
  rechtsbehelfVerfristetAb,
  type AnlagenRegeln,
  type ProcedureVersion,
  type RechtsbehelfFristRegime,
} from "@senticor/public-sector-sdk";
import type { PortCallContext } from "@senticor/platform-contracts";
import type { BffDeps } from "../deps.js";
import { canonicalSha256 } from "../canonical-hash.js";
import { drosselRegelnAus, pruefeDrossel } from "../drossel.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

/** Die eingefrorene VA-Form, wie sie in der Audit-payload liegt. */
interface GefrorenerVa {
  content: Record<string, unknown>;
  checksumSha256: string;
}

/** Sucht den zuletzt eingefrorenen Verwaltungsakt in den Audit-Ereignissen (payload.verwaltungsakt am
 *  festsetzenden case.transitioned). `undefined`, wenn noch kein Bescheid erlassen wurde. */
function findVerwaltungsakt(events: AppAuditEvent[]): GefrorenerVa | undefined {
  // listAuditEvents ist aufsteigend — den JÜNGSTEN VA nehmen (ein späterer Änderungsbescheid überschreibt
  // die Sicht, ohne den älteren im append-only Audit zu löschen).
  for (let i = events.length - 1; i >= 0; i--) {
    const va = events[i]?.payload["verwaltungsakt"] as
      Partial<GefrorenerVa> | undefined;
    if (
      va &&
      typeof va.checksumSha256 === "string" &&
      va.content &&
      typeof va.content === "object"
    ) {
      return { content: va.content, checksumSha256: va.checksumSha256 };
    }
  }
  return undefined;
}

/** Die gefrorene VA-payload → das vollständige DTO (content-Felder + der separate Hash). */
/**
 * Projiziert den eingefrorenen VA in sein DTO. BEWUSST OHNE jede Anreicherung: der `checksumSha256` deckt
 * exakt diese Felder, und der Bürger re-hasht sie. Jede beim Lesen ergänzte Anzeige-Angabe zerstörte den
 * Beweiswert. Behörde und Entwurfs-Marker werden deshalb beim ERLASS eingefroren (cases.ts), nicht hier.
 */
function toVerwaltungsaktDto(va: GefrorenerVa): VerwaltungsaktDto {
  return {
    ...(va.content as Omit<VerwaltungsaktDto, "checksumSha256">),
    checksumSha256: va.checksumSha256,
  };
}

const NACHWEIS_EVENT_TYPE = "nachweis.uploaded";

/** Ein `nachweis.uploaded`-Audit-Ereignis → NachweisRefDto (Metadaten aus der append-only payload). Der
 *  Ref beweist zugleich die Zugehörigkeit einer Anlage zum Antrag: nur wer hier auftaucht, ist abrufbar. */
function nachweisRefOf(e: AppAuditEvent): NachweisRefDto | undefined {
  const p = e.payload;
  const attachmentId = p["attachmentId"];
  const fileName = p["fileName"];
  const mimeType = p["mimeType"];
  const sizeBytes = p["sizeBytes"];
  const checksumSha256 = p["checksumSha256"];
  if (
    typeof attachmentId === "string" &&
    typeof fileName === "string" &&
    typeof mimeType === "string" &&
    typeof sizeBytes === "number" &&
    typeof checksumSha256 === "string"
  ) {
    return {
      attachmentId,
      fileName,
      mimeType,
      sizeBytes,
      checksumSha256,
      hochgeladenAm: e.occurredAt,
    };
  }
  return undefined;
}

/** AppCase → AntragDto: die BÜRGER-Projektion. Interne Zuordnung (subjectIds) und Server-Topologie
 *  (tenant/authority/jurisdiction) bleiben bewusst draussen — sie gehen den Antragsteller nichts an. */
function toAntragDto(c: AppCase, eingangsnummer: string): AntragDto {
  return {
    antragId: c.caseId,
    procedureId: c.procedureId,
    procedureVersion: c.procedureVersion,
    state: c.state,
    version: c.version,
    eingereichtAm: c.openedAt,
    abgeschlossenAm: c.closedAt,
    data: c.data,
    // SERVER-VERGEBEN (nicht aus `data`): die lesbare Projektion der caseId + der Server-Eingangszeit.
    // Der Browser stempelte sie früher selbst — ein so erzeugter Eingangsnachweis trug die Uhr des
    // Antragstellers und war als Fristnachweis wertlos.
    eingangsnummer,
  };
}

/** Die server-vergebene Eingangsnummer eines Falls — reine Projektion aus caseId + Eingangszeit + dem
 *  vom VERFAHREN deklarierten Format. Deterministisch: derselbe Fall trägt immer dieselbe Nummer,
 *  ohne dass sie irgendwo zusätzlich gespeichert werden müsste (keine zweite Wahrheit). */
function eingangsnummerVon(
  c: AppCase,
  procedure: ProcedureVersion | undefined,
): string {
  return formatiereEingangsnummer({
    eingangIso: c.openedAt,
    caseId: c.caseId,
    procedureId: c.procedureId,
    ...(procedure?.eingangsnummerFormat !== undefined
      ? { format: procedure.eingangsnummerFormat }
      : {}),
  });
}

/** Die Anlagen-Regeln dieses Verfahrens (DATEN) — fehlt eine Angabe, gilt der fail-closed Default. */
function anlagenRegelnVon(
  procedure: ProcedureVersion | undefined,
): AnlagenRegeln {
  const dekl = procedure?.anlagen;
  const typen = dekl?.erlaubteMimeTypen
    ? ANLAGEN_REGELN_DEFAULT.typen.filter((t) =>
        dekl.erlaubteMimeTypen?.includes(t.mimeType),
      )
    : ANLAGEN_REGELN_DEFAULT.typen;
  return {
    typen,
    maxBytes: dekl?.maxBytes ?? ANLAGEN_REGELN_DEFAULT.maxBytes,
    maxAnzahl: dekl?.maxAnzahl ?? ANLAGEN_REGELN_DEFAULT.maxAnzahl,
  };
}

/** Bürger-lesbarer Ablehnungstext + HTTP-Status je Ablehnungsgrund. KEIN interner Code, kein Pfad,
 *  keine Adapter-Meldung — die Sicht-Invariante gilt gerade im Fehlerfall (dort leckt es sonst). */
function anlagenAblehnungAntwort(
  ablehnung: Extract<
    ReturnType<typeof pruefeAnlage>,
    { ok: false }
  >["ablehnung"],
  regeln: AnlagenRegeln,
): { status: number; text: string } {
  switch (ablehnung.grund) {
    case "leer":
      return { status: 400, text: "Die Datei ist leer." };
    case "zu-gross":
      return {
        status: 413,
        text: `Die Datei ist zu groß (höchstens ${Math.floor(regeln.maxBytes / 1_000_000)} MB).`,
      };
    case "zu-viele":
      return {
        status: 422,
        text: `Es sind höchstens ${regeln.maxAnzahl} Anlagen je Antrag möglich.`,
      };
    case "dateiname-unzulaessig":
      return { status: 422, text: "Der Dateiname ist nicht zulässig." };
    case "typ-nicht-erlaubt":
      return {
        status: 415,
        text: `Dieses Dateiformat wird nicht angenommen. Möglich sind: ${regeln.typen
          .flatMap((t) => t.endungen)
          .join(", ")}.`,
      };
    case "inhalt-passt-nicht-zur-deklaration":
      return {
        status: 415,
        text: "Der Inhalt der Datei passt nicht zu ihrem Format. Bitte laden Sie die Datei erneut im angegebenen Format hoch.",
      };
  }
}

export function registerBuergerRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  // NICHT `rbac-scoped`: es gibt hier keine Scope-WAHL zu treffen — die Route IST der Scope.
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseOwnRead.permission },
    deps,
  );
  const submitAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseOwnSubmit.permission },
    deps,
  );
  const errorResponses = {
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
  };

  typed.get(
    "/api/buerger/antraege",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Die eigenen Anträge lesen",
        response: { 200: AntragListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let cases: AppCase[];
      try {
        cases = await deps.caseStore.listCases({
          tenantId: session.tenantId,
          // Der Eigentümer kommt aus der SITZUNG — es gibt keinen Weg, ihn von aussen zu setzen.
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({
        antraege: cases.map((c) =>
          toAntragDto(
            c,
            eingangsnummerVon(
              c,
              deps.procedureRegistry.get(c.procedureId, c.procedureVersion),
            ),
          ),
        ),
      });
    },
  );

  typed.get(
    "/api/buerger/antraege/:id",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Einen eigenen Antrag lesen",
        params: AntragIdParamsSchema,
        response: { 200: AntragDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Ein FREMDER Antrag kommt aus dem Prädikat gar nicht erst zurück — 404 ist die einzig
      // mögliche Antwort. Kein 403, das die Existenz fremder Vorgänge verriete.
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      return reply.send(
        toAntragDto(
          found,
          eingangsnummerVon(
            found,
            deps.procedureRegistry.get(
              found.procedureId,
              found.procedureVersion,
            ),
          ),
        ),
      );
    },
  );

  typed.get(
    "/api/buerger/antraege/:id/bescheid",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Den eigenen (eingefrorenen) Bescheid abrufen — Bekanntgabe",
        params: AntragIdParamsSchema,
        // Response VOLLSTÄNDIG deklariert — sonst wirft Fastifys removeAdditional den checksumSha256
        // STILL weg und der Beweiswert ginge lautlos verloren.
        response: { 200: VerwaltungsaktDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      // Owner-Scope aus der SITZUNG — fremder/nicht vorhandener Fall ⇒ 404, nie 403 (kein Existenz-Orakel).
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      // Den EINGEFRORENEN VA aus dem append-only Audit holen (KEIN Live-Render-Fallback: fehlt er,
      // ist der Fall noch nicht festgesetzt ⇒ 404).
      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const va = findVerwaltungsakt(events);
      if (!va)
        return reply
          .code(404)
          .send({ error: "kein Bescheid", requestId: requestIdOf(request) });

      // DEFENSE-IN-DEPTH: den Hash über die gelieferten Bytes NACHRECHNEN. Weicht er ab, wurde die
      // Audit-Zeile trotz Trigger manipuliert — dann NICHT ausliefern (500), nie einen unbewiesenen
      // Bescheid herausgeben.
      if (canonicalSha256(va.content) !== va.checksumSha256)
        return reply.code(500).send({
          error: "bescheid integrity check failed",
          requestId: requestIdOf(request),
        });

      // BEKANNTGABE als eigenes, auditiertes Ereignis (Fristlauf-Anker). EIGENER eventType
      // `case.disclosed` — bewusst NICHT in FOUR_EYES_RELEVANT_EVENT_TYPES: ein Bürger-Abruf ist eine
      // BEOBACHTUNG, kein Bearbeitungsschritt; er darf die Vier-Augen-Bezugsgröße nicht verschieben.
      const bekanntgabe = createFachlicheAuditEvent({
        eventType: "case.disclosed",
        actorId: session.actorId,
        actingAuthorityId: found.authorityId,
        purpose: "bekanntgabe",
        legalBasisId: String(va.content["fiktionNorm"] ?? "§ 41 Abs. 2 VwVfG"),
        caseId: found.caseId,
        requestId: requestIdOf(request),
        summary: `Bescheid ${found.caseId} durch die/den Eigentümer:in abgerufen (Bekanntgabe)`,
      });
      try {
        await deps.caseStore.appendAuditEvent({
          auditEventId: bekanntgabe.auditEventId,
          caseId: found.caseId,
          tenantId: session.tenantId,
          authorityId: found.authorityId,
          jurisdictionId: found.jurisdictionId,
          actorId: session.actorId,
          eventType: bekanntgabe.eventType,
          purpose: bekanntgabe.purpose,
          legalBasisId: bekanntgabe.legalBasisId,
          requestId: bekanntgabe.requestId,
          payload: { summary: bekanntgabe.summary },
          occurredAt: bekanntgabe.occurredAt,
        });
      } catch {
        return storeUnavailable(request, reply);
      }

      // inline: die SPA rendert den Bescheid (BescheidView) und bietet window.print() an.
      void reply.header("content-disposition", "inline");
      return reply.send(toVerwaltungsaktDto(va));
    },
  );

  // Denselben eingefrorenen Verwaltungsakt als PDF-Langzeitdokument HERUNTERLADEN (Issue #60). Reine ALTERNATIVE
  // REPRÄSENTATION der bereits über die BescheidView bekanntgegebenen VA — bewusst OHNE eigenes `case.disclosed`,
  // damit der Fristanker (Bekanntgabe) nicht doppelt gesetzt wird; die Bekanntgabe liegt beim JSON-/View-Abruf.
  typed.get(
    "/api/buerger/antraege/:id/bescheid.pdf",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Den eigenen (eingefrorenen) Bescheid als PDF herunterladen",
        params: AntragIdParamsSchema,
        // 200 = Binär (PDF-Bytes) → Unknown, damit Fastify die Bytes roh sendet (Buffer umgeht die Serialisierung).
        // 500 = Integritäts-/Render-Fehler, 501 = kein Renderer verdrahtet.
        response: {
          200: Type.Unknown(),
          500: ErrorEnvelopeSchema,
          501: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const va = findVerwaltungsakt(events);
      if (!va)
        return reply
          .code(404)
          .send({ error: "kein Bescheid", requestId: requestIdOf(request) });

      // DEFENSE-IN-DEPTH: den Hash über die gelieferten Bytes NACHRECHNEN — weicht er ab, NICHT ausliefern.
      if (canonicalSha256(va.content) !== va.checksumSha256)
        return reply.code(500).send({
          error: "bescheid integrity check failed",
          requestId: requestIdOf(request),
        });

      // Ohne verdrahteten Renderer kein stiller JSON-Fallback: 501 (die App-Komposition liefert die pdf-lib-Impl).
      if (!deps.bescheidPdf)
        return reply.code(501).send({
          error: "pdf renderer not configured",
          requestId: requestIdOf(request),
        });

      // M3: der Briefkopf nennt die beim ERLASS eingefrorene Anzeige-Identität, NIE die technische authorityId
      // („default" im Default-Deployment). Fehlt sie, sagt das Dokument ehrlich, dass es ein Entwurf ist.
      const dto = toVerwaltungsaktDto(va);
      let pdf: Uint8Array;
      try {
        pdf = await deps.bescheidPdf({
          va: dto,
          behoerde:
            dto.behoerde?.name ?? "(Behörde nicht deklariert — ENTWURF)",
        });
      } catch {
        return reply.code(500).send({
          error: "bescheid pdf render failed",
          requestId: requestIdOf(request),
        });
      }
      const safeName = dto.aktenzeichen.replace(/[^A-Za-z0-9._-]+/g, "_");
      void reply.header("content-type", "application/pdf");
      void reply.header(
        "content-disposition",
        `attachment; filename="Bescheid-${safeName}.pdf"`,
      );
      return reply.send(Buffer.from(pdf));
    },
  );

  typed.post(
    "/api/buerger/antraege",
    {
      config: submitAuth.config,
      preHandler: submitAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Einen eigenen Antrag einreichen",
        body: AntragEinreichenRequestSchema,
        response: { 201: AntragDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const body = request.body;
      // Das Verfahren muss REGISTRIERT sein (Verfahren = DATEN) und liefert Initialzustand +
      // Rechtsgrundlage — beides wird NIE aus dem Body übernommen und nie erfunden.
      const procedure = deps.procedureRegistry.get(
        body.procedureId,
        body.procedureVersion,
      );
      // SICHT-INVARIANTE: nach aussen NUR ein fachlicher Satz + requestId. Die frühere Meldung
      // („unknown procedure <id>@<version>") bestätigte einem Fremden die Existenz/Nicht-Existenz
      // interner Verfahrenskennungen — ein kostenloses Verzeichnis unserer Innenwelt.
      if (!procedure) {
        request.log.warn(
          {
            procedureId: body.procedureId,
            procedureVersion: body.procedureVersion,
          },
          "buerger submit: unknown procedure",
        );
        return reply.code(422).send({
          error:
            "Dieser Antrag kann derzeit nicht angenommen werden. Bitte wenden Sie sich an die zuständige Stelle.",
          requestId: requestIdOf(request),
        });
      }
      const initialState = procedure.allowedStates[0];
      const legalBasisId = procedure.legalBasisIds[0];
      if (initialState === undefined || legalBasisId === undefined) {
        request.log.error(
          { procedureId: procedure.procedureId },
          "buerger submit: procedure has no initial state or legal basis",
        );
        return reply.code(422).send({
          error:
            "Dieser Antrag kann derzeit nicht angenommen werden. Bitte wenden Sie sich an die zuständige Stelle.",
          requestId: requestIdOf(request),
        });
      }

      // ── MISSBRAUCHS-DROSSEL (store-gestützt, damit sie über mehrere Instanzen trägt) ──────────────
      // Gezählt wird, was TATSÄCHLICH entstanden ist: die eigenen Fälle im Fenster. Kein zweiter Zähler.
      const regeln = drosselRegelnAus(procedure.drossel);
      const now = new Date().toISOString();
      let eigene: AppCase[];
      try {
        eigene = await deps.caseStore.listCases({
          tenantId: session.tenantId,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const drossel = pruefeDrossel(
        eigene.map((c) => c.openedAt),
        regeln,
        now,
      );
      if (!drossel.erlaubt) {
        void reply.header("retry-after", String(drossel.retryAfterSekunden));
        return reply.code(429).send({
          error:
            "Es wurden in kurzer Zeit sehr viele Anträge gestellt. Bitte versuchen Sie es später erneut.",
          requestId: requestIdOf(request),
        });
      }

      const created: AppCase = {
        caseId: `case.${randomUUID()}`,
        tenantId: session.tenantId,
        // ZUSTÄNDIGKEIT AUS DEM VERFAHREN, nicht aus der Bürger-Sitzung: das Verfahren gehört einer
        // Stelle, nicht dem Antragsteller. Nur solange ein Verfahren keine Stelle deklariert, bleibt
        // die Sitzungs-Behörde der (dokumentierte) Rückfall.
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        procedureId: procedure.procedureId,
        procedureVersion: procedure.version,
        state: initialState,
        version: 1,
        subjectIds: [],
        openedAt: now,
        closedAt: null,
        data: body.data,
        // DER KERN: der Eigentümer ist die anfragende Sitzung — nicht verhandelbar, nicht überschreibbar.
        ownerActorId: session.actorId,
      };
      const eingangsnummer = eingangsnummerVon(created, procedure);
      try {
        await deps.caseStore.insertCase(created);
        // EIGENER EREIGNISTYP, nicht `case.opened`: Letzteres steht in
        // FOUR_EYES_RELEVANT_EVENT_TYPES (cases.ts) und bedeutet „ein Bearbeitungsschritt am Fall durch
        // eine bedienstete Person". Die Einreichung durch die Bürgerin ist der AUSLÖSER des Verfahrens,
        // keine Bearbeitung — sie darf die Vier-Augen-Bezugsgröße nicht verschieben. Genau die
        // Unterscheidung, die die Menge dort als Entscheidungsregel festhält.
        const audit = createFachlicheAuditEvent({
          eventType: "case.submitted",
          actorId: session.actorId,
          actingAuthorityId: session.authorityId,
          purpose: "case-management",
          legalBasisId,
          caseId: created.caseId,
          requestId: requestIdOf(request),
          newState: created.state,
          summary: `Antrag ${created.caseId} eingereicht (${created.procedureId})`,
        });
        await deps.caseStore.appendAuditEvent({
          auditEventId: audit.auditEventId,
          caseId: created.caseId,
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          actorId: session.actorId,
          eventType: audit.eventType,
          purpose: audit.purpose,
          legalBasisId: audit.legalBasisId,
          requestId: audit.requestId,
          payload: {
            newState: created.state,
            summary: audit.summary,
            // SERVER-STEMPEL, append-only: Nummer + Zeit sind ab hier Beweis, nicht Anzeige.
            eingangsnummer,
            datenSha256: canonicalSha256(created.data),
            // TAINT-INVARIANTE (extern-herkunft.ts): dieser Vorgang speist sich aus einer Eingabe
            // AUSSERHALB der Behörde. Daraus folgt zwingend die HITL-Pflicht — eine hoheitliche
            // Festsetzung verlangt später zwei verschiedene Menschen, egal was das Verfahren
            // deklariert. Der Wert steht hier LESBAR in der payload UND ist aus dem Ereignistyp
            // ableitbar; die Ableitung gewinnt (ein Feld allein wäre fälschbar).
            [HERKUNFT_PAYLOAD_KEY]: HERKUNFT_EXTERN,
            [HITL_PFLICHT_PAYLOAD_KEY]: true,
          },
          occurredAt: audit.occurredAt,
        });
      } catch {
        return storeUnavailable(request, reply);
      }

      // ── DIE ÜBERGABE INS AMT: der Antrag landet im EINGANGSKORB ──────────────────────────────────
      // Vorher endete die Kette exakt beim 201 — der Antrag lag in der Datenbank, aber auf keinem
      // Schreibtisch. Der Eingangskorb-Eintrag ist die Arbeitsaufforderung an die Stelle. PULL, nicht
      // PUSH: es wird eine AUFGABE hingelegt, nichts Agentisches ausgelöst (Zonen-Invariante I1).
      try {
        await deps.taskStore.insertTask({
          taskId: `task.${randomUUID()}`,
          caseId: created.caseId,
          tenantId: session.tenantId,
          authorityId: created.authorityId,
          jurisdictionId: created.jurisdictionId,
          title: `Neuer Antrag ${eingangsnummer} prüfen`,
          state: "open",
          assignedTo: null,
          dueAt: null,
          taskKind: "eingang",
          parentTaskId: null,
          data: {
            eingangsnummer,
            eingegangenAm: created.openedAt,
            // Die Stelle sieht SOFORT, dass die Daten von aussen kommen — bevor sie sie liest.
            [HERKUNFT_PAYLOAD_KEY]: HERKUNFT_EXTERN,
            [HITL_PFLICHT_PAYLOAD_KEY]: true,
          },
          sortRank: created.openedAt,
          version: 1,
          createdAt: created.openedAt,
          updatedAt: created.openedAt,
        });
      } catch {
        // Der Antrag IST eingegangen (append-only belegt) — ein fehlender Korb-Eintrag darf ihn nicht
        // zurücknehmen. Er wird protokolliert; die Eingangs-Sicht leitet sich zusätzlich aus den
        // Fällen ab, ist also nicht allein vom Task abhängig.
        request.log.error(
          { caseId: created.caseId },
          "eingangskorb-task konnte nicht angelegt werden",
        );
      }

      // ── DER RÜCKWEG: die Eingangsbestätigung liegt im eigenen Postfach ───────────────────────────
      // Nicht nur eine Bildschirmseite, die ein Reload wegnimmt: ein Beleg, den die Bürgerin
      // wiederfindet. Inhalt = Server-Zeit, Server-Nummer, Aktenzeichen, Hash der eingereichten Daten.
      try {
        await deps.appStore.saveMailboxMessage({
          messageId: `msg.${randomUUID()}`,
          box: "inbox",
          audience: "citizen",
          tenantId: session.tenantId,
          authorityId: created.authorityId,
          jurisdictionId: created.jurisdictionId,
          ownerActorId: session.actorId,
          caseId: created.caseId,
          subject: `Eingangsbestätigung ${eingangsnummer}`,
          bodyPreview:
            `Ihr Antrag ist am ${created.openedAt} bei uns eingegangen. ` +
            `Aktenzeichen: ${created.caseId}. Eingangsnummer: ${eingangsnummer}. ` +
            `Prüfsumme der eingereichten Angaben: ${canonicalSha256(created.data).slice(0, 16)}…`,
          status: "unread",
          createdAt: created.openedAt,
        });
      } catch {
        request.log.error(
          { caseId: created.caseId },
          "eingangsbestaetigung konnte nicht ins postfach gelegt werden",
        );
      }

      return reply.code(201).send(toAntragDto(created, eingangsnummer));
    },
  );

  // WIDERSPRUCH/EINSPRUCH/KLAGE gegen den eigenen Bescheid einlegen — die fehlende Rechtsbehelfs-HANDLUNG
  // (die Belehrung existierte nur als Anzeige). Setzt einen erlassenen Bescheid VORAUS (sonst 404: es gibt
  // nichts, wogegen man widerspricht). Der Rechtsbehelf ist EINMALIG (zweiter Versuch → 409). Er wird als
  // eigenes, owner-scoped Audit-Ereignis `case.objection` festgehalten — der Eingangszeitpunkt ist der
  // Fristwahrungs-Nachweis. Bewusst KEIN Zustandsübergang (nicht jedes Verfahren hat einen Widerspruchs-
  // Zustand; die Abhilfe-/Nichtabhilfe-Prüfung durch die Behörde ist ein späterer, eigener Schritt).
  typed.post(
    "/api/buerger/antraege/:id/widerspruch",
    {
      config: submitAuth.config,
      preHandler: submitAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary:
          "Rechtsbehelf (Widerspruch/Einspruch/Klage) gegen den eigenen Bescheid einlegen",
        params: AntragIdParamsSchema,
        body: WiderspruchRequestSchema,
        response: {
          200: WiderspruchDtoSchema,
          409: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Fremder/nicht vorhandener Fall ⇒ 404 (kein Existenz-Orakel), wie beim Bescheid-Abruf.
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Ohne erlassenen Bescheid gibt es keinen Rechtsbehelf ⇒ 404.
      const va = findVerwaltungsakt(events);
      if (!va)
        return reply
          .code(404)
          .send({ error: "kein Bescheid", requestId: requestIdOf(request) });

      // Einmaligkeit: ein bereits eingelegter Rechtsbehelf ⇒ 409 (kein Doppel-Eintrag im append-only Audit).
      if (events.some((e) => e.eventType === "case.objection"))
        return reply.code(409).send({
          error: "Widerspruch bereits eingelegt",
          requestId: requestIdOf(request),
        });

      // Art + Norm + Frist aus dem EINGEFRORENEN Regime (regime-neutral) — nicht aus dem Body, nicht erfunden.
      const rechtsbehelf = va.content["rechtsbehelf"] as
        | {
            art?: unknown;
            norm?: unknown;
            fristWert?: unknown;
            fristEinheit?: unknown;
          }
        | undefined;
      const art: "widerspruch" | "einspruch" | "klage" =
        rechtsbehelf?.art === "einspruch" || rechtsbehelf?.art === "klage"
          ? rechtsbehelf.art
          : "widerspruch";
      const norm =
        typeof rechtsbehelf?.norm === "string"
          ? rechtsbehelf.norm
          : "§ 68 ff. VwGO";

      const objection = createFachlicheAuditEvent({
        eventType: "case.objection",
        actorId: session.actorId,
        actingAuthorityId: found.authorityId,
        purpose: "rechtsbehelf",
        legalBasisId: norm,
        caseId: found.caseId,
        requestId: requestIdOf(request),
        summary: `Rechtsbehelf (${art}) gegen Bescheid ${found.caseId} durch die/den Eigentümer:in eingelegt`,
      });

      // FRISTPRÜFUNG (Issue #61, „verspäteter Rechtsbehelf erkannt"): Anker = die Bekanntgabe (erstes
      // `case.disclosed` — der Abruf des eigenen Bescheids), Frist = das EINGEFRORENE Regime des VA. Rein
      // server-autoritativ berechnet (Standardfall §§ 187/188 BGB). Wir FLAGGEN nur — kein Zurückweisen:
      // die Zulässigkeit (inkl. § 58 Abs. 2 VwGO / Wiedereinsetzung) entscheidet die Behörde. `null`, wenn
      // keine Bekanntgabe verankert ist (Frist nicht angelaufen) oder das Regime keine Frist trägt.
      const bekanntgabeAnker = events.find(
        (e) => e.eventType === "case.disclosed",
      )?.occurredAt;
      const fristRegime: RechtsbehelfFristRegime | undefined =
        typeof rechtsbehelf?.fristWert === "number" &&
        (rechtsbehelf.fristEinheit === "monat" ||
          rechtsbehelf.fristEinheit === "woche" ||
          rechtsbehelf.fristEinheit === "tag")
          ? {
              fristWert: rechtsbehelf.fristWert,
              fristEinheit: rechtsbehelf.fristEinheit,
            }
          : undefined;
      const verfristet: boolean | null =
        bekanntgabeAnker && fristRegime
          ? istRechtsbehelfVerfristet(
              bekanntgabeAnker,
              fristRegime,
              objection.occurredAt,
            )
          : null;
      const fristAblaufIso =
        bekanntgabeAnker && fristRegime
          ? (rechtsbehelfVerfristetAb(bekanntgabeAnker, fristRegime) ??
            undefined)
          : undefined;

      try {
        await deps.caseStore.appendAuditEvent({
          auditEventId: objection.auditEventId,
          caseId: found.caseId,
          tenantId: session.tenantId,
          authorityId: found.authorityId,
          jurisdictionId: found.jurisdictionId,
          actorId: session.actorId,
          eventType: objection.eventType,
          purpose: objection.purpose,
          legalBasisId: objection.legalBasisId,
          requestId: objection.requestId,
          // Die Begründung (optional) reist in der payload — der Server interpretiert sie nicht.
          payload: {
            art,
            summary: objection.summary,
            // Der Fristablauf wird MITAUDITIERT (die Behörde sieht ihn im Verlauf), aber nur als Flag.
            ...(verfristet !== null ? { verfristet } : {}),
            ...(fristAblaufIso !== undefined ? { fristAblaufIso } : {}),
            ...(request.body.begruendung !== undefined
              ? { begruendung: request.body.begruendung }
              : {}),
          },
          occurredAt: objection.occurredAt,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({
        aktenzeichen: found.caseId,
        art,
        eingelegtAm: objection.occurredAt,
        verfristet,
        ...(fristAblaufIso !== undefined ? { fristAblaufIso } : {}),
      });
    },
  );

  // ── RÜCKFORDERUNG: ZAHLUNGSEINGANG VERBUCHEN (Issue #62, ADR-0007) ───────────────────────────────
  // Die Bürger:in bestätigt eine abgeschlossene Zahlung auf die EIGENE Rückforderung. Der Server VERIFIZIERT
  // die Zahlung über den PaymentPort (Status/Betrag serverseitig, NIE aus dem Body) und verbucht sie append-only
  // als `forderung.zahlung.eingegangen`. IDEMPOTENT über die `paymentId` (kein Doppel-Buchen bei erneutem
  // Bestätigen). Der offene Restbetrag bleibt eine reine Ableitung (forderungsstandAusAudit).
  const ZahlungRequestSchema = Type.Object(
    { paymentId: Type.String({ minLength: 1 }) },
    { additionalProperties: false },
  );
  const ForderungsstandDtoSchema = Type.Object(
    {
      status: Type.String(),
      sollCent: Type.Integer(),
      gezahltCent: Type.Integer(),
      offenCent: Type.Integer(),
      faelligIso: Type.Optional(Type.String()),
      mahnstufe: Type.Integer(),
    },
    { additionalProperties: false },
  );
  typed.post(
    "/api/buerger/antraege/:id/rueckforderung/zahlung",
    {
      config: submitAuth.config,
      preHandler: submitAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary:
          "Eine abgeschlossene Zahlung auf die eigene Rückforderung verbuchen",
        params: AntragIdParamsSchema,
        body: ZahlungRequestSchema,
        response: {
          200: ForderungsstandDtoSchema,
          409: ErrorEnvelopeSchema,
          502: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      // Zahlung SERVER-VERIFIZIEREN: Status + Betrag kommen aus dem PaymentPort, nie aus dem Body.
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "citizen" },
        purpose: "payment",
      };
      const status = await deps.payment.getPaymentStatus(
        context,
        request.body.paymentId,
      );
      if (!status.ok)
        return reply.code(502).send({
          error: "payment status unavailable",
          requestId: requestIdOf(request),
        });
      if (status.value.status !== "completed")
        return reply.code(409).send({
          error: `payment not completed (${status.value.status})`,
          requestId: requestIdOf(request),
        });

      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }

      // IDEMPOTENZ: diese paymentId schon verbucht? → aktuellen Stand zurückgeben, nicht doppelt buchen.
      const schonVerbucht = events.some(
        (e) =>
          e.eventType === FORDERUNG_ZAHLUNG_EINGEGANGEN &&
          e.payload["paymentId"] === request.body.paymentId,
      );
      if (!schonVerbucht) {
        const zahlung = createFachlicheAuditEvent({
          eventType: FORDERUNG_ZAHLUNG_EINGEGANGEN,
          actorId: session.actorId,
          actingAuthorityId: found.authorityId,
          purpose: "zahlung",
          legalBasisId: "§ 49a VwVfG",
          caseId: found.caseId,
          requestId: requestIdOf(request),
          summary: `Zahlungseingang auf die Rückforderung ${found.caseId} verbucht`,
        });
        try {
          await deps.caseStore.appendAuditEvent({
            auditEventId: zahlung.auditEventId,
            caseId: found.caseId,
            tenantId: session.tenantId,
            authorityId: found.authorityId,
            jurisdictionId: found.jurisdictionId,
            actorId: session.actorId,
            eventType: FORDERUNG_ZAHLUNG_EINGEGANGEN,
            purpose: zahlung.purpose,
            legalBasisId: zahlung.legalBasisId,
            requestId: zahlung.requestId,
            // Betrag SERVER-VERIFIZIERT (aus dem PaymentPort), paymentId für die Idempotenz.
            payload: {
              betragCent: status.value.amountMinor,
              paymentId: request.body.paymentId,
            },
            occurredAt: zahlung.occurredAt,
          });
        } catch {
          return storeUnavailable(request, reply);
        }
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      }
      return reply.send(forderungsstandAusAudit(events));
    },
  );

  // ── NACHWEIS-UPLOAD (Byte-Transfer über den BlobStoragePort) ────────────────────────────────────
  // Der Inhalt reist base64-kodiert; der Server dekodiert, legt die Bytes über den (austauschbaren)
  // BlobStoragePort ab (Größe + SHA-256 SERVER-berechnet) und hält die Referenz append-only im Fall-Audit
  // (`nachweis.uploaded`) fest — die einzige Zuordnung Anlage↔Antrag. Owner-scoped: nur der eigene Antrag.
  typed.post(
    "/api/buerger/antraege/:id/nachweise",
    {
      config: submitAuth.config,
      preHandler: submitAuth.preHandler,
      // ~10 MB Datei als base64 (Fastifys 1-MB-Default würde einen echten Nachweis ablehnen).
      bodyLimit: 14_000_000,
      schema: {
        tags: ["buerger"],
        summary: "Einen Nachweis zum eigenen Antrag hochladen",
        params: AntragIdParamsSchema,
        body: NachweisUploadRequestSchema,
        response: { 201: NachweisRefDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      const bytes = new Uint8Array(
        Buffer.from(request.body.contentBase64, "base64"),
      );

      // ── DER TÜRSTEHER: die Anlage wird geprüft, BEVOR sie irgendwohin gelangt ────────────────────
      // Reihenfolge ist die Sicherheitsaussage: erst prüfen, DANN speichern. Vorher landeten die Bytes
      // ungeprüft im Storage — eine als PDF deklarierte HTML-Datei war hochladbar UND als Datei
      // zurückholbar (gespeicherter Inhalts-Vektor). Kein Agent, kein Renderer und kein Mensch sieht
      // eine Datei, die diese Prüfung nicht bestanden hat.
      const procedure = deps.procedureRegistry.get(
        found.procedureId,
        found.procedureVersion,
      );
      const anlagenRegeln = anlagenRegelnVon(procedure);
      let bisherigeAnlagen: AppAuditEvent[];
      try {
        bisherigeAnlagen = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const anzahlVorher = bisherigeAnlagen.filter(
        (e) => e.eventType === NACHWEIS_EVENT_TYPE,
      ).length;

      // MISSBRAUCHS-DROSSEL auch hier: gezählt werden die bereits hochgeladenen Anlagen im Fenster
      // (store-gestützt, dieselbe Wahrheit für alle Instanzen).
      const uploadDrossel = pruefeDrossel(
        bisherigeAnlagen
          .filter((e) => e.eventType === NACHWEIS_EVENT_TYPE)
          .map((e) => e.occurredAt),
        drosselRegelnAus(procedure?.drossel),
        new Date().toISOString(),
      );
      if (!uploadDrossel.erlaubt) {
        void reply.header(
          "retry-after",
          String(uploadDrossel.retryAfterSekunden),
        );
        return reply.code(429).send({
          error:
            "Es wurden in kurzer Zeit sehr viele Dateien hochgeladen. Bitte versuchen Sie es später erneut.",
          requestId: requestIdOf(request),
        });
      }

      const pruefung = pruefeAnlage(
        {
          fileName: request.body.fileName,
          mimeType: request.body.mimeType,
          bytes,
          bereitsVorhanden: anzahlVorher,
        },
        anlagenRegeln,
      );
      if (!pruefung.ok) {
        const antwort = anlagenAblehnungAntwort(
          pruefung.ablehnung,
          anlagenRegeln,
        );
        return reply
          .code(antwort.status)
          .send({ error: antwort.text, requestId: requestIdOf(request) });
      }

      const put = await deps.blobStorage.put(
        {
          requestId: requestIdOf(request),
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          actor: { actorId: session.actorId, actorType: "citizen" },
          purpose: "nachweis-upload",
        },
        {
          // Der BEREINIGTE Name und der NORMALISIERTE Typ gehen ins Storage — nicht die Roh-Deklaration.
          fileName: pruefung.fileName,
          mimeType: pruefung.mimeType,
          bytes,
        },
      );
      if (!put.ok) {
        // SICHT-INVARIANTE: die Adapter-Meldung bleibt im Log. Nach aussen nur ein fachlicher Satz —
        // eine durchgereichte Storage-Fehlermeldung verriet Bucket-/Pfad-/Anbieter-Interna.
        request.log.error(
          { caseId: found.caseId, grund: put.error.message },
          "nachweis-upload: blob storage nicht verfügbar",
        );
        return reply.code(503).send({
          error:
            "Die Datei konnte gerade nicht gespeichert werden. Bitte versuchen Sie es in Kürze erneut.",
          requestId: requestIdOf(request),
        });
      }
      const ref = put.value;

      const legalBasisId = procedure?.legalBasisIds[0] ?? "§ 26 VwVfG";
      const event = createFachlicheAuditEvent({
        eventType: NACHWEIS_EVENT_TYPE,
        actorId: session.actorId,
        actingAuthorityId: found.authorityId,
        purpose: "nachweis",
        legalBasisId,
        caseId: found.caseId,
        requestId: requestIdOf(request),
        summary: `Nachweis „${ref.fileName}" zu ${found.caseId} hochgeladen`,
      });
      try {
        await deps.caseStore.appendAuditEvent({
          auditEventId: event.auditEventId,
          caseId: found.caseId,
          tenantId: session.tenantId,
          authorityId: found.authorityId,
          jurisdictionId: found.jurisdictionId,
          actorId: session.actorId,
          eventType: event.eventType,
          purpose: event.purpose,
          legalBasisId: event.legalBasisId,
          requestId: requestIdOf(request),
          payload: {
            attachmentId: ref.attachmentId,
            fileName: ref.fileName,
            mimeType: ref.mimeType,
            sizeBytes: ref.sizeBytes,
            checksumSha256: ref.checksumSha256,
            summary: event.summary,
            // TAINT: eine Anlage kommt von aussen — sie taintet den Vorgang genau wie der Antragstext.
            [HERKUNFT_PAYLOAD_KEY]: HERKUNFT_EXTERN,
            [HITL_PFLICHT_PAYLOAD_KEY]: true,
          },
          occurredAt: event.occurredAt,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.code(201).send({
        attachmentId: ref.attachmentId,
        fileName: ref.fileName,
        mimeType: ref.mimeType,
        sizeBytes: ref.sizeBytes,
        checksumSha256: ref.checksumSha256,
        hochgeladenAm: event.occurredAt,
      });
    },
  );

  typed.get(
    "/api/buerger/antraege/:id/nachweise",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Die eigenen Nachweise eines Antrags auflisten (Metadaten)",
        params: AntragIdParamsSchema,
        response: { 200: NachweisListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const nachweise = events
        .filter((e) => e.eventType === NACHWEIS_EVENT_TYPE)
        .map(nachweisRefOf)
        .filter((r): r is NachweisRefDto => r !== undefined);
      return reply.send({ nachweise });
    },
  );

  typed.get(
    "/api/buerger/antraege/:id/nachweise/:attachmentId",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Einen eigenen Nachweis herunterladen (base64)",
        params: NachweisIdParamsSchema,
        response: { 200: NachweisDownloadDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Die Anlage MUSS zu diesem Antrag gehören (im append-only Audit belegt) — sonst 404 (kein
      // Cross-Case-Zugriff über eine fremde attachmentId).
      const ref = events
        .filter((e) => e.eventType === NACHWEIS_EVENT_TYPE)
        .map(nachweisRefOf)
        .find((r) => r?.attachmentId === request.params.attachmentId);
      if (!ref)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      const got = await deps.blobStorage.get(
        {
          requestId: requestIdOf(request),
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          actor: { actorId: session.actorId, actorType: "citizen" },
          purpose: "nachweis-download",
        },
        request.params.attachmentId,
      );
      if (!got.ok)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      // AUSLIEFERUNGS-TYP SERVER-BESTIMMT: nur ein Typ aus der Allowlist wird als solcher zurückgegeben,
      // alles andere fällt auf application/octet-stream. Der Client baute daraus früher einen
      // `data:`-Link mit dem Typ, den der EINREICHENDE deklariert hatte — damit war eine als
      // `text/html` eingereichte Datei im Browser-Kontext der Anwendung ausführbar.
      const auslieferung = auslieferungsMimeTyp(
        ref.mimeType,
        anlagenRegelnVon(
          deps.procedureRegistry.get(found.procedureId, found.procedureVersion),
        ),
      );
      void reply.header("x-content-type-options", "nosniff");
      void reply.header(
        "content-disposition",
        `attachment; filename="${ref.fileName.replace(/[^A-Za-z0-9._-]+/g, "_")}"`,
      );
      return reply.send({
        fileName: ref.fileName,
        mimeType: auslieferung,
        sizeBytes: got.value.ref.sizeBytes,
        checksumSha256: got.value.ref.checksumSha256,
        contentBase64: Buffer.from(got.value.bytes).toString("base64"),
      });
    },
  );
}
