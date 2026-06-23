import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  InMemoryAppStore,
  type MailboxMessage,
} from "@senticor/app-store-postgres";
import { defaultMockUserId } from "../shared/mock-data.js";
import { buildApp } from "../server/app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("app data e2e journey", () => {
  it("persists preferences and protects Posteingang/Ausgang by role", async () => {
    app = await buildApp({
      appStore: new InMemoryAppStore({ messages: mailboxFixtures }),
      enableMockAuth: true,
      logger: false,
    });

    const unauthenticatedPreferences = await app.inject({
      method: "GET",
      url: "/api/v1/me/preferences",
    });
    expect(unauthenticatedPreferences.statusCode).toBe(401);

    const citizenLogin = await app.inject({
      method: "POST",
      url: "/api/v1/session/login",
      payload: { userId: defaultMockUserId },
    });
    expect(citizenLogin.statusCode).toBe(200);

    const defaultPreferences = await app.inject({
      method: "GET",
      url: "/api/v1/me/preferences",
    });
    expect(defaultPreferences.statusCode).toBe(200);
    expect(defaultPreferences.json()).toMatchObject({
      preferences: {
        actorId: defaultMockUserId,
        colorScheme: "light",
        accessibility: { largeText: false },
        navigation: { sidebarAutoExpand: true },
      },
    });

    const savedPreferences = await app.inject({
      method: "PUT",
      url: "/api/v1/me/preferences",
      payload: {
        colorScheme: "dark",
        accessibility: { largeText: true, reducedMotion: true },
        navigation: { sidebarAutoExpand: false },
      },
    });
    expect(savedPreferences.statusCode).toBe(200);
    expect(savedPreferences.json()).toMatchObject({
      preferences: {
        colorScheme: "dark",
        accessibility: { largeText: true, reducedMotion: true },
        navigation: { sidebarAutoExpand: false },
      },
    });

    const reloadedPreferences = await app.inject({
      method: "GET",
      url: "/api/v1/me/preferences",
    });
    expect(reloadedPreferences.statusCode).toBe(200);
    expect(reloadedPreferences.json()).toMatchObject({
      preferences: {
        colorScheme: "dark",
        accessibility: { largeText: true, reducedMotion: true },
        navigation: { sidebarAutoExpand: false },
      },
    });

    const citizenInbox = await app.inject({
      method: "GET",
      url: "/api/v1/me/posteingang",
    });
    expect(citizenInbox.statusCode).toBe(200);
    expect(citizenInbox.json()).toMatchObject({
      box: "inbox",
      audience: "citizen",
      messages: [expect.objectContaining({ messageId: "msg.citizen.inbox" })],
    });

    const citizenOutbox = await app.inject({
      method: "GET",
      url: "/api/v1/me/ausgang",
    });
    expect(citizenOutbox.statusCode).toBe(200);
    expect(citizenOutbox.json()).toMatchObject({
      box: "outbox",
      audience: "citizen",
      messages: [expect.objectContaining({ messageId: "msg.citizen.outbox" })],
    });

    const forbiddenWorkInbox = await app.inject({
      method: "GET",
      url: "/api/v1/work/posteingang",
    });
    expect(forbiddenWorkInbox.statusCode).toBe(403);

    const caseworkerLogin = await app.inject({
      method: "POST",
      url: "/api/v1/session/login",
      payload: { userId: "caseworker-max-beispiel" },
    });
    expect(caseworkerLogin.statusCode).toBe(200);

    const forbiddenCitizenInbox = await app.inject({
      method: "GET",
      url: "/api/v1/me/posteingang",
    });
    expect(forbiddenCitizenInbox.statusCode).toBe(403);

    const workInbox = await app.inject({
      method: "GET",
      url: "/api/v1/work/posteingang",
    });
    expect(workInbox.statusCode).toBe(200);
    expect(workInbox.json()).toMatchObject({
      box: "inbox",
      audience: "caseworker",
      messages: [
        expect.objectContaining({ messageId: "msg.caseworker.inbox" }),
      ],
    });

    const workOutbox = await app.inject({
      method: "GET",
      url: "/api/v1/work/ausgang",
    });
    expect(workOutbox.statusCode).toBe(200);
    expect(workOutbox.json()).toMatchObject({
      box: "outbox",
      audience: "caseworker",
      messages: [
        expect.objectContaining({ messageId: "msg.caseworker.outbox" }),
      ],
    });
  });
});

const mailboxFixtures: MailboxMessage[] = [
  {
    messageId: "msg.citizen.inbox",
    box: "inbox",
    audience: "citizen",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: defaultMockUserId,
    caseId: "FV-2026-0017",
    subject: "Rückfrage zu Ihrem Vorgang",
    bodyPreview: "Bitte prüfen Sie die gespeicherten Angaben.",
    status: "unread",
    createdAt: "2026-06-23T10:00:00.000Z",
  },
  {
    messageId: "msg.citizen.outbox",
    box: "outbox",
    audience: "citizen",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: defaultMockUserId,
    caseId: "FV-2026-0017",
    subject: "Antwort gesendet",
    bodyPreview: "Ihre Antwort wurde gespeichert.",
    status: "sent",
    createdAt: "2026-06-23T10:10:00.000Z",
  },
  {
    messageId: "msg.caseworker.inbox",
    box: "inbox",
    audience: "caseworker",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: "caseworker-max-beispiel",
    caseId: null,
    subject: "Neuer Vorgang im Eingang",
    bodyPreview: "Ein Vorgang wartet auf Sichtung.",
    status: "unread",
    createdAt: "2026-06-23T10:20:00.000Z",
  },
  {
    messageId: "msg.caseworker.outbox",
    box: "outbox",
    audience: "caseworker",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: "caseworker-max-beispiel",
    caseId: null,
    subject: "Rückfrage versendet",
    bodyPreview: "Die Rückfrage wurde an die Bürgerin gesendet.",
    status: "sent",
    createdAt: "2026-06-23T10:30:00.000Z",
  },
];
