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

    // Collab-Härtung (Phase 0): app_task_activity += authority_id (Symmetrie zu app_task_comments) mit Backfill.
    expect(sql).toContain(
      "ALTER TABLE app_task_activity ADD COLUMN IF NOT EXISTS authority_id",
    );
    expect(sql).toContain("UPDATE app_task_activity a");
    // append-only-Riegel auf BEIDEN Collab-Tabellen (Spiegel des Audit-Riegels).
    expect(sql).toContain(
      "REVOKE UPDATE, DELETE, TRUNCATE ON app_task_comments",
    );
    expect(sql).toContain(
      "REVOKE UPDATE, DELETE, TRUNCATE ON app_task_activity",
    );
    expect(sql).toContain("CREATE TRIGGER app_task_comments_no_mutation");
    expect(sql).toContain("CREATE TRIGGER app_task_activity_no_mutation");
    expect(sql).toContain("CREATE TRIGGER app_task_comments_no_truncate");
    expect(sql).toContain("CREATE TRIGGER app_task_activity_no_truncate");

    // #15 fairer per-Tenant-Claim: fair_rank-Spalte + BEFORE-INSERT-Trigger (MAX+1 je Mandant) + Claim-Index.
    expect(sql).toContain(
      "ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS fair_rank",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION app_automation_events_fair_rank",
    );
    expect(sql).toContain("CREATE TRIGGER app_automation_events_fair_rank");
    expect(sql).toContain("app_automation_events_fairclaim_idx");
    // WFQ (virtual time): der Rang wird auf die globale Front (MIN pending) gehoben → kein Verhungern etablierter
    // Mandanten durch Rang-0-Neuzugaenge (Review-Fund). GREATEST(per-Tenant MAX+1, globales MIN).
    expect(sql).toContain("NEW.fair_rank := GREATEST(");
    expect(sql).toContain(
      "SELECT MIN(fair_rank) FROM app_automation_events WHERE processed_at IS NULL",
    );
  });

  it("ships the workspace foundation migration (roles, identity links, audit, board metadata)", async () => {
    const migrations = await loadMigrations(
      "packages/app-store-postgres/migrations",
    );
    const sql = migrations.map((migration) => migration.sql).join("\n");

    expect(sql).toContain("role text NOT NULL DEFAULT 'member'");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS app_identity_links");
    // Bestands-Konten bekommen ihren lokalen Identity-Link per Backfill (idempotent).
    expect(sql).toContain(
      "INSERT INTO app_identity_links (tenant_id, provider, subject, actor_id)",
    );
    expect(sql).toContain(
      "ON CONFLICT (tenant_id, provider, subject) DO NOTHING",
    );
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS app_workspace_audit_events",
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS purpose text NULL");
    // Kompensations-Löschung: owner-FK muss cascaden, sonst bleibt bei Seed-Teilfehlern
    // ein Zombie-Konto mit gültigem Initialpasswort zurück (Codex-Review PR #27).
    expect(sql).toContain(
      "FOREIGN KEY (owner_actor_id) REFERENCES app_users (actor_id) ON DELETE CASCADE",
    );
    // Backfills: frühester Benutzer je Tenant wird Admin; Discovery-Boards werden team-sichtbar.
    expect(sql).toContain("UPDATE app_users SET role = 'admin'");
    expect(sql).toContain("SET visibility = 'team'");
    expect(sql).toContain("'Fachverfahren Discovery Board'");
  });

  it("ships the user-personas migration (NULL-Legacy-Marker, fail-closed defaults, citizen role)", async () => {
    const migrations = await loadMigrations(
      "packages/app-store-postgres/migrations",
    );
    const sql = migrations.map((migration) => migration.sql).join("\n");

    // B1 replay-sicher: Spalte NULLABLE anlegen, NUR IS-NULL-Zeilen (= Bestand von VOR der
    // Einführung) backfillen, danach leerer Default + NOT NULL. Ein bewusst leeres Konto
    // ('{}') wird bei erneutem SQL-Lauf NICHT erneut befüllt.
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS local_personas text[];");
    expect(sql).toContain("WHERE local_personas IS NULL");
    expect(sql).toContain(
      "ALTER COLUMN local_personas SET DEFAULT ARRAY[]::text[]",
    );
    expect(sql).toContain("ALTER COLUMN local_personas SET NOT NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS oidc_personas text[];");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS persona_management_mode text NOT NULL DEFAULT 'local'",
    );
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS principal_version bigint NOT NULL DEFAULT 1",
    );
    // Kanonische Wertebereiche als benannte CHECKs (inkl. Verbot von NULL-Elementen und >3).
    expect(sql).toContain("app_users_local_personas_allowed");
    expect(sql).toContain("app_users_oidc_personas_allowed");
    expect(sql).toContain("app_users_persona_mode_allowed");
    expect(sql).toContain("array_position(local_personas, NULL) IS NULL");
    expect(sql).toContain("cardinality(local_personas) <= 3");
    // Workspace-Rolle citizen (Self-Signup) — inline-CHECK aus workspace_foundation ersetzt.
    expect(sql).toContain("app_users_role_check");
    expect(sql).toContain("role IN ('admin', 'member', 'citizen')");
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
