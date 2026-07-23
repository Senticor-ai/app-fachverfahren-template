// deadline-worker — der zeitgetriebene Fristen-Scan-PROZESS (Issue #58). Fährt den reinen Motor
// (`runDeadlineScanForTenants`, `@senticor/app-store-postgres`) EINMAL über die konfigurierten Mandanten
// gegen den env-gewählten TaskStore und beendet sich dann — gedacht als K8s-CronJob/Scheduler-Tick
// (deterministisch: eine `nowIso`-Momentaufnahme pro Lauf). Der Store kommt aus `createTaskStoreFromEnv`
// (Postgres/chos/InMemory je APP_STORE_MODE), die Mandanten aus `APP_TENANT_IDS` (kommagetrennt) — für die
// Template-Referenz. Produktiv kann die Mandanten-Enumeration später aus einer Tenant-Registry kommen.
import { pathToFileURL } from "node:url";
import {
  createTaskStoreFromEnv,
  runDeadlineScanForTenants,
  type TaskStore,
} from "@senticor/app-store-postgres";

export interface DeadlineWorkerResult {
  tenants: number;
  fired: number;
  perTenant: { tenantId: string; fired: number }[];
}

/** Testbarer Kern: scannt die gegebenen Mandanten EINMAL. Kein Prozess-Exit, keine env-Lesung, injizierte Zeit. */
export async function runDeadlineWorker(input: {
  taskStore: TaskStore;
  tenantIds: readonly string[];
  nowIso: string;
}): Promise<DeadlineWorkerResult> {
  const perTenant = await runDeadlineScanForTenants({
    taskStore: input.taskStore,
    tenantIds: input.tenantIds,
    nowIso: input.nowIso,
  });
  return {
    tenants: perTenant.length,
    fired: perTenant.reduce((sum, t) => sum + t.fired, 0),
    perTenant,
  };
}

/** Mandanten aus `APP_TENANT_IDS` (kommagetrennt, getrimmt, leere verworfen). Ungesetzt → []. */
export function tenantIdsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return (env["APP_TENANT_IDS"] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** CLI-Einstieg: env-verdrahtet, ein Tick, strukturiertes JSON-Log, Exit-Code (0 ok). Ohne Mandanten ein
 *  No-op (Warnung) statt Fehler — der CronJob soll nicht rot laufen, nur weil noch kein Mandant konfiguriert ist. */
export async function main(
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const tenantIds = tenantIdsFromEnv(env);
  if (tenantIds.length === 0) {
    console.error(
      JSON.stringify({
        level: "warn",
        event: "deadline-worker.no-tenants",
        hint: "APP_TENANT_IDS (kommagetrennt) setzen",
      }),
    );
    return 0;
  }
  const taskStore = createTaskStoreFromEnv(env);
  const result = await runDeadlineWorker({
    taskStore,
    tenantIds,
    nowIso: new Date().toISOString(),
  });
  console.error(
    JSON.stringify({ level: "info", event: "deadline-worker.tick", ...result }),
  );
  return 0;
}

// Direkt-Start (CronJob-Tick): fahren + Exit. Muster wie server/index.ts.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          event: "deadline-worker.failed",
          error: String(error),
        }),
      );
      process.exit(1);
    });
}
