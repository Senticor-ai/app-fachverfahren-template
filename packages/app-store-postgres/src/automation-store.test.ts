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

      it("LEAST fällige Events und hält sie WÄHREND der Lease exklusiv (kein Doppel-Claim durch Nebenläufer)", async () => {
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
          visibilityMs: 60_000,
        });
        expect(claimed.map((e) => e.eventId).sort()).toEqual(
          [e1.eventId, e2.eventId].sort(),
        );
        // Erster Claim ⇒ attempts=1; das RETURNING/der In-Memory-Rückgabewert trägt den POST-Update-Stand.
        expect(claimed.every((e) => e.attempts === 1)).toBe(true);

        // Innerhalb des Lease-Fensters (30 s < 60 s) claimt sie kein zweiter Poller (noch „in Arbeit").
        const waehrendLease = await store.claimDueEvents({
          now: "2026-06-02T00:00:30.000Z",
          limit: 10,
        });
        const noch = waehrendLease.map((e) => e.eventId);
        expect(noch).not.toContain(e1.eventId);
        expect(noch).not.toContain(e2.eventId);
      });

      it("markProcessed schliesst terminal ab (kein Re-Claim); ein UNMARKIERTES Event wird nach Lease-Ablauf erneut aufgenommen (at-least-once)", async () => {
        const tid = `t-${uid()}`;
        const erledigt = macheEvent({
          tenantId: tid,
          createdAt: "2026-06-01T00:00:01.000Z",
        });
        const gecrasht = macheEvent({
          tenantId: tid,
          createdAt: "2026-06-01T00:00:02.000Z",
        });
        await store.enqueueEvent(erledigt);
        await store.enqueueEvent(gecrasht);

        const ersteRunde = await store.claimDueEvents({
          now: "2026-06-02T00:00:00.000Z",
          limit: 10,
          visibilityMs: 60_000,
        });
        expect(ersteRunde).toHaveLength(2);

        // Simulierter Consumer-Crash: nur EINES wird terminal markiert; das andere bleibt geleast (kein markProcessed).
        await store.markProcessed({
          eventId: erledigt.eventId,
          now: "2026-06-02T00:00:05.000Z",
        });

        // Nach Lease-Ablauf (>60 s): das markierte NICHT mehr, das unmarkierte WIRD erneut geclaimt (attempts=2).
        const zweiteRunde = await store.claimDueEvents({
          now: "2026-06-02T00:01:30.000Z",
          limit: 10,
          visibilityMs: 60_000,
        });
        const ids = zweiteRunde.map((e) => e.eventId);
        expect(ids).not.toContain(erledigt.eventId);
        expect(ids).toContain(gecrasht.eventId);
        expect(
          zweiteRunde.find((e) => e.eventId === gecrasht.eventId)?.attempts,
        ).toBe(2);

        // Auch das wiederaufgenommene Event terminal markieren → danach claimt niemand mehr etwas.
        await store.markProcessed({
          eventId: gecrasht.eventId,
          now: "2026-06-02T00:01:35.000Z",
        });
        const dritteRunde = await store.claimDueEvents({
          now: "2026-06-02T01:00:00.000Z",
          limit: 10,
        });
        expect(dritteRunde.map((e) => e.eventId)).not.toContain(
          erledigt.eventId,
        );
        expect(dritteRunde.map((e) => e.eventId)).not.toContain(
          gecrasht.eventId,
        );
      });

      it("markProcessed ist idempotent (zweiter Aufruf ändert nichts, kein Re-Claim)", async () => {
        const tid = `t-${uid()}`;
        const e = macheEvent({ tenantId: tid });
        await store.enqueueEvent(e);
        await store.claimDueEvents({
          now: "2026-06-02T00:00:00.000Z",
          limit: 10,
          visibilityMs: 1000,
        });
        await store.markProcessed({
          eventId: e.eventId,
          now: "2026-06-02T00:00:01.000Z",
        });
        await store.markProcessed({
          eventId: e.eventId,
          now: "2026-06-02T00:00:10.000Z",
        });
        // Weit nach Lease-Ablauf: bleibt terminal (kein Re-Claim).
        const spaeter = await store.claimDueEvents({
          now: "2026-06-02T00:05:00.000Z",
          limit: 10,
        });
        expect(spaeter.map((x) => x.eventId)).not.toContain(e.eventId);
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

// ── Adversariale Mandanten-Isolation (Skalierungsplan #2): kein Zugriff auf Regeln eines FREMDEN Mandanten. NB:
//    `claimDueEvents` ist BEWUSST mandanten-ÜBERGREIFEND (EIN Worker bedient alle Mandanten); die Isolation liegt
//    dort darin, dass die Engine die Regel-Suche mit `event.tenantId` scoped (Engine-Test), nicht im Claim. ──
for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `AutomationStore — Cross-Tenant-Isolation (adversarial) — ${impl.name}`,
    () => {
      let store: AutomationStore;
      beforeAll(() => {
        store = impl.make();
      });

      it("kein Lesen/Ändern fremder Mandanten-Regeln (get/list/setActive)", async () => {
        await store.insertRule(
          macheRegel({ tenantId: "t-a", ruleId: "x-rule-a" }),
        );
        await store.insertRule(
          macheRegel({ tenantId: "t-b", ruleId: "x-rule-b" }),
        );

        // getRule: t-a bekommt t-b's Regel NICHT.
        expect(
          await store.getRule({ tenantId: "t-a", ruleId: "x-rule-b" }),
        ).toBeUndefined();

        // listRules: t-a sieht AUSSCHLIESSLICH eigene Regeln.
        const listeA = await store.listRules({ tenantId: "t-a" });
        expect(listeA.map((r) => r.ruleId)).toContain("x-rule-a");
        expect(listeA.map((r) => r.ruleId)).not.toContain("x-rule-b");
        expect(listeA.every((r) => r.tenantId === "t-a")).toBe(true);

        // setRuleActive: t-a kann t-b's Regel NICHT umschalten (nicht gefunden → Wurf).
        await expect(
          store.setRuleActive({
            tenantId: "t-a",
            ruleId: "x-rule-b",
            active: false,
          }),
        ).rejects.toThrow();
        // t-b's Regel blieb aktiv (Default).
        expect(
          (await store.getRule({ tenantId: "t-b", ruleId: "x-rule-b" }))
            ?.active,
        ).toBe(true);
      });
    },
  );
}

// ── Domain-Event-Envelope (Skalierungsplan #16): das Outbox-Event trägt einen getypten Umschlag (event_type/version/
//    correlation/causation/occurred_at); additiv/nullbar. Round-Trip beweist INSERT + claim-RETURNING in beiden Impls. ──
for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `AutomationStore — Domain-Event-Envelope (#16) — ${impl.name}`,
    () => {
      let store: AutomationStore;
      beforeAll(() => {
        store = impl.make();
      });

      it("persistiert + liest die Envelope-Felder round-trip (enqueue → claim)", async () => {
        const ev = macheEvent({
          tenantId: `t-${uid()}`,
          eventType: "case.transitioned",
          eventVersion: 1,
          correlationId: "req-abc",
          causationId: null,
          occurredAt: "2026-06-01T00:00:00.000Z",
        });
        await store.enqueueEvent(ev);
        const claimed = await store.claimDueEvents({
          now: "2026-06-02T00:00:00.000Z",
          limit: 50,
        });
        const zurueck = claimed.find((e) => e.eventId === ev.eventId);
        expect(zurueck?.eventType).toBe("case.transitioned");
        expect(zurueck?.eventVersion).toBe(1);
        expect(zurueck?.correlationId).toBe("req-abc");
        expect(zurueck?.causationId).toBeNull();
        expect(zurueck?.occurredAt).toBe("2026-06-01T00:00:00.000Z");
      });

      it("Envelope ist OPTIONAL — ein Event ohne Umschlag claimt als NULL (rückwärtskompatibel, kein Wurf)", async () => {
        const ev = macheEvent({ tenantId: `t-${uid()}` });
        await store.enqueueEvent(ev);
        const claimed = await store.claimDueEvents({
          now: "2026-06-02T00:00:00.000Z",
          limit: 50,
        });
        const zurueck = claimed.find((e) => e.eventId === ev.eventId);
        expect(zurueck?.eventType ?? null).toBeNull();
        expect(zurueck?.correlationId ?? null).toBeNull();
        expect(zurueck?.occurredAt ?? null).toBeNull();
      });
    },
  );
}

// ── Multi-Consumer-Fan-out (Skalierungsplan #24): MEHRERE unabhängige Consumer bekommen JEDES getypte Event; je
//    Consumer eine Zustell-Buchhaltung (Lease/at-least-once/DLQ) — die Engine (processed_at) bleibt unberührt. ──
const T0 = "2026-06-02T00:00:00.000Z";
const T_SPAETER = "2026-06-02T00:01:00.000Z";

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `AutomationStore — Multi-Consumer-Fan-out (#24) — ${impl.name}`,
    () => {
      let store: AutomationStore;
      beforeAll(() => {
        store = impl.make();
      });

      // Der Store ist über die Tests GETEILT (beforeAll) und der Fan-out ist NICHT mandanten-scoped — ein frischer
      // Consumer würde sonst ALLE je eingereihten getypten Events greifen. Isolation je Test über einen EINDEUTIGEN
      // event_type + eventTypes-Filter (funktioniert auch gegen die persistente PG-DB).
      function ctx() {
        const tid = `t-${uid()}`;
        const et = `x.${tid}`;
        return {
          et,
          claim: (
            consumer: string,
            over: { now?: string; visibilityMs?: number } = {},
          ) =>
            store.claimForConsumer({
              consumer: `${consumer}-${tid}`,
              now: over.now ?? T0,
              limit: 10,
              eventTypes: [et],
              ...(over.visibilityMs !== undefined
                ? { visibilityMs: over.visibilityMs }
                : {}),
            }),
          konsument: (name: string) => `${name}-${tid}`,
          event: (over: Partial<AppAutomationEvent> = {}) =>
            macheEvent({
              tenantId: tid,
              eventId: `evt-${uid()}`,
              eventType: et,
              ...over,
            }),
        };
      }

      it("zwei Consumer bekommen JEDES getypte Event UNABHÄNGIG (+ tie-stabile Reihenfolge bei gleichem createdAt)", async () => {
        const c = ctx();
        const gleich = "2026-06-01T00:00:00.000Z"; // GLEICHER createdAt → Tie
        const e1 = c.event({ eventId: `evt-a-${uid()}`, createdAt: gleich });
        const e2 = c.event({ eventId: `evt-b-${uid()}`, createdAt: gleich });
        await store.enqueueEvent(e1);
        await store.enqueueEvent(e2);

        const search = await c.claim("search");
        const notifier = await c.claim("notifier");
        expect(search.map((d) => d.event.eventId).sort()).toEqual(
          [e1.eventId, e2.eventId].sort(),
        );
        expect(notifier.map((d) => d.event.eventId).sort()).toEqual(
          [e1.eventId, e2.eventId].sort(),
        );
        // Tie-stabil: gleicher createdAt → eventId entscheidet, deterministisch in beiden Runtimes.
        const ids = search.map((d) => d.event.eventId);
        expect(ids).toEqual([...ids].sort());
        expect(search.every((d) => d.attempts === 1)).toBe(true);
      });

      it("markDelivered schliesst NUR diesen Consumer ab; ein anderer Consumer bekommt das Event weiterhin", async () => {
        const c = ctx();
        const e1 = c.event();
        await store.enqueueEvent(e1);
        const first = await c.claim("search", { visibilityMs: 1000 });
        expect(first.map((d) => d.event.eventId)).toEqual([e1.eventId]);
        await store.markDelivered({
          consumer: c.konsument("search"),
          eventId: e1.eventId,
          now: T0,
        });
        // search: auch nach Lease-Ablauf KEIN Re-Claim (done).
        expect(
          (await c.claim("search", { now: T_SPAETER })).map(
            (d) => d.event.eventId,
          ),
        ).not.toContain(e1.eventId);
        // notifier: nie zugestellt → bekommt es jetzt (unabhängig).
        expect(
          (await c.claim("notifier", { now: T_SPAETER })).map(
            (d) => d.event.eventId,
          ),
        ).toContain(e1.eventId);
      });

      it("at-least-once je Consumer: Crash vor markDelivered → Re-Claim nach Lease-Ablauf (attempts=2)", async () => {
        const c = ctx();
        const e1 = c.event();
        await store.enqueueEvent(e1);
        const c1 = await c.claim("search", { visibilityMs: 1000 });
        expect(c1[0]?.attempts).toBe(1);
        // Innerhalb der Lease NICHT re-claimbar.
        expect(
          (await c.claim("search", { now: "2026-06-02T00:00:00.500Z" })).map(
            (d) => d.event.eventId,
          ),
        ).not.toContain(e1.eventId);
        // Nach Lease-Ablauf: erneut (attempts=2).
        const c2 = await c.claim("search", {
          now: T_SPAETER,
          visibilityMs: 1000,
        });
        expect(c2.find((d) => d.event.eventId === e1.eventId)?.attempts).toBe(
          2,
        );
      });

      it("deadLetterDelivery → kein Re-Claim; Zustellstand 'dead' + reason sichtbar", async () => {
        const c = ctx();
        const e1 = c.event();
        await store.enqueueEvent(e1);
        await c.claim("search", { visibilityMs: 1000 });
        await store.deadLetterDelivery({
          consumer: c.konsument("search"),
          eventId: e1.eventId,
          now: "2026-06-02T00:00:01.000Z",
          reason: "poison",
        });
        expect(
          (await c.claim("search", { now: "2026-06-02T00:05:00.000Z" })).map(
            (d) => d.event.eventId,
          ),
        ).not.toContain(e1.eventId);
        const del = (
          await store.listDeliveries({
            eventId: e1.eventId,
            consumer: c.konsument("search"),
          })
        )[0];
        expect(del?.status).toBe("dead");
        expect(del?.reason).toBe("poison");
      });

      it("fächert NUR GETYPTE Events (#16); eventTypes filtert je Consumer", async () => {
        const c = ctx();
        const typed = c.event({ eventId: `evt-typed-${uid()}` });
        const untyped = macheEvent({
          tenantId: `t-${uid()}`,
          eventId: `evt-untyped-${uid()}`,
        }); // KEIN eventType
        await store.enqueueEvent(typed);
        await store.enqueueEvent(untyped);
        // Filter auf den Test-Typ: nur das getypte Event (ungetypte bleiben der Engine via trigger_event überlassen).
        const alle = await c.claim("search");
        expect(alle.map((d) => d.event.eventId)).toEqual([typed.eventId]);
        // Typ-Filter, der NICHT passt → nichts.
        const gefiltert = await store.claimForConsumer({
          consumer: c.konsument("notifier"),
          now: T0,
          limit: 10,
          eventTypes: ["task.frist-erreicht"],
        });
        expect(gefiltert).toHaveLength(0);
      });

      it("Fan-out rührt die Engine NICHT an: claimDueEvents/processed_at bleiben orthogonal", async () => {
        const c = ctx();
        const e1 = c.event();
        await store.enqueueEvent(e1);
        // Fan-out claimt für einen Consumer ...
        expect((await c.claim("search")).map((d) => d.event.eventId)).toContain(
          e1.eventId,
        );
        // ... die ENGINE claimt DASSELBE Event trotzdem (unberührt) + schliesst es für SICH ab (processed_at).
        const engine = await store.claimDueEvents({ now: T0, limit: 50 });
        expect(engine.map((e) => e.eventId)).toContain(e1.eventId);
        await store.markProcessed({ eventId: e1.eventId, now: T0 });
        // Der Engine-Abschluss (processed_at) hält KEINEN Fan-out-Consumer auf — der Fan-out ignoriert processed_at.
        expect(
          (await c.claim("notifier", { now: T_SPAETER })).map(
            (d) => d.event.eventId,
          ),
        ).toContain(e1.eventId);
      });
    },
  );
}

// ── backlogStats (#10): der Outbox-Rückstau als Skalierungssignal des Event-Workers. Bewusst GLOBAL (mandanten-
//    übergreifend, wie der Claim) → gegen den geteilten Store/dieselbe DB der Vertragssuite DELTA-basiert getestet
//    (absolute Zählungen wären durch Rest-Events anderer Tests verfälscht). Die exakte Semantik pinnt der isolierte
//    InMemory-Test darunter. ──
for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `AutomationStore.backlogStats (Delta) — ${impl.name}`,
    () => {
      it("klassifiziert due/claimable/scheduled und folgt Claim + markProcessed", async () => {
        const store = impl.make();
        const now = "2026-06-10T00:00:00.000Z";
        const vorher = await store.backlogStats({ now });

        // 2 fällige, frei greifbare Events (verschiedene Mandanten — der Rückstau ist mandanten-übergreifend).
        await store.enqueueEvent(
          macheEvent({ createdAt: "2026-06-01T00:00:00.000Z" }),
        );
        await store.enqueueEvent(
          macheEvent({ tenantId: "t2", createdAt: "2026-06-01T00:00:01.000Z" }),
        );
        // 1 in der Zukunft geplant ⇒ scheduled, NICHT due.
        await store.enqueueEvent(
          macheEvent({ scheduledFor: "2099-01-01T00:00:00.000Z" }),
        );
        // 1 bereits verarbeitet ⇒ zählt NIE zum Rückstau.
        const erledigt = macheEvent({});
        await store.enqueueEvent(erledigt);
        await store.markProcessed({ eventId: erledigt.eventId, now });

        const a1 = await store.backlogStats({ now });
        expect(a1.due - vorher.due).toBe(2);
        expect(a1.claimable - vorher.claimable).toBe(2);
        expect(a1.scheduled - vorher.scheduled).toBe(1);

        // Ein Claim leaset genau EIN fälliges Event → global claimable -1, due unverändert (Arbeit bleibt offen). Die
        // Deltas gelten UNABHÄNGIG davon, welches (evtl. ältere) Event der Claim greift.
        const geleast = await store.claimDueEvents({ now, limit: 1 });
        expect(geleast).toHaveLength(1);
        const a2 = await store.backlogStats({ now });
        expect(a2.claimable).toBe(a1.claimable - 1);
        expect(a2.due).toBe(a1.due);

        // markProcessed des geleasten Events → due -1 (erledigt); claimable unverändert (es war geleast, nicht claimbar).
        await store.markProcessed({ eventId: geleast[0]!.eventId, now });
        const a3 = await store.backlogStats({ now });
        expect(a3.due).toBe(a2.due - 1);
        expect(a3.claimable).toBe(a2.claimable);
      });
    },
  );
}

describe("InMemoryAutomationStore.backlogStats — absolute Zählung (#10)", () => {
  it("zählt exakt und lässt geplante Events zum Fälligkeitszeitpunkt in den Rückstau rücken", async () => {
    const store = new InMemoryAutomationStore();
    const now = "2026-06-10T00:00:00.000Z";
    await store.enqueueEvent(
      macheEvent({ createdAt: "2026-06-01T00:00:00.000Z" }),
    );
    await store.enqueueEvent(
      macheEvent({ tenantId: "t2", createdAt: "2026-06-01T00:00:01.000Z" }),
    );
    const geplant = macheEvent({ scheduledFor: "2026-06-20T00:00:00.000Z" });
    await store.enqueueEvent(geplant);
    const erledigt = macheEvent({});
    await store.enqueueEvent(erledigt);
    await store.markProcessed({ eventId: erledigt.eventId, now });

    expect(await store.backlogStats({ now })).toEqual({
      due: 2,
      claimable: 2,
      scheduled: 1,
    });

    // Nach dem Fälligkeitszeitpunkt des geplanten Events zählt es als fällig UND (lease-frei) claimbar.
    expect(
      await store.backlogStats({ now: "2026-06-21T00:00:00.000Z" }),
    ).toEqual({ due: 3, claimable: 3, scheduled: 0 });
  });
});

describe("claimDueEvents — #15 FAIRER per-Tenant-Claim (kein Verhungern unter Flut)", () => {
  // Frischer, isolierter Store (der Claim ist NICHT mandanten-scoped → globale Ordnung). Beweist die Fairness-
  // SEMANTIK offline; die PG-Laufzeit nutzt DENSELBEN ORDER BY fair_rank,created_at,event_id (attended).
  it("ein flutender Mandant verdrängt einen ruhigen Mandanten NICHT (round-robin über fair_rank)", async () => {
    const store = new InMemoryAutomationStore();
    // Mandant A FLUTET zuerst (frühere created_at) mit 5 Events → fair_rank 0..4.
    for (let i = 0; i < 5; i++) {
      await store.enqueueEvent(
        macheEvent({
          eventId: `a-${i}`,
          tenantId: "t-A",
          createdAt: `2026-06-01T00:0${i}:00.000Z`,
        }),
      );
    }
    // Mandant B reiht DANACH (spätere created_at) 2 Events ein → fair_rank 0..1.
    for (let i = 0; i < 2; i++) {
      await store.enqueueEvent(
        macheEvent({
          eventId: `b-${i}`,
          tenantId: "t-B",
          createdAt: `2026-06-01T01:0${i}:00.000Z`,
        }),
      );
    }
    // Ein Tick mit begrenztem Budget 4. Unter dem ALTEN globalen FIFO (created_at) kämen NUR A-Events (a-0..a-3),
    // B verhungerte. FAIR: fair_rank round-robin → beide B-Events (rang 0,1) sind dabei.
    const claimed = await store.claimDueEvents({
      now: "2026-06-02T00:00:00.000Z",
      limit: 4,
    });
    const ids = claimed.map((e) => e.eventId);
    // Reihenfolge: rang0 [a-0(älter), b-0], rang1 [a-1, b-1] → a-0, b-0, a-1, b-1.
    expect(ids).toEqual(["a-0", "b-0", "a-1", "b-1"]);
    // Kernaussage: BEIDE Mandanten kommen dran; B (der ruhige) ist NICHT verhungert.
    expect(claimed.filter((e) => e.tenantId === "t-B")).toHaveLength(2);
    expect(new Set(claimed.map((e) => e.tenantId))).toEqual(
      new Set(["t-A", "t-B"]),
    );
  });

  it("bei EINEM Mandanten bleibt es reine created_at/Anlage-Reihenfolge (rückwärtskompatibel)", async () => {
    const store = new InMemoryAutomationStore();
    for (let i = 0; i < 3; i++) {
      await store.enqueueEvent(
        macheEvent({
          eventId: `x-${i}`,
          tenantId: "t-solo",
          createdAt: `2026-06-01T00:0${i}:00.000Z`,
        }),
      );
    }
    const claimed = await store.claimDueEvents({
      now: "2026-06-02T00:00:00.000Z",
      limit: 10,
    });
    expect(claimed.map((e) => e.eventId)).toEqual(["x-0", "x-1", "x-2"]);
  });

  it("eine idempotente Wiederkehr verbraucht KEINEN Rang (Dublette ändert die Fairness nicht)", async () => {
    const store = new InMemoryAutomationStore();
    await store.enqueueEvent(macheEvent({ eventId: "a-0", tenantId: "t-A" }));
    // Dieselbe id erneut (at-least-once) → no-op, KEIN neuer Rang.
    await store.enqueueEvent(macheEvent({ eventId: "a-0", tenantId: "t-A" }));
    await store.enqueueEvent(macheEvent({ eventId: "a-1", tenantId: "t-A" }));
    await store.enqueueEvent(macheEvent({ eventId: "b-0", tenantId: "t-B" }));
    const claimed = await store.claimDueEvents({
      now: "2026-06-02T00:00:00.000Z",
      limit: 2,
    });
    // a-0 (rang0) + b-0 (rang0) — die Dublette hat a-1 NICHT auf rang0 vorgezogen.
    expect(new Set(claimed.map((e) => e.eventId))).toEqual(
      new Set(["a-0", "b-0"]),
    );
  });
});

describe("claimDueEvents — #15 STEADY-STATE-Fairness (Rang resetet nach Abbau)", () => {
  it("ein etablierter Mandant startet nach dem Leeren seiner Warteschlange wieder bei Rang 0 (kein Verhungern durch neue Mandanten)", async () => {
    const store = new InMemoryAutomationStore();
    // Mandant A arbeitet seine 2 Events VOLLSTÄNDIG ab (drained).
    await store.enqueueEvent(
      macheEvent({
        eventId: "a-0",
        tenantId: "t-A",
        createdAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    await store.enqueueEvent(
      macheEvent({
        eventId: "a-1",
        tenantId: "t-A",
        createdAt: "2026-06-01T00:00:01.000Z",
      }),
    );
    const ersteRunde = await store.claimDueEvents({
      now: "2026-06-02T00:00:00.000Z",
      limit: 10,
    });
    for (const e of ersteRunde)
      await store.markProcessed({
        eventId: e.eventId,
        now: "2026-06-02T00:00:01.000Z",
      });
    // A ist GELEERT → sein neues Event resetet auf Rang 0 (nicht Rang 2 wie bei Lifetime-Zähler).
    await store.enqueueEvent(
      macheEvent({
        eventId: "a-2",
        tenantId: "t-A",
        createdAt: "2026-06-02T02:00:00.000Z",
      }),
    );
    // Ein neuer Mandant B reiht SPÄTER ein → ebenfalls Rang 0.
    await store.enqueueEvent(
      macheEvent({
        eventId: "b-0",
        tenantId: "t-B",
        createdAt: "2026-06-02T03:00:00.000Z",
      }),
    );
    const zweiteRunde = await store.claimDueEvents({
      now: "2026-06-03T00:00:00.000Z",
      limit: 10,
    });
    // BEIDE bei Rang 0 → Gleichstand über created_at: a-2 (früher) VOR b-0. Ohne Reset wäre a-2 Rang 2 → [b-0, a-2].
    // Dass a-2 ZUERST kommt, beweist den Reset (A verhungert NICHT gegenüber dem neuen Mandanten B).
    expect(zweiteRunde.map((e) => e.eventId)).toEqual(["a-2", "b-0"]);
  });
});

describe("claimDueEvents — #15 WFQ: dauer-aktiver Mandant wird NICHT von Neuzugängen verdrängt (Review-Fund)", () => {
  it("ein Mandant mit PERSISTENTEM Rückstau (leert nie ganz) verhungert NICHT hinter neuen Rang-0-Mandanten", async () => {
    const store = new InMemoryAutomationStore();
    // Mandant A hält dauerhaft Rückstau: a-0,a-1,a-2 (Ränge 0,1,2).
    await store.enqueueEvent(
      macheEvent({
        eventId: "a-0",
        tenantId: "t-A",
        createdAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    await store.enqueueEvent(
      macheEvent({
        eventId: "a-1",
        tenantId: "t-A",
        createdAt: "2026-06-01T00:00:01.000Z",
      }),
    );
    await store.enqueueEvent(
      macheEvent({
        eventId: "a-2",
        tenantId: "t-A",
        createdAt: "2026-06-01T00:00:02.000Z",
      }),
    );
    // A arbeitet a-0 ab — behält aber a-1,a-2 pending (leert NIE ganz). Front V = MIN(pending) = 1.
    const r1 = await store.claimDueEvents({
      now: "2026-06-02T00:00:00.000Z",
      limit: 1,
    });
    expect(r1.map((e) => e.eventId)).toEqual(["a-0"]);
    await store.markProcessed({
      eventId: "a-0",
      now: "2026-06-02T00:00:01.000Z",
    });
    // Ein NEUER Mandant B reiht (später) ein Event ein. WFQ floort es auf V=1 (NICHT 0) → es kann a-1 NICHT überholen.
    await store.enqueueEvent(
      macheEvent({
        eventId: "b-0",
        tenantId: "t-B",
        createdAt: "2026-06-02T05:00:00.000Z",
      }),
    );
    // Nächster Tick mit Budget 1: A's Rückstau (a-1, Rang 1, älter) wird bedient — B verdrängt A NICHT.
    // Bei der (kaputten) reset-auf-0-Variante wäre b-0 Rang 0 → [b-0], A verhungert. WFQ: [a-1].
    const r2 = await store.claimDueEvents({
      now: "2026-06-03T00:00:00.000Z",
      limit: 1,
    });
    expect(r2.map((e) => e.eventId)).toEqual(["a-1"]);
  });

  it("mehrere Drain-Refill-Mandanten koennen einen dauer-aktiven Mandanten NICHT aushungern", async () => {
    const store = new InMemoryAutomationStore();
    // A: persistenter Rückstau von 3 (Ränge 0,1,2), bearbeitet a-0 ab → pending a-1(1),a-2(2), Front V=1.
    for (let i = 0; i < 3; i++)
      await store.enqueueEvent(
        macheEvent({
          eventId: `a-${i}`,
          tenantId: "t-A",
          createdAt: `2026-06-01T00:00:0${i}.000Z`,
        }),
      );
    const erst = await store.claimDueEvents({
      now: "2026-06-02T00:00:00.000Z",
      limit: 1,
    });
    await store.markProcessed({
      eventId: erst[0]!.eventId,
      now: "2026-06-02T00:00:01.000Z",
    });
    // Zwei frische Mandanten reihen je ein Event ein → WFQ floort BEIDE auf V=1 (nicht 0).
    await store.enqueueEvent(
      macheEvent({
        eventId: "b-0",
        tenantId: "t-B",
        createdAt: "2026-06-02T06:00:00.000Z",
      }),
    );
    await store.enqueueEvent(
      macheEvent({
        eventId: "c-0",
        tenantId: "t-C",
        createdAt: "2026-06-02T06:00:01.000Z",
      }),
    );
    // Budget 2: A's älteste Rückstau-Events (a-1 Rang1, älter als b/c) MUSS dabei sein → A nicht ausgehungert.
    const claim = await store.claimDueEvents({
      now: "2026-06-03T00:00:00.000Z",
      limit: 2,
    });
    expect(claim.map((e) => e.tenantId)).toContain("t-A");
    // a-1 (Rang1, created 00:00:01) kommt vor b-0/c-0 (Rang1, created 06:00:xx) → [a-1, b-0].
    expect(claim.map((e) => e.eventId)).toEqual(["a-1", "b-0"]);
  });
});
