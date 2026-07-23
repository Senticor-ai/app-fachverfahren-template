// forderung-mahnung — zeitgetriebenes MAHNWESEN (Issue #62, ADR-0007) auf dem Fristen-Scanner-Muster (#58).
// Findet überfällige, offene Forderungen (Rückforderungs-Sollstellungen) je (Mandant, Behörde) und schreibt je
// Fall EIN append-only `forderung.gemahnt` mit einer NEUEN Mahnfrist. Die REINE Entscheidung liegt im SDK
// (`planeMahnung`: überfällig + offen + Mahnstufe unter der Obergrenze); dieser Motor ist die mandanten-scoped,
// IDEMPOTENTE Ausführung: weil die Mahnung die Frist verlängert, ist der Fall im nächsten Tick nicht sofort
// wieder mahnbar (kein Dauer-Mahnen — Analogon zum Überfällig-Marker in deadline-scan). Injizierte Zeit.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createCaseStoreFromEnv,
  type AppAuditEvent,
  type CaseStore,
} from "@senticor/app-store-postgres";
import {
  DEFAULT_MAX_MAHNSTUFE,
  forderungsstandAusAudit,
  planeMahnung,
} from "@senticor/public-sector-sdk";

/** Standard-Mahnfrist in Tagen (bis zur nächsten Mahnstufe). */
export const MAHNFRIST_TAGE_DEFAULT = 14;

/** Ein zu mahnender Mandant + seine Behörde (listCases ist authority-scoped). */
export interface MahnBetrieb {
  tenantId: string;
  authorityId: string;
}

/**
 * Testbarer Kern: mahnt die überfälligen, offenen Forderungen EINER (tenant, authority). Schreibt je Fall EIN
 * `forderung.gemahnt` mit neuer Mahnfrist + erhöhter Mahnstufe. Der Store stempelt die Hash-Kette (#53) selbst.
 */
export async function runForderungsMahnung(input: {
  caseStore: CaseStore;
  tenantId: string;
  authorityId: string;
  nowIso: string;
  systemActorId?: string;
  mahnfristTage?: number;
  maxMahnstufe?: number;
}): Promise<{ gemahnt: number }> {
  const cases = await input.caseStore.listCases({
    tenantId: input.tenantId,
    scope: "authority",
    authorityId: input.authorityId,
  });
  let gemahnt = 0;
  for (const c of cases) {
    const events = await input.caseStore.listAuditEvents({
      tenantId: input.tenantId,
      caseId: c.caseId,
    });
    const stand = forderungsstandAusAudit(events);
    if (
      !planeMahnung(
        stand,
        input.nowIso,
        input.maxMahnstufe ?? DEFAULT_MAX_MAHNSTUFE,
      )
    )
      continue;
    const neueFrist = new Date(
      Date.parse(input.nowIso) +
        (input.mahnfristTage ?? MAHNFRIST_TAGE_DEFAULT) * 86_400_000,
    ).toISOString();
    const event: AppAuditEvent = {
      auditEventId: `audit.${randomUUID()}`,
      caseId: c.caseId,
      tenantId: input.tenantId,
      authorityId: c.authorityId,
      jurisdictionId: c.jurisdictionId,
      actorId: input.systemActorId ?? "system.mahnwesen",
      eventType: "forderung.gemahnt",
      purpose: "mahnung",
      // Mahnung im Verwaltungsvollstreckungsrecht (Platzhalter-Norm für das neutrale Musterverfahren).
      legalBasisId: "§ 3 VwVG",
      requestId: `mahnung.${input.nowIso}`,
      payload: {
        art: "forderung.gemahnt",
        betragCent: stand.offenCent,
        faelligIso: neueFrist,
        mahnstufe: stand.mahnstufe + 1,
      },
      occurredAt: input.nowIso,
    };
    await input.caseStore.appendAuditEvent(event);
    gemahnt += 1;
  }
  return { gemahnt };
}

/** Fährt das Mahnwesen über mehrere Betriebe (tenant+authority). Betriebe sind isoliert; injizierte Zeit. */
export async function runForderungsMahnungForBetriebe(input: {
  caseStore: CaseStore;
  betriebe: readonly MahnBetrieb[];
  nowIso: string;
  systemActorId?: string;
  mahnfristTage?: number;
  maxMahnstufe?: number;
}): Promise<{ tenantId: string; authorityId: string; gemahnt: number }[]> {
  const results: {
    tenantId: string;
    authorityId: string;
    gemahnt: number;
  }[] = [];
  for (const b of input.betriebe) {
    const { gemahnt } = await runForderungsMahnung({
      caseStore: input.caseStore,
      tenantId: b.tenantId,
      authorityId: b.authorityId,
      nowIso: input.nowIso,
      ...(input.systemActorId ? { systemActorId: input.systemActorId } : {}),
      ...(input.mahnfristTage !== undefined
        ? { mahnfristTage: input.mahnfristTage }
        : {}),
      ...(input.maxMahnstufe !== undefined
        ? { maxMahnstufe: input.maxMahnstufe }
        : {}),
    });
    results.push({ tenantId: b.tenantId, authorityId: b.authorityId, gemahnt });
  }
  return results;
}

/** Betriebe aus `APP_MAHN_BETRIEBE` (kommagetrennt `tenantId:authorityId`). Ungesetzt/kaputt → []. */
export function betriebeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MahnBetrieb[] {
  return (env["APP_MAHN_BETRIEBE"] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pair) => {
      const [tenantId, authorityId] = pair.split(":");
      return tenantId && authorityId ? { tenantId, authorityId } : undefined;
    })
    .filter((b): b is MahnBetrieb => b !== undefined);
}

/** CLI-Einstieg (CronJob-Tick): env-verdrahtet, ein Lauf, strukturiertes JSON-Log. Ohne Betriebe ein No-op. */
export async function main(
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const betriebe = betriebeFromEnv(env);
  if (betriebe.length === 0) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "forderung-mahnung.no-betriebe",
        hint: "APP_MAHN_BETRIEBE (kommagetrennt tenantId:authorityId) setzen",
      }),
    );
    return 0;
  }
  const caseStore = createCaseStoreFromEnv(env);
  const perBetrieb = await runForderungsMahnungForBetriebe({
    caseStore,
    betriebe,
    nowIso: new Date().toISOString(),
  });
  console.error(
    JSON.stringify({
      level: "info",
      event: "forderung-mahnung.tick",
      gemahnt: perBetrieb.reduce((sum, b) => sum + b.gemahnt, 0),
      perBetrieb,
    }),
  );
  return 0;
}

// Direkt-Start (CronJob-Tick): fahren + Exit. Muster wie deadline-worker.ts.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          event: "forderung-mahnung.failed",
          error: String(error),
        }),
      );
      process.exit(1);
    });
}
