/** Failed attempts (inclusive) at which a local account gets temporarily locked. */
export const LOGIN_FAILURE_THRESHOLD = 5;

/** How long a lockout lasts once triggered. */
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export interface LoginGateState {
  lockedUntil: Date | null;
  now: Date;
}

export interface LoginGateDecision {
  allowed: boolean;
  lockedUntil: Date | null;
}

/**
 * Is a login attempt currently allowed, given the account's persisted lock
 * state (kanban plan decision 2)? Deliberately independent of the raw
 * failure count — re-deriving "locked" from `failedAttempts` on every check
 * would re-lock the account the instant an expired lock is evaluated again.
 * Use `lockAfterFailure` to decide, once, whether a fresh failure should set
 * a new `lockedUntil`.
 */
export function evaluateLoginAttempt(state: LoginGateState): LoginGateDecision {
  if (state.lockedUntil && state.lockedUntil.getTime() > state.now.getTime()) {
    return { allowed: false, lockedUntil: state.lockedUntil };
  }
  return { allowed: true, lockedUntil: null };
}

/**
 * After persisting a failed attempt, should the account now be locked, and
 * until when? Returns `null` below the threshold.
 */
export function lockAfterFailure(
  failedAttemptsAfterThisOne: number,
  now: Date,
): Date | null {
  return failedAttemptsAfterThisOne >= LOGIN_FAILURE_THRESHOLD
    ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS)
    : null;
}
