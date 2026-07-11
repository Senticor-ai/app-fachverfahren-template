import { describe, expect, it } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CaseworkerSession } from "@senticor/public-sector-sdk";
import {
  forbidden,
  requireSession,
  scopeFromSession,
  type SessionGuardDeps,
} from "./http-guards.js";

// Sichert die aus domain-api.ts gehobenen HTTP-Guards (ModuleHost-Phase 0) direkt ab: Session/401, Tenant-Pinning/403,
// RBAC-Deny/403 und die session-getriebene Scope-Ableitung. Verhaltensgleichheit zum Monolithen bezeugen zusätzlich
// die unveränderten domain-api.test.ts.

const SESSION: CaseworkerSession = {
  actorId: "sb.eins",
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  permissions: ["case.read", "inbox.read"],
};

/** Minimaler FastifyReply-Doppelgänger: protokolliert code/header/payload, chainbar wie Fastify. */
function mockReply() {
  const state: {
    code?: number;
    headers: Record<string, string>;
    payload?: unknown;
  } = { headers: {} };
  const reply = {
    code(c: number) {
      state.code = c;
      return reply;
    },
    header(k: string, v: string) {
      state.headers[k] = v;
      return reply;
    },
    send(p: unknown) {
      state.payload = p;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, state };
}

const req = {} as FastifyRequest;

describe("requireSession — Session/401 + Tenant-Pinning/403", () => {
  it("ohne Sitzung ⇒ 401 unauthorized (no-store), undefined", () => {
    const { reply, state } = mockReply();
    const deps: SessionGuardDeps = { resolveSession: () => undefined };
    expect(requireSession(deps, req, reply)).toBeUndefined();
    expect(state.code).toBe(401);
    expect(state.payload).toEqual({ error: "unauthorized" });
    expect(state.headers["Cache-Control"]).toBe("no-store");
  });

  it("mit Sitzung, keine Allowlist ⇒ Sitzung durch (kein Statuscode gesetzt)", () => {
    const { reply, state } = mockReply();
    const deps: SessionGuardDeps = { resolveSession: () => SESSION };
    expect(requireSession(deps, req, reply)).toBe(SESSION);
    expect(state.code).toBeUndefined();
  });

  it("fremder Mandant trotz Allowlist ⇒ 403 tenant-not-served (fail-closed)", () => {
    const { reply, state } = mockReply();
    const deps: SessionGuardDeps = {
      resolveSession: () => SESSION,
      allowedTenants: ["andere-mandantin"],
    };
    expect(requireSession(deps, req, reply)).toBeUndefined();
    expect(state.code).toBe(403);
    expect(state.payload).toEqual({
      error: "forbidden",
      reason: "tenant-not-served",
    });
  });

  it("bedienter Mandant in der Allowlist ⇒ Sitzung durch", () => {
    const { reply } = mockReply();
    const deps: SessionGuardDeps = {
      resolveSession: () => SESSION,
      allowedTenants: ["t1", "t2"],
    };
    expect(requireSession(deps, req, reply)).toBe(SESSION);
  });
});

describe("forbidden — einheitlicher RBAC-Deny", () => {
  it("ohne Grund ⇒ 403 forbidden (no-store)", () => {
    const { reply, state } = mockReply();
    forbidden(reply);
    expect(state.code).toBe(403);
    expect(state.payload).toEqual({ error: "forbidden" });
    expect(state.headers["Cache-Control"]).toBe("no-store");
  });

  it("mit Grund ⇒ 403 forbidden + reason", () => {
    const { reply, state } = mockReply();
    forbidden(reply, "inbox.read fehlt");
    expect(state.payload).toEqual({
      error: "forbidden",
      reason: "inbox.read fehlt",
    });
  });
});

describe("scopeFromSession — session-getriebener Scope", () => {
  it("projiziert genau die Scope-Felder (nichts aus Query/Body)", () => {
    expect(scopeFromSession(SESSION)).toEqual({
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      actorId: "sb.eins",
      permissions: ["case.read", "inbox.read"],
    });
  });

  it("liefert einen EINGEFRORENEN Scope (Laufzeit-Schutz gegen Mutation → kein Port-Umlenken)", () => {
    const scope = scopeFromSession(SESSION);
    expect(Object.isFrozen(scope)).toBe(true);
  });
});
