import { createHash, randomBytes } from "node:crypto";

export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Raw bearer token that goes into the session cookie — never persisted as-is. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Session identifiers are hashed at rest (kanban plan decision 2). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiryIso(
  now: Date,
  ttlMs: number = DEFAULT_SESSION_TTL_MS,
): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}
