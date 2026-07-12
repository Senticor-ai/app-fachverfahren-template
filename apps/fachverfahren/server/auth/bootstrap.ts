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
  bootstrapToken: string | undefined;
  now?: () => Date;
  generateId?: (prefix: string) => string;
}

export interface BootstrapInput {
  token: string;
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

/**
 * First-user bootstrap (kanban plan decision 3): requires the operator's
 * `BOOTSTRAP_TOKEN`, and — critically — becomes permanently unavailable for
 * a tenant the moment any user exists in it, which is what makes a second
 * bootstrap call impossible regardless of whether the token is known. Real
 * concurrent-request race protection (a Postgres advisory lock held across
 * this whole call) is the HTTP route's job, not this function's — this
 * function is deliberately store-agnostic so it stays unit-testable against
 * in-memory stores.
 */
export async function bootstrapWorkspace(
  deps: BootstrapDeps,
  input: BootstrapInput,
): Promise<BootstrapResult> {
  if (!deps.bootstrapToken || input.token !== deps.bootstrapToken) {
    throw new BootstrapError(
      "invalid-token",
      "bootstrap token is missing or incorrect",
    );
  }

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
    createdAt: nowIso,
    updatedAt: nowIso,
  });

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

  const board = await seedDiscoveryBoard(
    deps.kanbanStore,
    {
      tenantId,
      authorityId: DEFAULT_AUTHORITY_ID,
      jurisdictionId: DEFAULT_JURISDICTION_ID,
      ownerActorId: actorId,
      contentLocale: input.contentLocale ?? "de",
      now,
    },
    { generateId },
  );

  return { user, board };
}
