import { randomUUID } from "node:crypto";
import type {
  AuditStore,
  AuthStore,
  UserAccount,
  UserPersona,
  UserRole,
} from "@senticor/app-store-postgres";
import { hashPassword } from "@senticor/provider-local-auth";
import { MINIMUM_PASSWORD_LENGTH } from "./bootstrap.js";
import { DEFAULT_AUTHORITY_ID, DEFAULT_JURISDICTION_ID } from "./constants.js";

interface DemoUserDefinition {
  email: string;
  displayName: string;
  role: UserRole;
  persona: UserPersona;
}

const DEMO_USERS: readonly DemoUserDefinition[] = [
  {
    email: "demo.sachbearbeitung@example.org",
    displayName: "Demo Sachbearbeitung",
    role: "member",
    persona: "sachbearbeitung",
  },
  {
    email: "demo.aufsicht@example.org",
    displayName: "Demo Aufsicht",
    role: "member",
    persona: "aufsicht",
  },
  {
    email: "demo.buerger@example.org",
    displayName: "Demo Bürger:in",
    role: "citizen",
    persona: "buerger",
  },
];

export interface DemoSeedDeps {
  authStore: AuthStore;
  auditStore: AuditStore;
  now?: () => Date;
  generateId?: (prefix: string) => string;
  log?: (
    level: "info" | "error",
    event: string,
    fields: Record<string, unknown>,
  ) => void;
}

export interface DemoSeedInput {
  tenantId: string;
  demoMode: boolean;
  password?: string | undefined;
}

export interface DemoSeedOutcome {
  created: number;
  existing: number;
  failed: number;
}

function defaultGenerateId(prefix: string): string {
  return `${prefix}.${randomUUID()}`;
}

/** Seedet ausschließlich Konten. Persönliche Starter-Boards werden absichtlich
 * nicht erzeugt; das gemeinsame Discovery-Board stammt aus dem Admin-Bootstrap. */
export async function seedDemoUsers(
  deps: DemoSeedDeps,
  input: DemoSeedInput,
): Promise<DemoSeedOutcome> {
  const log = deps.log ?? (() => undefined);
  if (!input.demoMode) {
    log("info", "runtime.auth.demo-seed.skipped", { reason: "disabled" });
    return { created: 0, existing: 0, failed: 0 };
  }
  if (!input.password) {
    log("info", "runtime.auth.demo-seed.skipped", {
      reason: "missing-password",
    });
    return { created: 0, existing: 0, failed: 0 };
  }
  if (input.password.length < MINIMUM_PASSWORD_LENGTH) {
    log("error", "runtime.auth.demo-seed.skipped", {
      reason: "weak-password",
      minimumLength: MINIMUM_PASSWORD_LENGTH,
    });
    return { created: 0, existing: 0, failed: 0 };
  }

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(input.password);
  } catch (error) {
    log("error", "runtime.auth.demo-seed.failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return { created: 0, existing: 0, failed: DEMO_USERS.length };
  }

  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? defaultGenerateId;
  const outcome: DemoSeedOutcome = { created: 0, existing: 0, failed: 0 };

  for (const definition of DEMO_USERS) {
    try {
      const existing = await deps.authStore.getUserByEmail({
        tenantId: input.tenantId,
        email: definition.email,
      });
      if (existing) {
        outcome.existing += 1;
        log("info", "runtime.auth.demo-seed.user-skipped", {
          email: definition.email,
          reason: "already-exists",
        });
        continue;
      }

      const timestamp = now().toISOString();
      const actorId = generateId("actor");
      const user: UserAccount = {
        actorId,
        tenantId: input.tenantId,
        authorityId: DEFAULT_AUTHORITY_ID,
        jurisdictionId: DEFAULT_JURISDICTION_ID,
        email: definition.email,
        displayName: definition.displayName,
        status: "active",
        role: definition.role,
        localPersonas: [definition.persona],
        oidcPersonas: [],
        personaManagementMode: "local",
        principalVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const created = await deps.authStore.createLocalUserWithCredential({
        user,
        credential: {
          actorId,
          passwordHash,
          hashAlgo: "argon2id",
          passwordChangedAt: timestamp,
          failedAttempts: 0,
          lockedUntil: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      outcome.created += 1;

      try {
        await deps.auditStore.appendEvent({
          id: generateId("audit"),
          tenantId: input.tenantId,
          actorId: created.actorId,
          eventType: "USER_CREATED",
          occurredAt: timestamp,
          metadata: {
            email: created.email,
            role: created.role,
            via: "demo-seed",
          },
        });
      } catch (error) {
        log("error", "runtime.auth.demo-seed.audit-failed", {
          actorId: created.actorId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      outcome.failed += 1;
      log("error", "runtime.demo-seed.user-failed", {
        email: definition.email,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return outcome;
}
