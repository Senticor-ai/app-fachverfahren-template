// golden-fixture — deterministische, verfahrens-NEUTRALE MESH-Seed-Daten: Blackboard-Vermerke (Mensch +
// KI-Entwurf offen) auf dem Demo-Dossier + Verfahrens-Wissen (Mensch + KI offen). Ergaenzt den reference-seed
// (der Fall + Ziele/Schritte/Termine liefert) um die KOORDINATIONS-Ebene des Mesh, damit der VOLLE Fluss
// (lesen · pruefen · exportieren) OHNE finalen Build selbst getestet und von einer Agenten-CLI gefahren werden
// kann — die „Golden Fixture" ist die eine Wahrheit, die Selbsttest, DEV-Seed und CLI gemeinsam speist.
//
// REIN + DETERMINISTISCH: feste IDs/Zeitstempel, kein Date/Random -> byte-stabil. Inhalt NEUTRAL aus
// procedure.config (kein Verfahren eingebrannt). Alles SYNTHETISCH (keine echten Personen/PII). Der KI-Entwurf
// ist HANDGESCHRIEBEN (eine Seed ruft KEIN echtes Modell) mit festem synthetischem modelId — pruefpflichtig.
import type {
  AppAuditEvent,
  AppCase,
  CaseStore,
  VerfahrensWissenEintrag,
  WissenStore,
} from "@senticor/app-store-postgres";
import {
  DEFAULT_AUTHORITY_ID,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_TENANT_ID,
} from "../auth/bootstrap.js";
import { dossierDemo, dossierProcedure } from "../procedure.config.js";

const LEGAL_BASIS = dossierProcedure.legalBasisIds[0] ?? "muster-satzung-1";
/** Festes synthetisches Modell-Kennzeichen — eine Seed ruft KEIN echtes Modell (Determinismus). */
const KI_MODELL = "synthetik:golden-fixture";
const KI_METADATEN: Record<string, unknown> = {
  konfidenz: 0.5,
  quellen: ["golden-fixture"],
  rationale:
    "Synthetischer KI-Entwurf der Golden Fixture — menschlich zu pruefen (pruefpflichtig).",
};
/** Fester synthetischer Peer fuer menschliche Beitraege der Fixture. */
const MENSCH = "human:caseworker";
const SEED_ACTOR = "actor.dev-seed-opener";

function vermerk(
  auditEventId: string,
  occurredAt: string,
  payload: Record<string, unknown>,
): AppAuditEvent {
  return {
    auditEventId,
    caseId: dossierDemo.caseId,
    tenantId: DEFAULT_TENANT_ID,
    authorityId: DEFAULT_AUTHORITY_ID,
    jurisdictionId: DEFAULT_JURISDICTION_ID,
    actorId: SEED_ACTOR,
    eventType: "case.note.added",
    purpose: "aktenvermerk",
    legalBasisId: LEGAL_BASIS,
    requestId: "seed",
    payload,
    occurredAt,
  };
}

function wissen(
  eintragId: string,
  occurredAt: string,
  art: string,
  urheber: string,
  text: string,
  metadaten: Record<string, unknown>,
): VerfahrensWissenEintrag {
  return {
    eintragId,
    procedureId: dossierProcedure.procedureId,
    procedureVersion: dossierProcedure.version,
    tenantId: DEFAULT_TENANT_ID,
    authorityId: DEFAULT_AUTHORITY_ID,
    jurisdictionId: DEFAULT_JURISDICTION_ID,
    actorId: SEED_ACTOR,
    art,
    urheber,
    text,
    metadaten,
    occurredAt,
  };
}

export interface GoldenMeshFixture {
  /** Der Demo-Fall selbst (self-contained: die Fixture setzt keinen fremden Seed voraus). */
  demoCase: AppCase;
  /** Eroeffnungs-Audit des Demo-Falls (byte-identisch zum reference-seed — eine Wahrheit aus der Naht). */
  opened: AppAuditEvent;
  /** Blackboard-Vermerke auf dem Demo-Dossier (case.note.added). */
  vermerke: AppAuditEvent[];
  /** Verfahrens-Wissen (verfahrens-scoped). */
  wissen: VerfahrensWissenEintrag[];
}

/** Der Demo-Fall + sein Eroeffnungs-Audit, aus derselben Naht (procedure.config) wie der reference-seed
 *  abgeleitet — byte-identisch, damit beide Seeder EINE Wahrheit teilen (kein Verfahren eingebrannt). */
function buildGoldenCase(): { demoCase: AppCase; opened: AppAuditEvent } {
  const demoCase: AppCase = {
    caseId: dossierDemo.caseId,
    tenantId: DEFAULT_TENANT_ID,
    authorityId: DEFAULT_AUTHORITY_ID,
    jurisdictionId: DEFAULT_JURISDICTION_ID,
    procedureId: dossierProcedure.procedureId,
    procedureVersion: dossierProcedure.version,
    state: dossierDemo.initialState,
    version: 1,
    subjectIds: [dossierDemo.subjectId],
    openedAt: dossierDemo.openedAt,
    closedAt: null,
    ownerActorId: null,
    data: {},
  };
  const opened: AppAuditEvent = {
    auditEventId: "audit.demo-0001",
    caseId: dossierDemo.caseId,
    tenantId: DEFAULT_TENANT_ID,
    authorityId: DEFAULT_AUTHORITY_ID,
    jurisdictionId: DEFAULT_JURISDICTION_ID,
    actorId: SEED_ACTOR,
    eventType: "case.opened",
    purpose: "case-management",
    legalBasisId: LEGAL_BASIS,
    requestId: "seed",
    payload: { summary: dossierDemo.openedSummary },
    occurredAt: dossierDemo.openedAt,
  };
  return { demoCase, opened };
}

/** Die deterministische Golden-Mesh-Fixture: 2 Mensch-Vermerke + 1 KI-Entwurf (offen) auf dem Demo-Dossier,
 *  1 Mensch-Wissen + 1 KI-Wissen (offen) im Verfahrens-Wiki. REIN — baut nur Records, beruehrt keinen Store. */
export function buildGoldenMesh(): GoldenMeshFixture {
  const { demoCase, opened } = buildGoldenCase();
  return {
    demoCase,
    opened,
    vermerke: [
      vermerk("audit.golden-vermerk-1", "2026-06-01T09:00:00.000Z", {
        text: "Sachstand geprueft — die vorgelegten Unterlagen sind vollstaendig.",
        kind: "befund",
        quelle: "mensch",
        sichtbarkeit: "public",
        urheber: MENSCH,
        reviewStatus: "nicht-erforderlich",
        metadaten: { tags: ["sachstand"] },
        summary: "Befund: Unterlagen vollstaendig",
      }),
      vermerk("audit.golden-vermerk-2", "2026-06-01T09:05:00.000Z", {
        text: "Rueckfrage: ist die Zustaendigkeit abschliessend geklaert?",
        kind: "frage",
        quelle: "mensch",
        sichtbarkeit: "public",
        urheber: MENSCH,
        reviewStatus: "nicht-erforderlich",
        metadaten: {},
        summary: "Frage zur Zustaendigkeit",
      }),
      vermerk("audit.golden-vermerk-ki", "2026-06-01T09:10:00.000Z", {
        text: "Vorschlag: als naechster Schritt bietet sich die abschliessende Pruefung an.",
        kind: "teilergebnis",
        quelle: "ki",
        sichtbarkeit: "public",
        urheber: KI_MODELL,
        modelId: KI_MODELL,
        reviewStatus: "offen",
        metadaten: KI_METADATEN,
        summary: "KI-Entwurf: naechster Schritt",
      }),
    ],
    wissen: [
      wissen(
        "wissen.golden-1",
        "2026-06-01T09:20:00.000Z",
        "wissen",
        MENSCH,
        "Auslegungshilfe: die Frist beginnt mit der Bekanntgabe.",
        { norm: LEGAL_BASIS, tags: ["frist"] },
      ),
      wissen(
        "wissen.golden-ki",
        "2026-06-01T09:25:00.000Z",
        "teilergebnis",
        KI_MODELL,
        "Zusammenfassung der typischen Bearbeitungsschritte dieses Verfahrens.",
        KI_METADATEN,
      ),
    ],
  };
}

export interface GoldenMeshSeedDeps {
  caseStore: CaseStore;
  wissenStore: WissenStore;
  log?: (
    level: "info" | "error",
    event: string,
    fields: Record<string, unknown>,
  ) => void;
}

/** Idempotenter Seed der Golden-Mesh-Fixture in caseStore (Vermerke) + wissenStore (Verfahrens-Wissen). Setzt
 *  das Demo-Dossier voraus (reference-seed liefert den Fall). Wirft NIE — Fehler landen im Log. */
export async function seedGoldenMesh(deps: GoldenMeshSeedDeps): Promise<void> {
  const log = deps.log ?? (() => undefined);
  const fixture = buildGoldenMesh();
  try {
    // Den Demo-Fall idempotent sicherstellen (self-contained). Existiert er schon (z. B. via reference-seed),
    // bleibt alles unberuehrt — Fall + Eroeffnungs-Audit sind byte-identisch (dieselbe Naht).
    const already = await deps.caseStore.getCase({
      tenantId: DEFAULT_TENANT_ID,
      caseId: dossierDemo.caseId,
      scope: "authority",
      authorityId: DEFAULT_AUTHORITY_ID,
    });
    if (!already) {
      await deps.caseStore.insertCase(fixture.demoCase);
      await deps.caseStore.appendAuditEvent(fixture.opened);
    }
    const vorhandene = await deps.caseStore.listAuditEvents({
      tenantId: DEFAULT_TENANT_ID,
      caseId: dossierDemo.caseId,
    });
    const schonDa = new Set(vorhandene.map((e) => e.auditEventId));
    for (const v of fixture.vermerke) {
      if (!schonDa.has(v.auditEventId)) await deps.caseStore.appendAuditEvent(v);
    }
    log("info", "dev.golden-mesh.vermerke.seeded", {
      caseId: dossierDemo.caseId,
      anzahl: fixture.vermerke.length,
    });
  } catch (error) {
    log("error", "dev.golden-mesh.vermerke.failed", { error: String(error) });
  }
  try {
    const vorhandenesWissen = await deps.wissenStore.listEintraege({
      tenantId: DEFAULT_TENANT_ID,
      authorityId: DEFAULT_AUTHORITY_ID,
      procedureId: dossierProcedure.procedureId,
      procedureVersion: dossierProcedure.version,
    });
    const schonDa = new Set(vorhandenesWissen.map((e) => e.eintragId));
    for (const w of fixture.wissen) {
      if (!schonDa.has(w.eintragId)) await deps.wissenStore.appendEintrag(w);
    }
    log("info", "dev.golden-mesh.wissen.seeded", {
      procedureId: dossierProcedure.procedureId,
      anzahl: fixture.wissen.length,
    });
  } catch (error) {
    log("error", "dev.golden-mesh.wissen.failed", { error: String(error) });
  }
}
