// mailbox.test — GET/POST /api/mailbox: box-Validierung, scope-Split (own/authority)
// mit getrennten Lese- UND Schreibrechten, servergenerierte Felder, Persistenz,
// AppDataAuditEvent und 503 bei Store-Ausfall.
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryAppStore,
  UnavailableAppStore,
  type MailboxMessage,
} from "@senticor/app-store-postgres";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function seededStore(): InMemoryAppStore {
  const base = {
    tenantId: "tenant-1",
    authorityId: "authority-1",
    jurisdictionId: "de",
    caseId: null,
    bodyPreview: "",
  };
  const messages: MailboxMessage[] = [
    {
      ...base,
      messageId: "msg-own-1",
      box: "inbox",
      audience: "citizen",
      ownerActorId: "actor-citizen",
      subject: "Eigene Nachricht",
      status: "unread",
      createdAt: "2026-07-01T00:00:00.000Z",
    },
    {
      ...base,
      messageId: "msg-fremd-1",
      box: "inbox",
      audience: "citizen",
      ownerActorId: "actor-fremd",
      subject: "Fremde Nachricht",
      status: "unread",
      createdAt: "2026-07-02T00:00:00.000Z",
    },
    {
      ...base,
      messageId: "msg-amt-1",
      box: "inbox",
      audience: "caseworker",
      ownerActorId: "actor-caseworker",
      subject: "Behördliche Nachricht",
      status: "unread",
      createdAt: "2026-07-03T00:00:00.000Z",
    },
  ];
  return new InMemoryAppStore({ messages });
}

describe("GET /api/mailbox", () => {
  it("400 ohne box und bei unbekannter box", async () => {
    ({ app } = await buildBffApp({ session: citizenSession() }));
    for (const url of ["/api/mailbox", "/api/mailbox?box=spam"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(400);
      expect(response.json().error).toBe("invalid request");
    }
  });

  it("scope-Default own: Bürger sieht NUR eigene Nachrichten, ohne Server-Topologie", async () => {
    ({ app } = await buildBffApp({
      session: citizenSession(),
      appStore: seededStore(),
    }));
    const response = await app.inject({
      method: "GET",
      url: "/api/mailbox?box=inbox",
    });
    expect(response.statusCode).toBe(200);
    const { messages } = response.json();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      messageId: "msg-own-1",
      box: "inbox",
      scope: "own",
      ownerActorId: "actor-citizen",
      caseId: null,
      subject: "Eigene Nachricht",
      bodyPreview: "",
      status: "unread",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
  });

  it("Bürger mit scope=authority → 403 + SecurityEvent", async () => {
    const built = await buildBffApp({
      session: citizenSession(),
      appStore: seededStore(),
    });
    app = built.app;
    const response = await app.inject({
      method: "GET",
      url: "/api/mailbox?box=inbox&scope=authority",
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain("mailbox.authority.read");
    expect(built.auditSink.events[0]?.event.eventType).toBe(
      "bff.permission.denied",
    );
  });

  it("Sachbearbeitung liest das behördliche Postfach, aber NICHT scope=own", async () => {
    ({ app } = await buildBffApp({
      session: caseworkerSession(),
      appStore: seededStore(),
    }));
    const authority = await app.inject({
      method: "GET",
      url: "/api/mailbox?box=inbox&scope=authority",
    });
    expect(authority.statusCode).toBe(200);
    expect(
      authority.json().messages.map((m: { messageId: string }) => m.messageId),
    ).toEqual(["msg-amt-1"]);

    const own = await app.inject({
      method: "GET",
      url: "/api/mailbox?box=inbox&scope=own",
    });
    expect(own.statusCode).toBe(403);
    expect(own.json().error).toContain("mailbox.own.read");
  });

  it("503 bei nicht verfügbarem Store", async () => {
    ({ app } = await buildBffApp({
      session: citizenSession(),
      appStore: new UnavailableAppStore("APP_PG_URL fehlt"),
    }));
    const response = await app.inject({
      method: "GET",
      url: "/api/mailbox?box=inbox",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("app data storage unavailable");
  });
});

describe("POST /api/mailbox", () => {
  it("201 mit servergenerierten Feldern, Persistenz und AppDataAuditEvent", async () => {
    const store = seededStore();
    const built = await buildBffApp({
      session: citizenSession(),
      appStore: store,
    });
    app = built.app;
    const response = await app.inject({
      method: "POST",
      url: "/api/mailbox",
      headers: { "x-request-id": "req-post-1" },
      payload: {
        box: "outbox",
        subject: "Rückfrage",
        bodyPreview: "Ich habe eine Rückfrage.",
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.messageId).toMatch(/^msg\./);
    expect(body.box).toBe("outbox");
    expect(body.scope).toBe("own");
    expect(body.status).toBe("sent");
    expect(body.ownerActorId).toBe("actor-citizen");
    expect(Date.parse(body.createdAt)).not.toBeNaN();
    expect(body).not.toHaveProperty("tenantId");

    // Persistiert mit Sitzungs-Kontext (Store-Sicht, inkl. Topologie).
    const persisted = await store.listMailboxMessages({
      box: "outbox",
      audience: "citizen",
      tenantId: "tenant-1",
      authorityId: "authority-1",
      actorId: "actor-citizen",
      scope: "owner",
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.tenantId).toBe("tenant-1");
    expect(persisted[0]?.jurisdictionId).toBe("de");

    const appDataEvents = built.auditSink.events.filter(
      (event) => event.kind === "app-data",
    );
    expect(appDataEvents).toHaveLength(1);
    if (appDataEvents[0]?.kind === "app-data") {
      expect(appDataEvents[0].event.eventType).toBe("mailbox.message.created");
      expect(appDataEvents[0].event.requestId).toBe("req-post-1");
      expect(appDataEvents[0].event.resource?.id).toBe(body.messageId);
    }
  });

  it("box=inbox erzeugt status unread", async () => {
    ({ app } = await buildBffApp({ session: citizenSession() }));
    const response = await app.inject({
      method: "POST",
      url: "/api/mailbox",
      payload: { box: "inbox", subject: "Eingang", bodyPreview: "" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("unread");
  });

  it("Schreiben verlangt die scope-eigene WRITE-Permission (nie ein Leserecht)", async () => {
    const built = await buildBffApp({
      session: citizenSession(),
      appStore: seededStore(),
    });
    app = built.app;
    const denied = await app.inject({
      method: "POST",
      url: "/api/mailbox",
      payload: {
        box: "outbox",
        scope: "authority",
        subject: "Bescheid",
        bodyPreview: "",
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toContain("mailbox.authority.write");
    expect(
      built.auditSink.events.filter((event) => event.kind === "app-data"),
    ).toHaveLength(0);
  });

  it("Sachbearbeitung schreibt behördlich (201, audience caseworker persistiert)", async () => {
    const store = seededStore();
    ({ app } = await buildBffApp({
      session: caseworkerSession(),
      appStore: store,
    }));
    const response = await app.inject({
      method: "POST",
      url: "/api/mailbox",
      payload: {
        box: "outbox",
        scope: "authority",
        subject: "Bescheid versandt",
        bodyPreview: "",
        caseId: "case-1",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().scope).toBe("authority");
    expect(response.json().caseId).toBe("case-1");

    const persisted = await store.listMailboxMessages({
      box: "outbox",
      audience: "caseworker",
      tenantId: "tenant-1",
      authorityId: "authority-1",
      actorId: "actor-caseworker",
      scope: "authority",
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.audience).toBe("caseworker");
  });

  it("400 bei leerem subject — ohne Audit-Event", async () => {
    const built = await buildBffApp({ session: citizenSession() });
    app = built.app;
    const response = await app.inject({
      method: "POST",
      url: "/api/mailbox",
      payload: { box: "outbox", subject: "", bodyPreview: "" },
    });
    expect(response.statusCode).toBe(400);
    expect(built.auditSink.events).toHaveLength(0);
  });

  it("Kontext-Override im Body wird gestrippt — Tenant bleibt der der Sitzung", async () => {
    const store = new InMemoryAppStore();
    ({ app } = await buildBffApp({
      session: citizenSession(),
      appStore: store,
    }));
    const response = await app.inject({
      method: "POST",
      url: "/api/mailbox",
      payload: {
        box: "outbox",
        subject: "Betreff",
        bodyPreview: "",
        tenantId: "fremd",
        ownerActorId: "fremd",
      },
    });
    expect(response.statusCode).toBe(201);
    const persisted = await store.listMailboxMessages({
      box: "outbox",
      audience: "citizen",
      tenantId: "tenant-1",
      authorityId: "authority-1",
      actorId: "actor-citizen",
      scope: "owner",
    });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.ownerActorId).toBe("actor-citizen");
  });

  it("503 bei nicht verfügbarem Store — ohne AppDataAuditEvent", async () => {
    const built = await buildBffApp({
      session: citizenSession(),
      appStore: new UnavailableAppStore("APP_PG_URL fehlt"),
    });
    app = built.app;
    const response = await app.inject({
      method: "POST",
      url: "/api/mailbox",
      payload: { box: "outbox", subject: "Betreff", bodyPreview: "" },
    });
    expect(response.statusCode).toBe(503);
    expect(
      built.auditSink.events.filter((event) => event.kind === "app-data"),
    ).toHaveLength(0);
  });
});
