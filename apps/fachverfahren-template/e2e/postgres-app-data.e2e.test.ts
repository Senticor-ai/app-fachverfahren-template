import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  migrate,
  PostgresAppStore,
  type MailboxMessage,
} from "@senticor/app-store-postgres";
import { defaultMockUserId } from "../shared/mock-data.js";
import { buildApp } from "../server/app.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const pooledDatabaseUrl =
  process.env["APP_E2E_PG_URL"] ?? process.env["APP_PG_URL"];
const directDatabaseUrl =
  process.env["APP_E2E_PG_DIRECT_URL"] ??
  process.env["APP_PG_DIRECT_URL"] ??
  pooledDatabaseUrl;
const describeWithPostgres =
  pooledDatabaseUrl && directDatabaseUrl ? describe : describe.skip;
const migrationsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/app-store-postgres/migrations",
);

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describeWithPostgres("postgres app data e2e journey", () => {
  const appStore = new PostgresAppStore(pooledDatabaseUrl!);

  beforeAll(async () => {
    await migrate({
      databaseUrl: directDatabaseUrl!,
      migrationsDir,
      migrationTable: "app_schema_migrations",
      advisoryLockId: 5311101n,
    });

    for (const message of mailboxFixtures) {
      await appStore.saveMailboxMessage(message);
    }
  });

  it("uses PostgreSQL for preferences, Posteingang/Ausgang and RBAC", async () => {
    app = await buildApp({
      appStore,
      enableMockAuth: true,
      logger: false,
    });

    const citizenLogin = await app.inject({
      method: "POST",
      url: "/api/v1/session/login",
      payload: { userId: defaultMockUserId },
    });
    expect(citizenLogin.statusCode).toBe(200);

    const lightPreferences = await app.inject({
      method: "PUT",
      url: "/api/v1/me/preferences",
      payload: {
        colorScheme: "light",
        accessibility: { highContrast: true, largeText: false },
        navigation: { sidebarAutoExpand: false },
      },
    });
    expect(lightPreferences.statusCode).toBe(200);
    expect(lightPreferences.json()).toMatchObject({
      preferences: {
        colorScheme: "light",
        accessibility: { highContrast: true, largeText: false },
        navigation: { sidebarAutoExpand: false },
      },
    });

    const darkPreferences = await app.inject({
      method: "PUT",
      url: "/api/v1/me/preferences",
      payload: {
        colorScheme: "dark",
        accessibility: { largeText: true, reducedMotion: true },
      },
    });
    expect(darkPreferences.statusCode).toBe(200);
    expect(darkPreferences.json()).toMatchObject({
      preferences: {
        colorScheme: "dark",
        accessibility: {
          highContrast: true,
          largeText: true,
          reducedMotion: true,
        },
        navigation: { sidebarAutoExpand: false },
      },
    });

    const persistedPreferences = await app.inject({
      method: "GET",
      url: "/api/v1/me/preferences",
    });
    expect(persistedPreferences.statusCode).toBe(200);
    expect(persistedPreferences.json()).toMatchObject({
      preferences: {
        actorId: defaultMockUserId,
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
      audience: "citizen",
      box: "inbox",
      messages: [
        expect.objectContaining({ messageId: "pg.msg.citizen.inbox" }),
      ],
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

    const workInbox = await app.inject({
      method: "GET",
      url: "/api/v1/work/posteingang",
    });
    expect(workInbox.statusCode).toBe(200);
    expect(workInbox.json()).toMatchObject({
      audience: "caseworker",
      box: "inbox",
      messages: [
        expect.objectContaining({ messageId: "pg.msg.caseworker.inbox" }),
      ],
    });

    const workOutbox = await app.inject({
      method: "GET",
      url: "/api/v1/work/ausgang",
    });
    expect(workOutbox.statusCode).toBe(200);
    expect(workOutbox.json()).toMatchObject({
      audience: "caseworker",
      box: "outbox",
      messages: [
        expect.objectContaining({ messageId: "pg.msg.caseworker.outbox" }),
      ],
    });
  });
});

const mailboxFixtures: MailboxMessage[] = [
  {
    messageId: "pg.msg.citizen.inbox",
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
    messageId: "pg.msg.caseworker.inbox",
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
    messageId: "pg.msg.caseworker.outbox",
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
