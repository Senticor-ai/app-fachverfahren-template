// forderung-mahnung.test — der Mahnwesen-Motor (#62) über den InMemoryCaseStore: mahnt überfällige offene
// Forderungen genau EINMAL pro Frist (idempotent, weil die Mahnung die Frist verlängert), respektiert
// authority-Scope, und lässt nicht-fällige / forderungsfreie Fälle in Ruhe.
import {
  InMemoryCaseStore,
  type AppAuditEvent,
  type AppCase,
} from "@senticor/app-store-postgres";
import { beforeEach, describe, expect, it } from "vitest";
import { betriebeFromEnv, runForderungsMahnung } from "./forderung-mahnung.js";

const TENANT = "t1";
const AUTHORITY = "b1";

function baseCase(caseId: string): AppCase {
  return {
    caseId,
    tenantId: TENANT,
    authorityId: AUTHORITY,
    jurisdictionId: "de",
    procedureId: "musterantrag",
    procedureVersion: "1",
    state: "rueckforderung_festgesetzt",
    version: 1,
    subjectIds: [],
    openedAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    ownerActorId: "buerger.1",
    data: {},
  };
}

function gestelltEvent(
  caseId: string,
  betragCent: number,
  faelligIso: string,
): AppAuditEvent {
  return {
    auditEventId: `audit.gestellt.${caseId}`,
    caseId,
    tenantId: TENANT,
    authorityId: AUTHORITY,
    jurisdictionId: "de",
    actorId: "sb.1",
    eventType: "forderung.gestellt",
    purpose: "rueckforderung",
    legalBasisId: "§ 49a VwVfG",
    requestId: "r1",
    payload: { betragCent, faelligIso },
    occurredAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("runForderungsMahnung", () => {
  let store: InMemoryCaseStore;
  beforeEach(async () => {
    store = new InMemoryCaseStore();
  });

  it("mahnt eine überfällige, offene Forderung — genau einmal pro Frist (idempotent)", async () => {
    await store.insertCase(baseCase("case.1"));
    await store.appendAuditEvent(
      gestelltEvent("case.1", 12000, "2026-02-01T00:00:00.000Z"),
    );

    const first = await runForderungsMahnung({
      caseStore: store,
      tenantId: TENANT,
      authorityId: AUTHORITY,
      nowIso: "2026-03-01T00:00:00.000Z", // nach Fälligkeit
    });
    expect(first.gemahnt).toBe(1);

    const events = await store.listAuditEvents({
      tenantId: TENANT,
      caseId: "case.1",
    });
    const gemahnt = events.find((e) => e.eventType === "forderung.gemahnt");
    expect(gemahnt?.payload["mahnstufe"]).toBe(1);
    expect(gemahnt?.payload["betragCent"]).toBe(12000);

    // Zweiter Lauf zur SELBEN Zeit: die Mahnung hat die Frist verlängert → nicht erneut mahnbar.
    const second = await runForderungsMahnung({
      caseStore: store,
      tenantId: TENANT,
      authorityId: AUTHORITY,
      nowIso: "2026-03-01T00:00:00.000Z",
    });
    expect(second.gemahnt).toBe(0);
  });

  it("mahnt NICHT vor Fälligkeit und NICHT ohne Forderung", async () => {
    await store.insertCase(baseCase("case.offen"));
    await store.appendAuditEvent(
      gestelltEvent("case.offen", 5000, "2026-05-01T00:00:00.000Z"),
    );
    await store.insertCase(baseCase("case.ohne")); // keine Forderung

    const res = await runForderungsMahnung({
      caseStore: store,
      tenantId: TENANT,
      authorityId: AUTHORITY,
      nowIso: "2026-03-01T00:00:00.000Z", // vor der Fälligkeit von case.offen
    });
    expect(res.gemahnt).toBe(0);
  });

  it("respektiert den authority-Scope (fremde Behörde wird nicht gemahnt)", async () => {
    const fremd: AppCase = { ...baseCase("case.fremd"), authorityId: "b2" };
    await store.insertCase(fremd);
    await store.appendAuditEvent({
      ...gestelltEvent("case.fremd", 9000, "2026-02-01T00:00:00.000Z"),
      authorityId: "b2",
    });
    const res = await runForderungsMahnung({
      caseStore: store,
      tenantId: TENANT,
      authorityId: AUTHORITY, // b1 — nicht b2
      nowIso: "2026-03-01T00:00:00.000Z",
    });
    expect(res.gemahnt).toBe(0);
  });
});

describe("betriebeFromEnv", () => {
  it("parst tenantId:authorityId-Paare; kaputte/leere werden verworfen", () => {
    expect(
      betriebeFromEnv({ APP_MAHN_BETRIEBE: "t1:b1, t2:b2 , kaputt, :x, y:" }),
    ).toEqual([
      { tenantId: "t1", authorityId: "b1" },
      { tenantId: "t2", authorityId: "b2" },
    ]);
    expect(betriebeFromEnv({})).toEqual([]);
  });
});
