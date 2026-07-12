import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPgClient } from "./client.js";

// Paketwurzel relativ zu DIESER Datei (src/ ODER dist/, beide liegen eine Ebene über der Wurzel) —
// NICHT relativ zu process.cwd(). `db:migrate` läuft normalerweise über
// `pnpm --filter @senticor/app-store-postgres db:migrate`, das cwd auf DIESES Paket setzt, nicht auf
// die Repo-Wurzel — ein cwd-relativer Default hängt sonst vom Aufrufkontext ab und zeigt ins Leere.
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export interface MigrationFile {
  id: string;
  path: string;
  checksumSha256: string;
  sql: string;
}

export interface DatabaseUrlResolution {
  url: string;
  source: "APP_PG_DIRECT_URL" | "APP_PG_URL";
  direct: boolean;
}

export interface MigrationOptions {
  databaseUrl: string;
  migrationsDir: string;
  migrationTable: string;
  advisoryLockId: bigint;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export function resolveDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseUrlResolution {
  const directUrl = env["APP_PG_DIRECT_URL"];
  if (directUrl) {
    return { url: directUrl, source: "APP_PG_DIRECT_URL", direct: true };
  }

  const pooledUrl = env["APP_PG_URL"];
  if (!pooledUrl) {
    throw new Error("APP_PG_DIRECT_URL or APP_PG_URL is required");
  }

  assertNotKnownPgbouncerUrl(pooledUrl);
  return { url: pooledUrl, source: "APP_PG_URL", direct: false };
}

export function defaultMigrationOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MigrationOptions {
  const resolved = resolveDatabaseUrl(env);
  return {
    databaseUrl: resolved.url,
    migrationsDir: env["APP_MIGRATIONS_DIR"] ?? join(packageRoot, "migrations"),
    migrationTable: env["APP_MIGRATION_TABLE"] ?? "app_schema_migrations",
    advisoryLockId: BigInt(env["APP_MIGRATION_LOCK_ID"] ?? "5311101"),
  };
}

export function parseMigrationId(entryName: string): string {
  const withoutExtension =
    extname(entryName) === ".sql" ? basename(entryName, ".sql") : entryName;
  if (!/^\d{14}_[a-z0-9_]+$/.test(withoutExtension)) {
    throw new Error(
      `invalid migration name "${entryName}"; expected YYYYMMDDHHMMSS_name`,
    );
  }
  return withoutExtension;
}

export async function loadMigrations(
  migrationsDir: string,
): Promise<MigrationFile[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles: MigrationFile[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    let migrationPath: string | undefined;
    let migrationId: string | undefined;

    if (entry.isDirectory()) {
      migrationId = parseMigrationId(entry.name);
      migrationPath = join(migrationsDir, entry.name, "migration.sql");
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      migrationId = parseMigrationId(entry.name);
      migrationPath = join(migrationsDir, entry.name);
    }

    if (!migrationId || !migrationPath) {
      continue;
    }

    if (seen.has(migrationId)) {
      throw new Error(`duplicate migration id "${migrationId}"`);
    }
    seen.add(migrationId);

    const sql = await readFile(migrationPath, "utf8");
    migrationFiles.push({
      id: migrationId,
      path: migrationPath,
      checksumSha256: createHash("sha256").update(sql).digest("hex"),
      sql,
    });
  }

  return migrationFiles.sort((left, right) => left.id.localeCompare(right.id));
}

export async function migrate(
  options: MigrationOptions = defaultMigrationOptionsFromEnv(),
): Promise<MigrationResult> {
  const migrationTable = quoteIdentifier(options.migrationTable);
  const migrations = await loadMigrations(options.migrationsDir);
  const client = await createPgClient(options.databaseUrl);
  const applied: string[] = [];
  const skipped: string[] = [];

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [
      options.advisoryLockId.toString(),
    ]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${migrationTable} (
        migration_id text PRIMARY KEY,
        checksum_sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const existing = await client.query<{
      migration_id: string;
      checksum_sha256: string;
    }>(
      `SELECT migration_id, checksum_sha256 FROM ${migrationTable} ORDER BY migration_id`,
    );
    const appliedChecksums = new Map(
      existing.rows.map((row) => [row.migration_id, row.checksum_sha256]),
    );

    for (const migration of migrations) {
      const knownChecksum = appliedChecksums.get(migration.id);
      if (knownChecksum) {
        if (knownChecksum !== migration.checksumSha256) {
          throw new Error(
            `checksum drift for applied migration ${migration.id}`,
          );
        }
        skipped.push(migration.id);
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `INSERT INTO ${migrationTable} (migration_id, checksum_sha256) VALUES ($1, $2)`,
        [migration.id, migration.checksumSha256],
      );
      applied.push(migration.id);
    }

    await client.query("COMMIT");
    return { applied, skipped };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function assertNotKnownPgbouncerUrl(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port;
  if (
    hostname.includes("pgbouncer") ||
    hostname.includes("pooler") ||
    port === "6432"
  ) {
    throw new Error(
      "database migrations require APP_PG_DIRECT_URL; pooled PgBouncer URLs are rejected",
    );
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(identifier)) {
    throw new Error(`invalid SQL identifier "${identifier}"`);
  }
  return identifier
    .split(".")
    .map((part) => `"${part.replaceAll('"', '""')}"`)
    .join(".");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            ok: true,
            applied: result.applied,
            skipped: result.skipped,
          },
          null,
          2,
        ),
      );
    })
    .catch((error: unknown) => {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    });
}
