import { describe, it, expect } from "vitest";
import { DefaultDenyPolicyEngine } from "./authorization.js";
import {
  type AuditRecord,
  type CaseAuditEvent,
  type CasePersistence,
  type CaseRecord,
  type CatalogTransition,
  type ProcedureCatalog,
  type CaseworkerSession,
  executeCaseTransition,
} from "./case-service.js";

// Ein selbst-genügsamer In-Memory-Persistenz-Fake (dieselbe Form wie der echte CaseStore) — beweist die
// Server-Autoritative Kette (RBAC + Vier-Augen + Optimistic Locking + append-only Audit) ohne HTTP/DB.
class FakePersistence implements CasePersistence {
  cases = new Map<string, CaseRecord>();
  audit: (AuditRecord & CaseAuditEvent)[] = [];
  outbox: unknown[] = [];
  seed(c: CaseRecord) {
    this.cases.set(`${c.tenantId}:${c.caseId}`, { ...c });
  }
  async getCase(input: { tenantId: string; caseId: string }) {
    const c = this.cases.get(`${input.tenantId}:${input.caseId}`);
    return c ? { ...c } : undefined;
  }
  async listAuditEvents(query: { tenantId: string; caseId: string }) {
    return this.audit.filter(
      (e) => e.tenantId === query.tenantId && e.caseId === query.caseId,
    );
  }
  async transitionCase(input: {
    tenantId: string;
    caseId: string;
    expectedVersion: number;
    toState: string;
    closedAt?: string | null;
    auditEvent: CaseAuditEvent;
    outboxEvent?: unknown;
  }): Promise<CaseRecord> {
    const key = `${input.tenantId}:${input.caseId}`;
    const cur = this.cases.get(key)!;
    if (cur.version !== input.expectedVersion) {
      const err = new Error("conflict");
      err.name = "CaseVersionConflictError";
      throw err;
    }
    const next = { ...cur, state: input.toState, version: cur.version + 1 };
    this.cases.set(key, next);
    this.audit.push({ ...input.auditEvent } as AuditRecord & CaseAuditEvent);
    // Das Event teilt hier (Fake) dieselbe synchrone „TX" wie die Mutation.
    if (input.outboxEvent) this.outbox.push(input.outboxEvent);
    return { ...next };
  }
}

const CATALOG: ProcedureCatalog = {
  transitionsFor(): CatalogTransition[] {
    return [
      {
        from: "eingegangen",
        to: "vorgelegt",
        action: "vorlegen",
        requiredPermission: "case.transition",
      },
      {
        from: "vorgelegt",
        to: "festgesetzt",
        action: "festsetzen",
        requiredPermission: "case.decide",
        requiresFourEyes: true,
      },
      {
        from: "vorgelegt",
        to: "abgelehnt",
        action: "ablehnen",
        requiredPermission: "case.decide",
        requiresDetail: true,
        terminal: true,
      },
    ];
  },
};

function macheCase(over: Partial<CaseRecord> = {}): CaseRecord {
  return {
    caseId: "c1",
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "leistung",
    procedureVersion: "1",
    state: "eingegangen",
    version: 1,
    ...over,
  };
}

function session(over: Partial<CaseworkerSession> = {}): CaseworkerSession {
  return {
    actorId: "sb.a",
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    permissions: ["case.read", "case.transition", "case.decide"],
    ...over,
  };
}

function deps(p: FakePersistence) {
  let n = 0;
  return {
    persistence: p,
    policy: new DefaultDenyPolicyEngine(),
    catalog: CATALOG,
    now: () => "2026-06-01T00:00:00.000Z",
    newAuditId: () => `audit-${++n}`,
  };
}

describe("executeCaseTransition — server-autoritative Fall-Entscheidung", () => {
  it("führt einen einfachen Übergang aus und schreibt ein Audit-Event", async () => {
    const p = new FakePersistence();
    p.seed(macheCase());
    const res = await executeCaseTransition(deps(p), {
      session: session(),
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.case.state).toBe("vorgelegt");
    expect(p.audit).toHaveLength(1);
    expect(p.audit[0]!.eventType).toBe("case.vorlegen");
  });

  it("404 wenn der Fall (im Mandanten-Scope) nicht existiert", async () => {
    const p = new FakePersistence();
    const res = await executeCaseTransition(deps(p), {
      session: session(),
      caseId: "fehlt",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
    });
    expect(res).toEqual({ ok: false, status: 404, reason: "case not found" });
  });

  it("404 (Behörden-Scope): ein Bearbeiter darf keinen Fall einer FREMDEN Behörde wechseln — kein Audit/Event", async () => {
    const p = new FakePersistence();
    p.seed(macheCase({ authorityId: "b2" })); // Fall gehört Behörde b2
    const res = await executeCaseTransition(deps(p), {
      session: session({ actorId: "sb.a", authorityId: "b1" }), // Session in b1
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
      outboxTrigger: "beim-uebergang",
    });
    expect(res).toEqual({ ok: false, status: 404, reason: "case not found" });
    // Weder Audit noch Outbox-Event wurden geschrieben.
    expect(p.audit).toHaveLength(0);
    expect(p.outbox).toHaveLength(0);
  });

  it("400 bei ungültiger Transition", async () => {
    const p = new FakePersistence();
    p.seed(macheCase({ state: "festgesetzt" }));
    const res = await executeCaseTransition(deps(p), {
      session: session(),
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("403 bei fehlender Berechtigung (RBAC)", async () => {
    const p = new FakePersistence();
    p.seed(macheCase());
    const res = await executeCaseTransition(deps(p), {
      session: session({ permissions: ["case.read"] }), // ohne case.transition
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it("403 Vier-Augen: DIESELBE Person, die vorgelegt hat, darf nicht festsetzen", async () => {
    const p = new FakePersistence();
    p.seed(macheCase());
    const d = deps(p);
    // sb.a legt vor
    await executeCaseTransition(d, {
      session: session({ actorId: "sb.a" }),
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
    });
    // sb.a versucht festzusetzen (Vier-Augen) → deny
    const selbst = await executeCaseTransition(d, {
      session: session({ actorId: "sb.a" }),
      caseId: "c1",
      action: "festsetzen",
      expectedVersion: 2,
      requestId: "r2",
    });
    expect(selbst.ok).toBe(false);
    if (!selbst.ok) expect(selbst.status).toBe(403);
    // sb.b (andere Person) darf festsetzen
    const andere = await executeCaseTransition(d, {
      session: session({ actorId: "sb.b" }),
      caseId: "c1",
      action: "festsetzen",
      expectedVersion: 2,
      requestId: "r3",
    });
    expect(andere.ok).toBe(true);
    if (andere.ok) expect(andere.case.state).toBe("festgesetzt");
  });

  it("Vier-Augen: ein maschineller Übergang (automation.service) verdrängt NICHT den menschlichen Vorbereiter", async () => {
    const p = new FakePersistence();
    p.seed(macheCase());
    const d = deps(p);
    // sb.a legt vor (menschlicher Vorbereiter).
    await executeCaseTransition(d, {
      session: session({ actorId: "sb.a" }),
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
    });
    // Danach schreibt die Automation einen fachlichen Übergang (case.*-Audit mit dem Dienst-Akteur).
    p.audit.push({
      auditEventId: "audit-auto",
      caseId: "c1",
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      actorId: "automation.service",
      eventType: "case.zwischenschritt",
      occurredAt: "2026-06-01T00:00:01.000Z",
    } as unknown as AuditRecord & CaseAuditEvent);
    // sb.a versucht festzusetzen — MUSS verweigert werden (der maschinelle Schritt zählt NICHT als Vorbereiter,
    // sonst könnte ein einzelner Mensch die Vier-Augen-Entscheidung allein abschließen).
    const selbst = await executeCaseTransition(d, {
      session: session({ actorId: "sb.a" }),
      caseId: "c1",
      action: "festsetzen",
      expectedVersion: 2,
      requestId: "r2",
    });
    expect(selbst.ok).toBe(false);
    if (!selbst.ok) expect(selbst.status).toBe(403);
  });

  it("Outbox: ein MENSCHLICHER Übergang mit outboxTrigger emittiert genau ein Event", async () => {
    const p = new FakePersistence();
    p.seed(macheCase());
    const d = deps(p);
    const res = await executeCaseTransition(d, {
      session: session({ actorId: "sb.a" }),
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
      outboxTrigger: "beim-uebergang",
    });
    expect(res.ok).toBe(true);
    expect(p.outbox).toHaveLength(1);
    expect(p.outbox[0]).toMatchObject({
      triggerEvent: "beim-uebergang",
      payload: {
        actor: "sb.a",
        fromState: "eingegangen",
        toState: "vorgelegt",
      },
      processedAt: null,
    });
  });

  it("Outbox-REKURSIONS-SPERRE: ein maschineller (automation.service) Übergang emittiert NIE ein Event", async () => {
    const p = new FakePersistence();
    p.seed(macheCase());
    const d = deps(p);
    const res = await executeCaseTransition(d, {
      // gleicher Trigger, aber Dienst-Akteur → kein Event (kein Event-Sturm).
      session: session({ actorId: "automation.service" }),
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1,
      requestId: "r1",
      outboxTrigger: "beim-uebergang",
    });
    expect(res.ok).toBe(true);
    expect(p.outbox).toHaveLength(0);
  });

  it("400 wenn eine begründungspflichtige Aktion ohne detail kommt", async () => {
    const p = new FakePersistence();
    p.seed(macheCase({ state: "vorgelegt", version: 2 }));
    const res = await executeCaseTransition(deps(p), {
      session: session({ actorId: "sb.b" }),
      caseId: "c1",
      action: "ablehnen",
      expectedVersion: 2,
      requestId: "r1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("409 bei veralteter erwarteter Version (Optimistic Locking)", async () => {
    const p = new FakePersistence();
    p.seed(macheCase({ version: 3 }));
    const res = await executeCaseTransition(deps(p), {
      session: session(),
      caseId: "c1",
      action: "vorlegen",
      expectedVersion: 1, // veraltet
      requestId: "r1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });
});
