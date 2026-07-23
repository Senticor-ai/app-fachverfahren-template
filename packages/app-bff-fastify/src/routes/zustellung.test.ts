import { describe, expect, it } from "vitest";
import {
  capabilityFailure,
  defaultSemantics,
  type MailboxPort,
} from "@senticor/platform-contracts";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

/** Ein MailboxPort, der fail-closed antwortet — für den ehrlichen Fehler-Pfad (keine fingierte Zustellung). */
const failingMailbox: MailboxPort = {
  descriptor: {
    id: "mailbox",
    name: "Failing",
    version: "0.0.0",
    provider: "test-failing",
    dataClassification: "confidential",
    schemas: [],
    semantics: defaultSemantics,
  },
  async sendMessage() {
    return capabilityFailure("mailbox/gateway-rejected", "De-Mail-Gateway lehnte ab", {
      retryable: false,
      classification: "confidential",
    });
  },
  async getDeliveryStatus() {
    return capabilityFailure("mailbox/unavailable", "Gateway nicht erreichbar", {
      retryable: true,
      classification: "confidential",
    });
  },
};

const bescheid = {
  messageId: "BESCHEID-2026-0001",
  recipientId: "actor-citizen",
  subject: "Hundesteuerbescheid 2026",
  bodyText: "Ihr Bescheid liegt bei.",
};

describe("BFF /api/zustellung", () => {
  it("200: Sachbearbeitung stellt einen Bescheid zu → deliveryId + Audit (Zustellnachweis)", async () => {
    const { app, auditSink } = await buildBffApp({ session: caseworkerSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/zustellung",
      payload: bescheid,
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().deliveryId).toBe("string");
    expect(
      auditSink.events.some(
        (e) =>
          e.kind === "app-data" && e.event.eventType === "bescheid.zugestellt",
      ),
    ).toBe(true);
    await app.close();
  });

  it("200: GET Zustellstatus einer zugestellten Nachricht → delivered", async () => {
    const { app } = await buildBffApp({ session: caseworkerSession() });
    const sent = await app.inject({
      method: "POST",
      url: "/api/zustellung",
      payload: bescheid,
    });
    const { deliveryId } = sent.json();
    const res = await app.inject({
      method: "GET",
      url: `/api/zustellung/${deliveryId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("delivered");
    await app.close();
  });

  it("403: Bürgerin darf keinen Bescheid zustellen (hoheitliche Außenwirkung)", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/zustellung",
      payload: bescheid,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("401: ohne Sitzung", async () => {
    const { app } = await buildBffApp({});
    const res = await app.inject({
      method: "POST",
      url: "/api/zustellung",
      payload: bescheid,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("400: fehlender Empfänger → Validation-Envelope", async () => {
    const { app } = await buildBffApp({ session: caseworkerSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/zustellung",
      payload: { messageId: "m", subject: "s", bodyText: "b" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("502: Gateway lehnt ab → ehrliches Scheitern, keine fingierte Zustellung", async () => {
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      mailbox: failingMailbox,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/zustellung",
      payload: bescheid,
    });
    expect(res.statusCode).toBe(502);
    await app.close();
  });
});
