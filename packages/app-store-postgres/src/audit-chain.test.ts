// audit-chain.test — die pure Hash-Ketten-Verifikation (Issue #53). Baut eine gültige Kette und weist nach,
// dass Modifikation, Löschung, Reorder und fehlende Hashes erkannt werden.
import { describe, expect, it } from "vitest";
import { chainAuditEvent, verifyAuditChain } from "./audit-chain.js";
import type { AppAuditEvent } from "./case-store.js";

function ev(
  over: Partial<AppAuditEvent> &
    Pick<AppAuditEvent, "auditEventId" | "occurredAt">,
): AppAuditEvent {
  return {
    caseId: "c1",
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    actorId: "actor.a",
    eventType: "case.transitioned",
    purpose: "case-management",
    legalBasisId: "L1",
    requestId: "req",
    payload: {},
    ...over,
  };
}

/** Baut eine verkettete Reihe (jedes Ereignis kettet an die bisher gebauten). */
function chain(events: AppAuditEvent[]): AppAuditEvent[] {
  const out: AppAuditEvent[] = [];
  for (const e of events) out.push(chainAuditEvent(e, out));
  return out;
}

const three = () =>
  chain([
    ev({ auditEventId: "e1", occurredAt: "2026-01-01T00:00:00.000Z" }),
    ev({ auditEventId: "e2", occurredAt: "2026-01-02T00:00:00.000Z" }),
    ev({ auditEventId: "e3", occurredAt: "2026-01-03T00:00:00.000Z" }),
  ]);

describe("verifyAuditChain", () => {
  it("gültige Kette ist ok; Genesis-prevHash ist null, jedes kettet an den Vorgänger", () => {
    const c = three();
    expect(c[0]!.prevHash).toBeNull();
    expect(c[1]!.prevHash).toBe(c[0]!.entryHash);
    expect(c[2]!.prevHash).toBe(c[1]!.entryHash);
    expect(verifyAuditChain(c).ok).toBe(true);
    expect(verifyAuditChain([]).ok).toBe(true);
  });

  it("MODIFIKATION eines Ereignisses → entry-hash-mismatch am manipulierten Eintrag", () => {
    const c = three();
    const tampered = c.map((e) =>
      e.auditEventId === "e2" ? { ...e, payload: { hacked: true } } : e,
    );
    const r = verifyAuditChain(tampered);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("entry-hash-mismatch");
    expect(r.brokenAt).toBe("e2");
  });

  it("LÖSCHUNG in der Mitte → prev-hash-mismatch am Nachfolger", () => {
    const c = three();
    const withoutMiddle = [c[0]!, c[2]!];
    const r = verifyAuditChain(withoutMiddle);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("prev-hash-mismatch");
    expect(r.brokenAt).toBe("e3");
  });

  it("reihenfolge-unabhängig: eine gemischte Eingabe-Liste verifiziert (verify folgt den Links)", () => {
    const c = three();
    expect(verifyAuditChain([c[2]!, c[0]!, c[1]!]).ok).toBe(true);
  });

  it("MANIPULATION eines gehashten Feldes (occurredAt) → entry-hash-mismatch", () => {
    const c = three();
    const tampered = c.map((e) =>
      e.auditEventId === "e2"
        ? { ...e, occurredAt: "2099-01-01T00:00:00.000Z" }
        : e,
    );
    expect(verifyAuditChain(tampered).reason).toBe("entry-hash-mismatch");
  });

  it("fehlende Ketten-Felder (Alt-Zeile vor der Migration) → missing-hash", () => {
    const bare = ev({
      auditEventId: "e1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
    const r = verifyAuditChain([bare]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing-hash");
  });
});
