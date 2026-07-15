import { describe, expect, it } from "vitest";
import { createPgClient } from "./client.js";
import { type AppAuditEvent, PostgresCaseStore } from "./case-store.js";

// Postgres-only-Vertrag: der DB-Riegel (BEFORE UPDATE OR DELETE-Trigger auf app_audit_events, Migration
// 20260715000000_audit_append_only) macht das Protokoll revisionssicher. Ohne konfigurierte, MIGRIERTE
// Datenbank uebersprungen (skipIf) — der In-Memory-Store hat keinen DB-Trigger. Erwartet: INSERT via
// CaseStore.appendAuditEvent gelingt, roher UPDATE/DELETE wirft (append-only).
const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const uid = () => globalThis.crypto.randomUUID();

function macheAudit(over: Partial<AppAuditEvent> = {}): AppAuditEvent {
  return {
    auditEventId: `audit-${uid()}`,
    caseId: `case-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    actorId: "sb.a",
    eventType: "case.transitioned",
    purpose: "case-management",
    legalBasisId: "VwV-IGM-2023",
    requestId: `req-${uid()}`,
    payload: { summary: "Muster" },
    occurredAt: "2026-06-02T00:00:00.000Z",
    ...over,
  };
}

describe.skipIf(!pgUrl)(
  "app_audit_events append-only-Riegel (DB-Trigger)",
  () => {
    it("INSERT gelingt, UPDATE und DELETE werfen (revisionssicher)", async () => {
      const store = new PostgresCaseStore(pgUrl!);
      const caseId = `case-${uid()}`;
      const event = macheAudit({ caseId });
      // INSERT via Store gelingt (append-only heisst: anhaengen erlaubt).
      await store.appendAuditEvent(event);
      const gelesen = await store.listAuditEvents({
        tenantId: event.tenantId,
        caseId,
      });
      expect(gelesen.map((e) => e.auditEventId)).toEqual([event.auditEventId]);

      // Roher UPDATE/DELETE (unter Umgehung des Stores) wird vom DB-Trigger geworfen.
      const client = await createPgClient(pgUrl!);
      await client.connect();
      try {
        await expect(
          client.query(
            "UPDATE app_audit_events SET event_type = $1 WHERE audit_event_id = $2",
            ["manipuliert", event.auditEventId],
          ),
        ).rejects.toThrow(/append-only/i);

        await expect(
          client.query(
            "DELETE FROM app_audit_events WHERE audit_event_id = $1",
            [event.auditEventId],
          ),
        ).rejects.toThrow(/append-only/i);

        // Das Ereignis ist unveraendert vorhanden — weder geaendert noch geloescht.
        const nachher = await client.query<{ event_type: string }>(
          "SELECT event_type FROM app_audit_events WHERE audit_event_id = $1",
          [event.auditEventId],
        );
        expect(nachher.rows).toHaveLength(1);
        expect(nachher.rows[0]?.event_type).toBe("case.transitioned");
      } finally {
        await client.end();
      }
    });
  },
);
