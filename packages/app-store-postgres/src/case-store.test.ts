import { describe, it, expect, beforeAll } from "vitest";
import {
  type AppAuditEvent,
  type AppCase,
  type CaseStore,
  CaseVersionConflictError,
  InMemoryCaseStore,
  PostgresCaseStore,
} from "./case-store.js";
import { createPgClient } from "./client.js";

// Parametrisierte Vertrags-Tests: identisch gegen den In-Memory-Store (immer) UND — wenn eine Datenbank
// konfiguriert ist (APP_PG_URL/APP_PG_DIRECT_URL, Migrationen vorher ausgeführt) — gegen den Postgres-Store.
// So verhält sich die PROD-Laufzeit nachweislich wie die Test-Laufzeit (keine Divergenz).

let seq = 0;
const uid = () => globalThis.crypto.randomUUID();
function macheCase(over: Partial<AppCase> = {}): AppCase {
  seq += 1;
  return {
    caseId: `case-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "leistung",
    procedureVersion: "1",
    state: "eingegangen",
    version: 1,
    subjectIds: ["subj-1"],
    openedAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    ...over,
  };
}

function macheAudit(
  caseId: string,
  actorId: string,
  over: Partial<AppAuditEvent> = {},
): AppAuditEvent {
  seq += 1;
  return {
    auditEventId: `audit-${uid()}`,
    caseId,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    actorId,
    eventType: "case.transitioned",
    purpose: "decision",
    legalBasisId: "§1",
    requestId: `req-${seq}`,
    payload: { note: "test" },
    occurredAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const pgUrl = process.env["APP_PG_URL"] ?? process.env["APP_PG_DIRECT_URL"];

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
      const gelesen = await store.getCase({
        tenantId: c.tenantId,
        caseId: c.caseId,
      });
      expect(gelesen?.caseId).toBe(c.caseId);
      expect(gelesen?.subjectIds).toEqual(["subj-1"]);
      // Fremder Mandant sieht den Fall NICHT.
      expect(
        await store.getCase({ tenantId: "fremd", caseId: c.caseId }),
      ).toBeUndefined();
    });

    it("transitionCase: Statuswechsel + Audit-Append atomar, Version steigt", async () => {
      const c = macheCase();
      await store.insertCase(c);
      const updated = await store.transitionCase({
        tenantId: c.tenantId,
        caseId: c.caseId,
        expectedVersion: 1,
        toState: "geprueft",
        auditEvent: macheAudit(c.caseId, "sb.mueller"),
      });
      expect(updated.state).toBe("geprueft");
      expect(updated.version).toBe(2);
      const audit = await store.listAuditEvents({
        tenantId: c.tenantId,
        caseId: c.caseId,
      });
      expect(audit.length).toBe(1);
      expect(audit[0]!.actorId).toBe("sb.mueller");
    });

    it("transitionCase wirft bei veralteter Version (Optimistic Locking → 409)", async () => {
      const c = macheCase();
      await store.insertCase(c);
      await store.transitionCase({
        tenantId: c.tenantId,
        caseId: c.caseId,
        expectedVersion: 1,
        toState: "geprueft",
        auditEvent: macheAudit(c.caseId, "sb.a"),
      });
      await expect(
        store.transitionCase({
          tenantId: c.tenantId,
          caseId: c.caseId,
          expectedVersion: 1, // veraltet
          toState: "abgelehnt",
          auditEvent: macheAudit(c.caseId, "sb.b"),
        }),
      ).rejects.toBeInstanceOf(CaseVersionConflictError);
    });

    it("listCases filtert nach Mandant/Behörde/Status", async () => {
      const c1 = macheCase({ state: "eingegangen" });
      const c2 = macheCase({ state: "geprueft" });
      await store.insertCase(c1);
      await store.insertCase(c2);
      const eingegangen = await store.listCases({
        tenantId: "t1",
        authorityId: "b1",
        state: "eingegangen",
      });
      expect(eingegangen.some((c) => c.caseId === c1.caseId)).toBe(true);
      expect(eingegangen.some((c) => c.caseId === c2.caseId)).toBe(false);
    });

    it("Audit ist append-only: mehrere Übergänge akkumulieren in Reihenfolge", async () => {
      const c = macheCase();
      await store.insertCase(c);
      await store.transitionCase({
        tenantId: c.tenantId,
        caseId: c.caseId,
        expectedVersion: 1,
        toState: "vorgelegt",
        auditEvent: macheAudit(c.caseId, "sb.a", {
          eventType: "case.prepared",
        }),
      });
      await store.transitionCase({
        tenantId: c.tenantId,
        caseId: c.caseId,
        expectedVersion: 2,
        toState: "festgesetzt",
        auditEvent: macheAudit(c.caseId, "sb.b", { eventType: "case.decided" }),
      });
      const audit = await store.listAuditEvents({
        tenantId: c.tenantId,
        caseId: c.caseId,
      });
      expect(audit.map((e) => e.eventType)).toEqual([
        "case.prepared",
        "case.decided",
      ]);
    });
  });
}

// Postgres-spezifisch: die STRUKTURELLE Append-Only-Garantie (Migration `audit_append_only`: REVOKE + Trigger).
describe.skipIf(!pgUrl)(
  "app_audit_events — append-only (Trigger, Postgres)",
  () => {
    it("verweigert UPDATE und DELETE auf einem Audit-Event (Revisionssicherheit)", async () => {
      const client = await createPgClient(pgUrl!);
      await client.connect();
      try {
        const id = `a-immut-${uid()}`;
        await client.query(
          `INSERT INTO app_audit_events (audit_event_id, case_id, tenant_id, authority_id,
           jurisdiction_id, actor_id, event_type, purpose, legal_basis_id, request_id, payload)
         VALUES ($1,'c1','t1','b1','de','sb.a','case.decided','x','§1','r1','{}'::jsonb)`,
          [id],
        );
        await expect(
          client.query(
            `UPDATE app_audit_events SET actor_id = 'forger' WHERE audit_event_id = $1`,
            [id],
          ),
        ).rejects.toThrow(/append-only/);
        await expect(
          client.query(
            `DELETE FROM app_audit_events WHERE audit_event_id = $1`,
            [id],
          ),
        ).rejects.toThrow(/append-only/);
        const check = await client.query<{ actor_id: string }>(
          `SELECT actor_id FROM app_audit_events WHERE audit_event_id = $1`,
          [id],
        );
        expect(check.rows[0]?.actor_id).toBe("sb.a");
      } finally {
        await client.end();
      }
    });
  },
);

describe.skipIf(!pgUrl)("transitionCase — Outbox ist ATOMAR (Postgres)", () => {
  it("rollt den Statuswechsel zurück, wenn das Outbox-Event fehlschlägt (kein Event, keine Mutation)", async () => {
    const store = new PostgresCaseStore(pgUrl!);
    const c = macheCase({ state: "eingegangen", version: 1 });
    await store.insertCase(c);

    // Ein Event mit fester eventId vorbelegen → der zweite INSERT mit derselben eventId verletzt den PK.
    const dupId = `evt-dup-${uid()}`;
    const client = await createPgClient(pgUrl!);
    await client.connect();
    try {
      await client.query(
        `INSERT INTO app_automation_events
             (event_id, tenant_id, authority_id, procedure_id, case_id, task_id, trigger_event, payload, processed_at)
           VALUES ($1,'t1','b1','leistung',$2,NULL,'beim-uebergang','{}'::jsonb,NULL)`,
        [dupId, c.caseId],
      );
    } finally {
      await client.end();
    }

    // transitionCase mit einem Outbox-Event, dessen eventId kollidiert → muss WERFEN.
    await expect(
      store.transitionCase({
        tenantId: "t1",
        caseId: c.caseId,
        expectedVersion: 1,
        toState: "geprueft",
        auditEvent: macheAudit(c.caseId, "sb.a", {
          eventType: "case.geprueft",
        }),
        outboxEvent: {
          eventId: dupId, // Kollision!
          tenantId: "t1",
          authorityId: "b1",
          procedureId: "leistung",
          caseId: c.caseId,
          taskId: null,
          triggerEvent: "beim-uebergang",
          payload: { actor: "sb.a" },
          createdAt: "2026-06-01T00:00:00.000Z",
          processedAt: null,
        },
      }),
    ).rejects.toThrow();

    // Der Fall ist NICHT gewechselt (Version + Zustand unverändert → ROLLBACK deckte beides).
    const after = await store.getCase({ tenantId: "t1", caseId: c.caseId });
    expect(after?.state).toBe("eingegangen");
    expect(after?.version).toBe(1);
  });
});
