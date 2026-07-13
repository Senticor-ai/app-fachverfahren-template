import { randomUUID } from "node:crypto";
import type {
  AuditStore,
  AuthStore,
  KanbanStore,
} from "@senticor/app-store-postgres";
import { bootstrapWorkspace, DEFAULT_TENANT_ID } from "./bootstrap.js";

export type AutoBootstrapOutcome =
  "created" | "skipped-existing" | "skipped-unconfigured" | "failed";

export interface AutoBootstrapDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  auditStore: AuditStore;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  generateId?: (prefix: string) => string;
  log?: (
    level: "info" | "error",
    event: string,
    fields: Record<string, unknown>,
  ) => void;
}

/** Auto-Bootstrap beim Serverstart (Fresh-Deployment-Akzeptanz): sind
 *  AUTH_BOOTSTRAP_ADMIN_EMAIL und AUTH_BOOTSTRAP_ADMIN_PASSWORD gesetzt und existiert
 *  noch KEIN Benutzer, wird das Admin-Konto samt Team-Discovery-Board angelegt —
 *  idempotent über countUsers + Bootstrap-Lock; ein Deployment braucht damit nur noch
 *  Env-Variablen, kein manuelles „Workspace einrichten".
 *
 *  Wirft NIE: Fehlkonfiguration oder DB-Ausfall werden laut geloggt, der Server
 *  startet trotzdem (die Landing samt Anmeldung funktioniert weiterhin).
 *  Das Passwort erscheint in keinem Logfeld. */
function defaultGenerateId(prefix: string): string {
  return `${prefix}.${randomUUID()}`;
}

export async function autoBootstrapAdminFromEnv(
  deps: AutoBootstrapDeps,
): Promise<AutoBootstrapOutcome> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? (() => undefined);
  const email = env["AUTH_BOOTSTRAP_ADMIN_EMAIL"]?.trim();
  const password = env["AUTH_BOOTSTRAP_ADMIN_PASSWORD"];
  const displayName =
    env["AUTH_BOOTSTRAP_ADMIN_NAME"]?.trim() || "Administrator:in";

  if (!email && !password) {
    log("info", "runtime.auth.bootstrap.skipped", {
      reason: "unconfigured",
    });
    return "skipped-unconfigured";
  }
  if (!email || !password) {
    log("error", "runtime.auth.bootstrap.failed", {
      reason:
        "AUTH_BOOTSTRAP_ADMIN_EMAIL und AUTH_BOOTSTRAP_ADMIN_PASSWORD müssen BEIDE gesetzt sein",
    });
    return "failed";
  }

  try {
    return await deps.authStore.withBootstrapLock(
      DEFAULT_TENANT_ID,
      async (): Promise<AutoBootstrapOutcome> => {
        const existing = await deps.authStore.countUsers({
          tenantId: DEFAULT_TENANT_ID,
        });
        if (existing > 0) {
          log("info", "runtime.auth.bootstrap.skipped", {
            reason: "already-bootstrapped",
          });
          return "skipped-existing";
        }
        const result = await bootstrapWorkspace(
          {
            authStore: deps.authStore,
            kanbanStore: deps.kanbanStore,
            ...(deps.now ? { now: deps.now } : {}),
            ...(deps.generateId ? { generateId: deps.generateId } : {}),
          },
          { email, password, displayName },
        );
        // Auch der Env-Bootstrap ist eine sicherheitsrelevante Konto-Anlage — ohne
        // dieses Event hätte ausgerechnet das erste privilegierte Konto keine
        // Audit-Evidenz (Codex-Review PR #27). Fehler loggen, aber nicht werfen.
        try {
          await deps.auditStore.appendEvent({
            id: (deps.generateId ?? defaultGenerateId)("audit"),
            tenantId: DEFAULT_TENANT_ID,
            actorId: result.user.actorId,
            eventType: "USER_CREATED",
            occurredAt: (deps.now ?? (() => new Date()))().toISOString(),
            metadata: {
              email: result.user.email,
              role: result.user.role,
              via: "startup-env",
            },
          });
        } catch (error) {
          log("error", "runtime.auth.bootstrap.audit-failed", {
            reason: error instanceof Error ? error.message : String(error),
          });
        }
        log("info", "runtime.auth.bootstrap.created", {
          actorId: result.user.actorId,
          boardId: result.board.boardId,
        });
        return "created";
      },
    );
  } catch (error) {
    log("error", "runtime.auth.bootstrap.failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}
