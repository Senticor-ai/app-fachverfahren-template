import { describe, expect, it } from "vitest";
import {
  capabilityFailure,
  defaultSemantics,
  type PaymentPort,
} from "@senticor/platform-contracts";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

/** Ein PaymentPort, der fail-closed antwortet — für den ehrlichen Fehler-Pfad (kein fingierter Status). */
const failingPayment: PaymentPort = {
  descriptor: {
    id: "payment",
    name: "Failing",
    version: "0.0.0",
    provider: "test-failing",
    dataClassification: "confidential",
    schemas: [],
    semantics: defaultSemantics,
  },
  async createPayment() {
    return capabilityFailure(
      "payment/provider-rejected",
      "Zahlungsanbieter lehnte ab",
      { retryable: false, classification: "confidential" },
    );
  },
  async getPaymentStatus() {
    return capabilityFailure(
      "payment/unavailable",
      "Anbieter nicht erreichbar",
      {
        retryable: true,
        classification: "confidential",
      },
    );
  },
};

describe("BFF /api/payment", () => {
  it("200: Bürger:in veranlasst eine Zahlung → completed + Audit (Kassen-Nachvollzug)", async () => {
    const { app, auditSink } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/payment",
      payload: {
        amountMinor: 3000,
        purpose: "Antrag — Verwaltungsgebühr",
        reference: "KZ-2026-0001",
      },
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json();
    expect(dto.status).toBe("completed");
    expect(dto.amountMinor).toBe(3000);
    expect(dto.currency).toBe("EUR");
    expect(typeof dto.paymentId).toBe("string");
    expect(
      auditSink.events.some(
        (e) =>
          e.kind === "app-data" && e.event.eventType === "payment.initiated",
      ),
    ).toBe(true);
    await app.close();
  });

  it("200: GET Status einer veranlassten Zahlung → completed", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const created = await app.inject({
      method: "POST",
      url: "/api/payment",
      payload: { amountMinor: 1500, purpose: "Gebühr", reference: "KZ-2" },
    });
    const { paymentId } = created.json();
    const res = await app.inject({
      method: "GET",
      url: `/api/payment/${paymentId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("completed");
    await app.close();
  });

  it("403: Sachbearbeitung hat keine payment.initiate-Permission (die Zahlung ist die Bürger-Fläche)", async () => {
    const { app } = await buildBffApp({ session: caseworkerSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/payment",
      payload: { amountMinor: 100, purpose: "x", reference: "r" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("401: ohne Sitzung", async () => {
    const { app } = await buildBffApp({});
    const res = await app.inject({
      method: "POST",
      url: "/api/payment",
      payload: { amountMinor: 100, purpose: "x", reference: "r" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("400: fehlender Pflichtbetrag → Validation-Envelope", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/payment",
      payload: { purpose: "x", reference: "r" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("502: Anbieter lehnt ab → ehrlich + KLASSIFIKATIONS-SICHER (Code statt PII-Message) + Fehlversuch auditiert", async () => {
    const { app, auditSink } = await buildBffApp({
      session: citizenSession(),
      payment: failingPayment,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/payment",
      payload: { amountMinor: 100, purpose: "x", reference: "r" },
    });
    expect(res.statusCode).toBe(502);
    const body = res.json();
    // Härtung 1 (PII-Leak-Sperre): confidential-Failure → der stabile CODE, NICHT die (evtl. PII-tragende) Anbieter-Message.
    expect(body.error).toContain("payment/provider-rejected");
    expect(body.error).not.toContain("Zahlungsanbieter lehnte ab");
    // Härtung 2 (Audit-Vollständigkeit): auch der ABGELEHNTE Versuch hinterlässt eine Spur (die Header versprechen es).
    expect(
      auditSink.events.some(
        (e) => e.kind === "app-data" && e.event.eventType === "payment.failed",
      ),
    ).toBe(true);
    await app.close();
  });
});
