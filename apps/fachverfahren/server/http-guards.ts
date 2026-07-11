// server/http-guards — die server-autoritativen HTTP-Guards als EINE Wahrheit für den Monolithen (domain-api.ts)
// UND den kommenden ModuleHost: Session-Auflösung (401), Tenant-Pinning (403), einheitlicher RBAC-Deny (403) und die
// Ableitung des Mandanten-/Akteur-Scopes AUSSCHLIESSLICH aus der Server-Session (nie Query/Body).
//
// Reine Extraktion aus domain-api.ts (ModuleHost-Phase 0) — NULL Verhaltensänderung. Die Guards hängen bewusst nur an
// einer MINIMALEN Session-Naht (`SessionGuardDeps`), nicht an der vollen `DomainApiDeps`, damit http-guards NICHT auf
// den Monolithen zurück-importiert (kein Zyklus) und derselbe Guard vom ModuleHost wiederverwendbar ist.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { CaseworkerSession } from "@senticor/public-sector-sdk";

/** `Cache-Control: no-store` — Sitzungs- und Fehler-Antworten dürfen nie zwischengespeichert werden. */
export const NO_STORE = "no-store";

/** Die minimale Session-Naht, die die Guards brauchen — eine Teilmenge von `DomainApiDeps` (strukturell erfüllt). */
export interface SessionGuardDeps {
  /** Löst die authentifizierte Sitzung aus dem Request auf (Session-Cookie/OIDC in PROD; Header im DEV). */
  resolveSession: (request: FastifyRequest) => CaseworkerSession | undefined;
  /** OPTIONAL — Mandanten-Allowlist dieses Deployments (Tenant-Pinning, fail-closed). */
  allowedTenants?: readonly string[];
}

/** Der server-autoritative Scope, abgeleitet NUR aus der Session (nie aus Query/Body). Immutable — Downstream (Routen,
 *  ModuleHost) liest den Mandanten-/Akteur-Kontext ausschliesslich hieraus. */
export interface HttpScope {
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  actorId: string;
  permissions: readonly string[];
}

/** 401 (keine Sitzung) bzw. 403 (Tenant nicht bedient) — sonst die Sitzung. Der Mandanten-Scope kommt danach aus
 *  `session.tenantId`. TENANT-PINNING (fail-closed): bedient dieses Deployment eine feste Mandanten-Allowlist, wird
 *  ein fremder `tenantId` VERWEIGERT — selbst mit gültiger Sitzung (Schutz der geteilten DB gegen einen zu permissiven
 *  IdP/Header). Ohne Allowlist unverändert (rückwärtskompatibel). */
export function requireSession(
  deps: SessionGuardDeps,
  request: FastifyRequest,
  reply: FastifyReply,
): CaseworkerSession | undefined {
  const session = deps.resolveSession(request);
  if (!session) {
    reply
      .code(401)
      .header("Cache-Control", NO_STORE)
      .send({ error: "unauthorized" });
    return undefined;
  }
  if (
    deps.allowedTenants &&
    deps.allowedTenants.length > 0 &&
    !deps.allowedTenants.includes(session.tenantId)
  ) {
    forbidden(reply, "tenant-not-served");
    return undefined;
  }
  return session;
}

/** Einheitliche 403-Antwort (fehlendes Recht) — eine Wahrheit für den RBAC-Deny. */
export function forbidden(reply: FastifyReply, reason?: string): FastifyReply {
  return reply
    .code(403)
    .header("Cache-Control", NO_STORE)
    .send({ error: "forbidden", ...(reason ? { reason } : {}) });
}

/** Projiziert die Sitzung auf den reinen `HttpScope` — die EINE session-getriebene Scope-Ableitung, die Monolith und
 *  ModuleHost teilen. Trägt NUR die Scope-Felder (kein weiterer Request-Kontext) → Downstream kann keinen fremden
 *  Mandanten adressieren, indem es versehentlich Query/Body liest. */
export function scopeFromSession(session: CaseworkerSession): HttpScope {
  return {
    tenantId: session.tenantId,
    authorityId: session.authorityId,
    jurisdictionId: session.jurisdictionId,
    actorId: session.actorId,
    permissions: session.permissions,
  };
}
