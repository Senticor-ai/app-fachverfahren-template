import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  sessionExpiryIso,
} from "./session-token.js";

describe("session token utilities", () => {
  it("generates a random, sufficiently long, URL-safe token each time", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes a token deterministically, so the same token always looks up the same session", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("hashes different tokens to different values", () => {
    expect(hashSessionToken("token-a")).not.toBe(hashSessionToken("token-b"));
  });

  it("does not persist anything resembling the raw token in its hash", () => {
    const token = "a-very-recognizable-raw-token-value";
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("computes an expiry timestamp offset from now by the default TTL", () => {
    const now = new Date("2026-07-11T10:00:00.000Z");
    expect(sessionExpiryIso(now)).toBe(
      new Date(now.getTime() + DEFAULT_SESSION_TTL_MS).toISOString(),
    );
  });
});
