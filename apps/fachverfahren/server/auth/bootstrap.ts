import { randomUUID } from "node:crypto";
import type {
  AuthStore,
  Board,
  KanbanStore,
  UserAccount,
} from "@senticor/app-store-postgres";
import { hashPassword } from "@senticor/provider-local-auth";
import {
  DEFAULT_AUTHORITY_ID,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_TENANT_ID,
} from "./constants.js";
import { seedDiscoveryBoard } from "./discovery-board.js";

export { DEFAULT_AUTHORITY_ID, DEFAULT_JURISDICTION_ID, DEFAULT_TENANT_ID };
export const MINIMUM_PASSWORD_LENGTH = 12;

export type BootstrapErrorCode =
  "invalid-token" | "already-bootstrapped" | "weak-password";

export class BootstrapError extends Error {
  constructor(
    public readonly code: BootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BootstrapError";
  }
}

export interface BootstrapDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  now?: () => Date;
  generateId?: (prefix: string) => string;
}

export interface BootstrapInput {
  email: string;
  password: string;
  displayName: string;
  tenantId?: string;
  contentLocale?: string;
}

export interface BootstrapResult {
  user: UserAccount;
  board: Board;
}

function defaultGenerateId(prefix: string): string {
  return `${prefix}.${randomUUID()}`;
}

/** Token-Gate des HTTP-Bootstraps — bewusst AUS `bootstrapWorkspace` herausgezogen:
 *  die Route ruft es vor dem Advisory-Lock; der vertrauenswürdige Startup-Pfad
 *  (Auto-Bootstrap aus Env-Variablen, auto-bootstrap.ts) ruft `bootstrapWorkspace`
 *  direkt — wer die Server-Env kontrolliert, braucht kein zweites Geheimnis. */
export function assertBootstrapToken(
  configuredToken: string | undefined,
  providedToken: string,
): void {
  if (!configuredToken || providedToken !== configuredToken) {
    throw new BootstrapError(
      "invalid-token",
      "bootstrap token is missing or incorrect",
    );
  }
}

/**
 * First-user bootstrap (kanban plan decision 3): becomes permanently
 * unavailable for a tenant the moment any user exists in it, which is what
 * makes a second bootstrap call impossible. Token gating lives in the HTTP
 * route (`assertBootstrapToken`); real concurrent-request race protection
 * (a Postgres advisory lock held across this whole call) is the caller's
 * job, not this function's — this function is deliberately store-agnostic
 * so it stays unit-testable against in-memory stores.
 */
export async function bootstrapWorkspace(
  deps: BootstrapDeps,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  const tenantId = input.tenantId ?? DEFAULT_TENANT_ID;
  const existingUsers = await deps.authStore.countUsers({ tenantId });
  if (existingUsers > 0) {
    throw new BootstrapError(
      "already-bootstrapped",
      "this workspace has already completed setup",
    );
  }

  if (input.password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new BootstrapError(
      "weak-password",
      `password must be at least ${MINIMUM_PASSWORD_LENGTH} characters`,
    );
  }

  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const generateId = deps.generateId ?? defaultGenerateId;
  const actorId = generateId("actor");

  const user = await deps.authStore.createUser({
    actorId,
    tenantId,
    authorityId: DEFAULT_AUTHORITY_ID,
    jurisdictionId: DEFAULT_JURISDICTION_ID,
    email: input.email,
    displayName: input.displayName,
    status: "active",
    role: "admin",
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // Rollback-Grenze: scheitert NACH dem User-Insert irgendetwas (Credential-Persistenz,
  // Discovery-Board-Seed), würde `countUsers() > 0` den Tenant dauerhaft als „bootstrapped"
  // melden — ohne Credential wäre der Workspace unbenutzbar UND nicht erneut einrichtbar.
  // Auth- und Kanban-Store teilen keine Verbindung (jeder Call öffnet seine eigene), eine
  // echte DB-Transaktion über beide gibt es daher nicht; die Kompensations-Löschung stellt
  // `countUsers() === 0` wieder her, sodass der Operator das Setup erneut versuchen kann.
  try {
    const passwordHash = await hashPassword(input.password);
    await deps.authStore.createLocalCredential({
      actorId,
      passwordHash,
      hashAlgo: "argon2id",
      passwordChangedAt: nowIso,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Authentifizierung ≠ Autorisierung: auch der lokale Login läuft über das
    // Identity-Mapping (provider "local", subject = actorId) — ein späterer
    // OIDC-Provider hängt sich an dieselbe Naht, ohne die Autorisierung zu ändern.
    await deps.authStore.linkIdentity({
      tenantId,
      provider: "local",
      subject: actorId,
      actorId,
    });

    // Das Discovery-Board ist das GETEILTE Team-Board des Workspaces (Feature-Entscheid
    // „Beides"): team-sichtbar, damit jedes später angelegte Konto mitarbeiten kann.
    const board = await seedDiscoveryBoard(
      deps.kanbanStore,
      {
        tenantId,
        authorityId: DEFAULT_AUTHORITY_ID,
        jurisdictionId: DEFAULT_JURISDICTION_ID,
        ownerActorId: actorId,
        contentLocale: input.contentLocale ?? "de",
        visibility: "team",
        now,
      },
      { generateId },
    );

    return { user, board };
  } catch (error) {
    await deps.authStore.deleteUser({ tenantId, actorId }).catch(() => {
      // Best effort: schlägt auch die Kompensation fehl (z. B. DB weg), gewinnt der
      // ursprüngliche Fehler — er beschreibt die eigentliche Ursache.
    });
    throw error;
  }
}
