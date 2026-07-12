import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadMigrations,
  parseMigrationId,
  resolveDatabaseUrl,
} from "./migrate.js";
import { InMemoryAppStore, type MailboxMessage } from "./app-store.js";

describe("postgres migration runner", () => {
  it("parses timestamped migration ids", () => {
    expect(parseMigrationId("20260623000000_app_foundation")).toBe(
      "20260623000000_app_foundation",
    );
    expect(parseMigrationId("20260623000001_follow_up.sql")).toBe(
      "20260623000001_follow_up",
    );
    expect(() => parseMigrationId("app_foundation.sql")).toThrow(
      /invalid migration name/,
    );
  });

  it("loads directory and sql-file migrations in order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "senticor-migrations-"));
    await mkdir(join(directory, "20260623000002_second"));
    await writeFile(
      join(directory, "20260623000002_second", "migration.sql"),
      "select 2;",
    );
    await writeFile(join(directory, "20260623000001_first.sql"), "select 1;");

    const migrations = await loadMigrations(directory);

    expect(migrations.map((migration) => migration.id)).toEqual([
      "20260623000001_first",
      "20260623000002_second",
    ]);
    expect(migrations[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects known pooled database URLs for migrations", () => {
    expect(() =>
      resolveDatabaseUrl({
        APP_PG_URL: "postgres://app:app@pgbouncer:6432/app",
      }),
    ).toThrow(/APP_PG_DIRECT_URL/);
    expect(
      resolveDatabaseUrl({
        APP_PG_DIRECT_URL: "postgres://app:app@postgres:5432/app",
      }).source,
    ).toBe("APP_PG_DIRECT_URL");
  });

  it("ships baseline migrations for preferences, mailboxes, and RBAC", async () => {
    const migrations = await loadMigrations(
      "packages/app-store-postgres/migrations",
    );
    const sql = migrations.map((migration) => migration.sql).join("\n");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_user_preferences");
    expect(sql).toContain(
      "navigation_auto_expand boolean NOT NULL DEFAULT true",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_mailbox_messages");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_rbac_roles");
    expect(sql).toContain("'citizen'");
    expect(sql).toContain("'caseworker'");
  });

  it("ships the PM/board + intake + automation schema and the append-only audit lock", async () => {
    const migrations = await loadMigrations(
      "packages/app-store-postgres/migrations",
    );
    const sql = migrations.map((migration) => migration.sql).join("\n");

    // Phase-7 / PM-Board + Intake (belebt durch task-store).
    for (const table of [
      "app_tasks",
      "app_intake_items",
      "app_task_comments",
      "app_task_activity",
      "app_saved_views",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }

    // Automations-Engine-Schema (Outbox + idempotente Läufe).
    for (const table of [
      "app_automation_rules",
      "app_automation_events",
      "app_automation_runs",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    // Idempotenz-Riegel: ein Event darf je Regel nur EINEN Lauf erzeugen.
    expect(sql).toContain("UNIQUE (rule_id, idempotency_key)");

    // Zuständigkeit: der PK von app_actor_roles wurde um authority_id erweitert (Multi-Behörden-Rollen).
    expect(sql).toContain(
      "ADD PRIMARY KEY (tenant_id, actor_id, role_key, authority_id)",
    );

    // Aufgaben-Beziehungen (Plane-Parität) mit Selbstreferenz-CHECK.
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_task_relations");
    expect(sql).toContain("CHECK (task_id <> related_task_id)");

    // Append-only-Audit: REVOKE + BEFORE-Trigger (bindet auch den Tabellen-Owner).
    expect(sql).toContain("REVOKE UPDATE, DELETE ON app_audit_events");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION app_audit_events_immutable",
    );
    expect(sql).toContain("CREATE TRIGGER app_audit_events_no_mutation");

    // Wiki-Versionierung (#20): mutabler Kopf + append-only Revisionen (belebt durch wiki-store).
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_wiki_articles");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_wiki_revisions");
    // Der Kopf ist je Mandant eindeutig; die Revision je (Mandant, Artikel, Version).
    expect(sql).toContain("PRIMARY KEY (tenant_id, article_id, version)");
    // NUR die Revisionen sind append-only verriegelt — der KOPF bleibt mutabel (Version-Bump).
    expect(sql).toContain(
      "REVOKE UPDATE, DELETE, TRUNCATE ON app_wiki_revisions",
    );
    expect(sql).toContain("CREATE TRIGGER app_wiki_revisions_no_mutation");
    expect(sql).not.toContain("REVOKE UPDATE, DELETE ON app_wiki_articles");
    // Wiki-RBAC-Grants: die caseworker-Rolle darf lesen/schreiben (sonst 403 in PROD trotz vorhandener Routen).
    expect(sql).toContain("('wiki.read',");
    expect(sql).toContain("('caseworker', 'wiki.read')");
    expect(sql).toContain("('caseworker', 'wiki.write')");
  });

  it("keeps preference and mailbox semantics testable without a database", async () => {
    const messages: MailboxMessage[] = [
      {
        messageId: "msg.citizen.inbox",
        box: "inbox",
        audience: "citizen",
        tenantId: "tenant.local",
        authorityId: "authority.local",
        jurisdictionId: "de",
        ownerActorId: "citizen-anna-muster",
        caseId: null,
        subject: "Rückfrage",
        bodyPreview: "Bitte prüfen Sie die Angaben.",
        status: "unread",
        createdAt: "2026-06-23T10:00:00.000Z",
      },
    ];
    const store = new InMemoryAppStore({ messages });

    await expect(
      store.saveUserPreferences({
        tenantId: "tenant.local",
        actorId: "citizen-anna-muster",
        update: {
          colorScheme: "dark",
          accessibility: { largeText: true },
          navigation: { sidebarAutoExpand: false },
        },
      }),
    ).resolves.toMatchObject({
      colorScheme: "dark",
      accessibility: { largeText: true },
      navigation: { sidebarAutoExpand: false },
    });

    await expect(
      store.listMailboxMessages({
        tenantId: "tenant.local",
        authorityId: "authority.local",
        actorId: "citizen-anna-muster",
        audience: "citizen",
        box: "inbox",
        scope: "owner",
      }),
    ).resolves.toHaveLength(1);

    await expect(
      store.saveMailboxMessage({
        ...messages[0]!,
        messageId: "msg.citizen.outbox",
        box: "outbox",
        status: "sent",
      }),
    ).resolves.toMatchObject({
      messageId: "msg.citizen.outbox",
      box: "outbox",
      status: "sent",
    });

    await expect(
      store.listMailboxMessages({
        tenantId: "tenant.local",
        authorityId: "authority.local",
        actorId: "citizen-anna-muster",
        audience: "citizen",
        box: "outbox",
        scope: "owner",
      }),
    ).resolves.toHaveLength(1);
  });
});
