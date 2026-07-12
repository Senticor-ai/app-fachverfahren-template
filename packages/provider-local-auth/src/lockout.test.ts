import { describe, expect, it } from "vitest";
import {
  evaluateLoginAttempt,
  lockAfterFailure,
  LOGIN_FAILURE_THRESHOLD,
  LOGIN_LOCK_DURATION_MS,
} from "./lockout.js";

describe("evaluateLoginAttempt (local-auth rate limiting/lockout)", () => {
  it("allows an attempt when there is no lock", () => {
    const result = evaluateLoginAttempt({
      lockedUntil: null,
      now: new Date("2026-07-11T10:00:00Z"),
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks an attempt while a lock is still in the future", () => {
    const result = evaluateLoginAttempt({
      lockedUntil: new Date("2026-07-11T10:05:00Z"),
      now: new Date("2026-07-11T10:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.lockedUntil).toEqual(new Date("2026-07-11T10:05:00Z"));
  });

  it("allows an attempt again once a lock has expired — critically, without re-locking on its own", () => {
    const result = evaluateLoginAttempt({
      lockedUntil: new Date("2026-07-11T09:59:00Z"),
      now: new Date("2026-07-11T10:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.lockedUntil).toBeNull();
  });
});

describe("lockAfterFailure (deciding whether a fresh failure should lock the account)", () => {
  it("does not lock below the failure threshold", () => {
    expect(
      lockAfterFailure(
        LOGIN_FAILURE_THRESHOLD - 1,
        new Date("2026-07-11T10:00:00Z"),
      ),
    ).toBeNull();
  });

  it("locks once the failure threshold is reached, for the configured duration", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    const lockedUntil = lockAfterFailure(LOGIN_FAILURE_THRESHOLD, now);
    expect(lockedUntil?.getTime()).toBe(now.getTime() + LOGIN_LOCK_DURATION_MS);
  });

  it("keeps locking on every failure past the threshold, extending the lock", () => {
    const now = new Date("2026-07-11T10:00:00Z");
    const lockedUntil = lockAfterFailure(LOGIN_FAILURE_THRESHOLD + 3, now);
    expect(lockedUntil?.getTime()).toBe(now.getTime() + LOGIN_LOCK_DURATION_MS);
  });
});
