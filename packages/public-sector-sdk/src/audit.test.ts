import { describe, expect, it } from "vitest";
import {
  createAppDataAuditEvent,
  createFachlicheAuditEvent,
  createSecurityEvent,
} from "./audit.js";

describe("Audit-Factories", () => {
  it("createAppDataAuditEvent stempelt Id und Zeitpunkt, kennt KEIN legalBasisId", () => {
    const event = createAppDataAuditEvent({
      eventType: "preferences.updated",
      actorId: "actor-1",
      tenantId: "tenant-1",
      requestId: "req-1",
      summary: "Benutzereinstellungen aktualisiert",
      resource: { type: "preferences", id: "actor-1" },
    });
    expect(event.auditEventId).toMatch(/^audit\.[0-9a-f-]{36}$/);
    expect(Date.parse(event.occurredAt)).not.toBeNaN();
    expect(event.eventType).toBe("preferences.updated");
    // AppDataAuditEvent ist bewusst leichtgewichtig: keine Rechtsgrundlage faken —
    // fachliche Ereignisse MIT legalBasisId laufen über createFachlicheAuditEvent.
    expect(Object.keys(event)).not.toContain("legalBasisId");
    expect(Object.keys(event)).not.toContain("purpose");
  });

  it("createSecurityEvent stempelt Id und Zeitpunkt", () => {
    const event = createSecurityEvent({
      eventType: "bff.permission.denied",
      actorId: "actor-1",
      requestId: "req-1",
      severity: "warning",
    });
    expect(event.securityEventId).toMatch(/^security\.[0-9a-f-]{36}$/);
    expect(Date.parse(event.occurredAt)).not.toBeNaN();
    expect(event.severity).toBe("warning");
  });

  it("createFachlicheAuditEvent bleibt unverändert (Regressionsprobe)", () => {
    const event = createFachlicheAuditEvent({
      eventType: "case.decision.prepared",
      actorId: "actor-1",
      actingAuthorityId: "authority-1",
      purpose: "Entscheidung vorbereiten",
      legalBasisId: "gesetz-1",
      requestId: "req-1",
      summary: "Entscheidung vorbereitet",
    });
    expect(event.auditEventId).toMatch(/^audit\./);
    expect(event.legalBasisId).toBe("gesetz-1");
  });
});
