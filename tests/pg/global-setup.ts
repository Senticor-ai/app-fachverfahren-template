// tests/pg/global-setup — startet EINEN echten Postgres-Container (testcontainers) für die
// Store-Vertragstests und macht ihn den Test-Workern über APP_PG_DIRECT_URL/APP_PG_URL bekannt. Damit
// laufen die `describe.skipIf(!pgUrl)`-Postgres-Pfade (packages/app-store-postgres) AUTOMATISCH gegen eine
// echte DB — „volle Container" statt manuell bereitgestelltem/CI-übersprungenem PG.
//
// GRACEFUL-SKIP: ist Docker nicht erreichbar (z. B. CI ohne Docker-Socket), wird KEINE URL gesetzt und der
// Lauf NICHT abgebrochen — die Store-Tests fallen dann auf InMemory/Fake zurück (skipIf). So bricht `test:pg`
// eine dockerlose Umgebung nicht, testet aber überall dort echt, wo Docker da ist.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from "testcontainers";

let container: StartedTestContainer | undefined;

export async function setup(): Promise<void> {
  try {
    container = await new GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "fachverfahren",
      })
      .withExposedPorts(5432)
      // „ready to accept connections" erscheint bei postgres ZWEIMAL (Init + finaler Start) — auf den
      // zweiten warten, sonst verbindet der Migrator zu früh.
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .withStartupTimeout(120_000)
      .start();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "pg-testcontainer.unavailable",
        hint: "Docker nicht erreichbar — Postgres-Tests laufen als InMemory/Fake (skipIf). Bei nicht-Standard-Runtimes (Rancher/colima) DOCKER_HOST + TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE auf den Socket setzen.",
        error: String(error),
      }),
    );
    return;
  }

  const url = `postgres://postgres:test@${container.getHost()}:${container.getMappedPort(
    5432,
  )}/fachverfahren`;
  // Module-Load-Zeit der Store-Tests liest process.env → in globalSetup gesetzt, vererben die (danach
  // geforkten) Worker die Variablen.
  process.env["APP_PG_DIRECT_URL"] = url;
  process.env["APP_PG_URL"] = url;

  // Migrationen über den GEBAUTEN Runner (löst den migrations-Pfad relativ zu sich selbst auf, CWD-sicher).
  const migrate = fileURLToPath(
    new URL(
      "../../packages/app-store-postgres/dist/migrate.js",
      import.meta.url,
    ),
  );
  execFileSync("node", [migrate], {
    env: { ...process.env, APP_PG_DIRECT_URL: url },
    stdio: "ignore",
  });
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
