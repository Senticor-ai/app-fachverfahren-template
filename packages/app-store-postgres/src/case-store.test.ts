import { beforeAll, describe, expect, it } from "vitest";
import {
  type AppAuditEvent,
  type AppCase,
  type CaseStore,
  CaseNotFoundError,
  CaseVersionConflictError,
  InMemoryCaseStore,
  PostgresCaseStore,
} from "./case-store.js";

// Parametrisierte Vertrags-Tests: identisch gegen den In-Memory-Store (immer) UND — wenn eine Datenbank
// konfiguriert ist (APP_PG_DIRECT_URL/APP_PG_URL, Migrationen vorher ausgeführt) — gegen den Postgres-Store.
// So verhält sich die PROD-Standalone-Laufzeit nachweislich wie die Test-Laufzeit.
const uid = () => globalThis.crypto.randomUUID();

function macheCase(over: Partial<AppCase> = {}): AppCase {
  return {
    caseId: `case-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "integrationsberatung",
    procedureVersion: "1",
    state: "aufgenommen",
    version: 1,
    subjectIds: ["subj-1"],
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: null,
    ...over,
  };
}

function macheAudit(
  caseId: string,
  over: Partial<AppAuditEvent> = {},
): AppAuditEvent {
  return {
    auditEventId: `audit-${uid()}`,
    caseId,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    actorId: "sb.a",
    eventType: "case.transitioned",
    purpose: "case-management",
    legalBasisId: "VwV-IGM-2023",
    requestId: `req-${uid()}`,
    payload: { summary: "Test" },
    occurredAt: "2026-06-02T00:00:00.000Z",
    ...over,
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: { name: string; make: () => CaseStore; enabled: boolean }[] = [
  {
    name: "InMemoryCaseStore",
    make: () => new InMemoryCaseStore(),
    enabled: true,
  },
  {
    name: "PostgresCaseStore",
    make: () => new PostgresCaseStore(pgUrl!),
    enabled: Boolean(pgUrl),
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(`CaseStore contract — ${impl.name}`, () => {
    let store: CaseStore;
    beforeAll(() => {
      store = impl.make();
    });

    it("legt einen Fall an und liest ihn zurück (mandanten-scoped)", async () => {
      const c = macheCase();
      await store.insertCase(c);
      const gelesen = await store.getCase({ tenantId: "t1", caseId: c.caseId });
      expect(gelesen?.caseId).toBe(c.caseId);
      expect(gelesen?.subjectIds).toEqual(["subj-1"]);
      expect(gelesen?.state).toBe("aufgenommen");
      // Fremder Mandant sieht den Fall NICHT.
      expect(
        await store.getCase({ tenantId: "fremd", caseId: c.caseId }),
      ).toBeUndefined();
    });

    it("listCases filtert nach Mandant/Behörde/Status/Verfahren, opened_at DESC", async () => {
      const tenantId = `t-list-${uid()}`;
      const scope = { tenantId, authorityId: "b1" };
      await store.insertCase(
        macheCase({
          tenantId,
          openedAt: "2026-01-01T00:00:00.000Z",
          state: "aufgenommen",
        }),
      );
      const spaeter = macheCase({
        tenantId,
        openedAt: "2026-03-01T00:00:00.000Z",
        state: "aktiv",
      });
      await store.insertCase(spaeter);
      const alle = await store.listCases(scope);
      expect(alle.map((c) => c.state)).toEqual(["aktiv", "aufgenommen"]); // DESC
      const nurAktiv = await store.listCases({ ...scope, state: "aktiv" });
      expect(nurAktiv.map((c) => c.caseId)).toEqual([spaeter.caseId]);
    });

    it("patchCaseState: Zustandswechsel + Audit ATOMAR, Version+1; Optimistic-Locking + Not-Found werfen", async () => {
      const c = macheCase({ tenantId: `t-patch-${uid()}` });
      await store.insertCase(c);
      const scope = { tenantId: c.tenantId, caseId: c.caseId };

      const nach = await store.patchCaseState({
        ...scope,
        expectedVersion: 1,
        newState: "aktiv",
        auditEvent: macheAudit(c.caseId, {
          tenantId: c.tenantId,
          eventType: "case.transitioned",
          payload: {
            previousState: "aufgenommen",
            newState: "aktiv",
            summary: "aktiviert",
          },
        }),
      });
      expect(nach.state).toBe("aktiv");
      expect(nach.version).toBe(2);
      // Audit landete append-only im Protokoll.
      const audit = await store.listAuditEvents(scope);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.eventType).toBe("case.transitioned");
      expect(audit[0]?.payload["newState"]).toBe("aktiv");

      // Veraltete expectedVersion → Konflikt, kein zweites Audit.
      await expect(
        store.patchCaseState({
          ...scope,
          expectedVersion: 1,
          newState: "abgeschlossen",
          auditEvent: macheAudit(c.caseId, { tenantId: c.tenantId }),
        }),
      ).rejects.toBeInstanceOf(CaseVersionConflictError);
      expect((await store.listAuditEvents(scope)).length).toBe(1);

      // Abschluss setzt closedAt.
      const zu = await store.patchCaseState({
        ...scope,
        expectedVersion: 2,
        newState: "abgeschlossen",
        closedAt: "2026-07-01T00:00:00.000Z",
        auditEvent: macheAudit(c.caseId, { tenantId: c.tenantId }),
      });
      expect(zu.closedAt).toBe("2026-07-01T00:00:00.000Z");

      // Unbekannter Fall → NotFound.
      await expect(
        store.patchCaseState({
          tenantId: c.tenantId,
          caseId: "gibt-es-nicht",
          expectedVersion: 1,
          newState: "aktiv",
          auditEvent: macheAudit("gibt-es-nicht", { tenantId: c.tenantId }),
        }),
      ).rejects.toBeInstanceOf(CaseNotFoundError);
    });

    it("Audit ist append-only + fallscoped + in Reihenfolge (occurred_at ASC)", async () => {
      const tenantId = `t-audit-${uid()}`;
      const caseId = `case-${uid()}`;
      await store.appendAuditEvent(
        macheAudit(caseId, {
          tenantId,
          occurredAt: "2026-06-03T00:00:00.000Z",
          eventType: "b",
        }),
      );
      await store.appendAuditEvent(
        macheAudit(caseId, {
          tenantId,
          occurredAt: "2026-06-01T00:00:00.000Z",
          eventType: "a",
        }),
      );
      const liste = await store.listAuditEvents({ tenantId, caseId });
      expect(liste.map((e) => e.eventType)).toEqual(["a", "b"]);
      // Fremder Mandant sieht das Protokoll NICHT.
      expect(
        (await store.listAuditEvents({ tenantId: "fremd", caseId })).length,
      ).toBe(0);
    });
  });
}
