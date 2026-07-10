import { describe, it, expect, beforeAll } from "vitest";
import {
  type AppAutomationEvent,
  type AppAutomationRule,
  type AppAutomationRun,
  type AutomationStore,
  AutomationRuleNotFoundError,
  InMemoryAutomationStore,
  PostgresAutomationStore,
} from "./automation-store.js";

const uid = () => globalThis.crypto.randomUUID();

function macheRegel(over: Partial<AppAutomationRule> = {}): AppAutomationRule {
  return {
    ruleId: `rule-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    procedureId: "leistung",
    triggerEvent: "beim-eingang",
    condition: null,
    actions: [{ art: "zuweisen", an: { rolle: "sachbearbeitung" } }],
    requiresFourEyes: false,
    active: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function macheEvent(
  over: Partial<AppAutomationEvent> = {},
): AppAutomationEvent {
  return {
    eventId: `evt-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    procedureId: "leistung",
    caseId: `case-${uid()}`,
    taskId: null,
    triggerEvent: "beim-eingang",
    payload: { grund: "test" },
    createdAt: "2026-06-01T00:00:00.000Z",
    processedAt: null,
    ...over,
  };
}

function macheRun(over: Partial<AppAutomationRun> = {}): AppAutomationRun {
  return {
    runId: `run-${uid()}`,
    ruleId: `rule-${uid()}`,
    eventId: `evt-${uid()}`,
    idempotencyKey: `${uid()}`,
    status: "applied",
    detail: {},
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: { name: string; make: () => AutomationStore; enabled: boolean }[] =
  [
    {
      name: "InMemoryAutomationStore",
      make: () => new InMemoryAutomationStore(),
      enabled: true,
    },
    {
      name: "PostgresAutomationStore",
      make: () => new PostgresAutomationStore(pgUrl!),
      enabled: Boolean(pgUrl),
    },
  ];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `AutomationStore contract — ${impl.name}`,
    () => {
      let store: AutomationStore;
      beforeAll(() => {
        store = impl.make();
      });

      it("legt Regeln an, filtert nach Trigger/aktiv und schaltet aktiv um", async () => {
        const tid = `t-${uid()}`;
        const eingang = macheRegel({
          tenantId: tid,
          triggerEvent: "beim-eingang",
        });
        const uebergang = macheRegel({
          tenantId: tid,
          triggerEvent: "beim-uebergang",
          active: false,
        });
        await store.insertRule(eingang);
        await store.insertRule(uebergang);

        const alle = await store.listRules({ tenantId: tid });
        expect(alle).toHaveLength(2);

        const nurEingang = await store.listRules({
          tenantId: tid,
          triggerEvent: "beim-eingang",
        });
        expect(nurEingang.map((r) => r.ruleId)).toEqual([eingang.ruleId]);

        const nurAktiv = await store.listRules({
          tenantId: tid,
          activeOnly: true,
        });
        expect(nurAktiv.map((r) => r.ruleId)).toEqual([eingang.ruleId]);

        const reaktiviert = await store.setRuleActive({
          tenantId: tid,
          ruleId: uebergang.ruleId,
          active: true,
        });
        expect(reaktiviert.active).toBe(true);
        expect(
          (await store.listRules({ tenantId: tid, activeOnly: true })).length,
        ).toBe(2);
      });

      it("wirft bei setRuleActive auf unbekannte Regel", async () => {
        await expect(
          store.setRuleActive({
            tenantId: "t1",
            ruleId: "gibt-es-nicht",
            active: false,
          }),
        ).rejects.toBeInstanceOf(AutomationRuleNotFoundError);
      });

      it("claimt fällige Events genau einmal (kein Re-Claim → kein Event-Sturm)", async () => {
        const tid = `t-${uid()}`;
        const e1 = macheEvent({
          tenantId: tid,
          createdAt: "2026-06-01T00:00:01.000Z",
        });
        const e2 = macheEvent({
          tenantId: tid,
          createdAt: "2026-06-01T00:00:02.000Z",
        });
        await store.enqueueEvent(e1);
        await store.enqueueEvent(e2);

        const claimed = await store.claimDueEvents({
          now: "2026-06-02T00:00:00.000Z",
          limit: 10,
        });
        const claimedIds = claimed.map((e) => e.eventId);
        expect(claimedIds).toContain(e1.eventId);
        expect(claimedIds).toContain(e2.eventId);

        // Zweiter Claim liefert diese Events NICHT erneut (bereits verarbeitet).
        const again = await store.claimDueEvents({
          now: "2026-06-02T00:01:00.000Z",
          limit: 10,
        });
        expect(again.map((e) => e.eventId)).not.toContain(e1.eventId);
        expect(again.map((e) => e.eventId)).not.toContain(e2.eventId);
      });

      it("claimDueEvents ist ZEIT-gegatet auf scheduled_for — ein zukünftiges Event wird erst ab Fälligkeit geclaimt", async () => {
        const tid = `t-${uid()}`;
        const geplant = macheEvent({
          tenantId: tid,
          triggerEvent: "frist-erreicht",
          scheduledFor: "2026-06-05T00:00:00.000Z",
        });
        await store.enqueueEvent(geplant);
        // Vor Fälligkeit: NICHT claimbar.
        const frueh = await store.claimDueEvents({
          now: "2026-06-04T23:59:00.000Z",
          limit: 50,
        });
        expect(frueh.map((e) => e.eventId)).not.toContain(geplant.eventId);
        // Ab Fälligkeit: claimbar.
        const spaet = await store.claimDueEvents({
          now: "2026-06-05T00:00:00.000Z",
          limit: 50,
        });
        expect(spaet.map((e) => e.eventId)).toContain(geplant.eventId);
      });

      it("enqueueEvent ist IDEMPOTENT auf der event_id — ein zweiter Scan derselben Frist reiht nichts nach", async () => {
        const tid = `t-${uid()}`;
        const ev = macheEvent({
          tenantId: tid,
          eventId: `frist::task-x::2026-06-01T00:00:00.000Z`,
        });
        await store.enqueueEvent(ev);
        // Erneutes Enqueue mit gleicher deterministischer Id (nächster Deadline-Tick) = No-op, kein PK-Fehler.
        await store.enqueueEvent({ ...ev, payload: { changed: true } });
        const claimed = await store.claimDueEvents({
          now: "2027-01-01T00:00:00.000Z",
          limit: 50,
        });
        expect(claimed.filter((e) => e.eventId === ev.eventId)).toHaveLength(1);
      });

      it("protokolliert Läufe idempotent (Doppel-Event/Schleife abgefangen)", async () => {
        const ruleId = `rule-${uid()}`;
        const key = `evt-x::${ruleId}`;
        const first = await store.recordRun(
          macheRun({ ruleId, idempotencyKey: key, status: "applied" }),
        );
        expect(first.recorded).toBe(true);
        // Gleicher (rule_id, idempotency_key) → NICHT erneut protokolliert.
        const second = await store.recordRun(
          macheRun({ ruleId, idempotencyKey: key, status: "applied" }),
        );
        expect(second.recorded).toBe(false);

        const runs = await store.listRuns({ ruleId });
        expect(runs).toHaveLength(1);
        expect(runs[0]?.status).toBe("applied");
      });
    },
  );
}
