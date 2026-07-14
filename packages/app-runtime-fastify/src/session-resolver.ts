// session-resolver — die Session-NAHT der Runtime: BFF-Routen fragen NUR dieses
// Interface; die App verdrahtet die echte Quelle (Cookie/AuthStore). Deny-by-default:
// NoSessionResolver liefert immer null → 401. Der Dev-Resolver existiert für
// Paket-Tests und lokale Experimente und ist DOPPELT verriegelt: nur mit
// APP_DEV_SESSION=true aktiv, Header-Overrides nur mit
// APP_TRUST_DEV_SESSION_HEADERS=true — die App verdrahtet ihn NIE per Default.
import type { FastifyRequest } from "fastify";
import { readHeader } from "./hooks.js";

export interface ResolvedSession {
  actorId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  rbacRoles: readonly string[];
}

export interface SessionResolver {
  resolve(request: FastifyRequest): Promise<ResolvedSession | null>;
}

export class NoSessionResolver implements SessionResolver {
  async resolve(_request: FastifyRequest): Promise<null> {
    return null;
  }
}

export function createDevSessionResolverFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SessionResolver | null {
  // Bewusst STRIKT "true" (nicht das tolerante parseBoolean): ein Tippfehler darf
  // niemals eine implizite Sitzung aktivieren.
  if (env["APP_DEV_SESSION"] !== "true") return null;
  const base: ResolvedSession = {
    actorId: env["APP_DEV_ACTOR_ID"] ?? "dev-actor",
    tenantId: env["APP_DEV_TENANT_ID"] ?? "default",
    authorityId: env["APP_DEV_AUTHORITY_ID"] ?? "dev-authority",
    jurisdictionId: env["APP_DEV_JURISDICTION_ID"] ?? "de",
    rbacRoles: parseRoles(env["APP_DEV_ROLES"]),
  };
  const trustHeaders = env["APP_TRUST_DEV_SESSION_HEADERS"] === "true";
  return {
    async resolve(request: FastifyRequest): Promise<ResolvedSession> {
      if (!trustHeaders) return base;
      const actorId = readHeader(request, "x-dev-actor-id");
      const roles = readHeader(request, "x-dev-roles");
      return {
        ...base,
        ...(actorId ? { actorId } : {}),
        ...(roles !== undefined ? { rbacRoles: parseRoles(roles) } : {}),
      };
    },
  };
}

function parseRoles(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
