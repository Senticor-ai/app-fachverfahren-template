// public-sector-sdk/session — die austauschbare IAM-/Session-Naht (VORBEREITUNG für OIDC/BundID/Servicekonto).
//
// Die Autorisierung braucht eine authentifizierte Sitzung, deren Scope (Mandant/Behörde) + Rechte AUSSCHLIESSLICH aus
// der SERVER-Session kommen, NIE aus dem Client. Diese Naht ist framework-neutral (kein Fastify/HTTP): ein
// `SessionResolver` bekommt eine Header-/Cookie-Map (der Server-Adapter reicht sie herein) und liefert eine
// `CaseworkerSession`. Zwei Adapter: `headerSessionResolver` (DEV, x-*-Header, kein IdP) und `oidcSessionResolver`
// (PROD-SEAM: Bearer-Token → injizierte Verifikation → Claims → Sitzung). Der echte JWKS-/OIDC-Verifier ist ein
// austauschbarer `verify`-Callback (Test = Fake, PROD = z. B. jose/JWKS gegen den IdP) — so ist die IAM-Anbindung
// vorbereitet und TESTBAR, ohne einen laufenden Identity-Provider zu brauchen.
import type { CaseworkerSession } from "./case-service.js";

/** eIDAS-Vertrauensniveau (assurance level, aus dem OIDC-`acr`-Claim). Steuert, welche Aktionen erlaubt sind. */
export type AssuranceLevel = "niedrig" | "substanziell" | "hoch";

/** Rohe Identitäts-Claims aus einem IdP (OIDC-ID-Token / BundID / Servicekonto / Mein Unternehmenskonto) —
 *  vendor-neutral. `tenantId`/`authorityId` kommen aus einem vertrauenswürdigen Claim (Mandanten-Scope), NIE aus
 *  einer vom Client kontrollierten Quelle. */
export interface IdentityClaims {
  /** OIDC `sub` — die stabile Subjekt-Kennung (= actorId). */
  subject: string;
  displayName?: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId?: string;
  /** eIDAS-Niveau aus `acr`. */
  assuranceLevel?: AssuranceLevel;
  /** Effektive Rechte (aus Rollen abgeleitet, RBAC). */
  permissions?: string[];
  roles?: string[];
}

/** Reine Abbildung Claims → Sitzung. Fail-closed: ohne `subject`/`tenantId`/`authorityId` KEINE Sitzung. */
export function claimsToSession(
  claims: IdentityClaims,
): CaseworkerSession | undefined {
  if (!claims.subject || !claims.tenantId || !claims.authorityId)
    return undefined;
  return {
    actorId: claims.subject,
    tenantId: claims.tenantId,
    authorityId: claims.authorityId,
    jurisdictionId: claims.jurisdictionId ?? "de",
    permissions: claims.permissions ?? [],
  };
}

const ASSURANCE_ORDNUNG: Record<AssuranceLevel, number> = {
  niedrig: 1,
  substanziell: 2,
  hoch: 3,
};

/** eIDAS-Gate (rein): erfüllt das vorhandene Vertrauensniveau das Minimum? Kritische Entscheidungen (Festsetzung,
 *  Bescheid) sollten mindestens `substanziell` verlangen. Fehlt das Niveau, gilt `niedrig`. */
export function erfuelltAssurance(
  vorhanden: AssuranceLevel | undefined,
  minimum: AssuranceLevel,
): boolean {
  return (
    ASSURANCE_ORDNUNG[vorhanden ?? "niedrig"] >= ASSURANCE_ORDNUNG[minimum]
  );
}

/** Eine framework-neutrale Anfrage (nur Header) — der Server-Adapter (Fastify) reicht `request.headers` herein. */
export interface SessionRequest {
  headers: Record<string, string | string[] | undefined>;
}

/** Löst die authentifizierte Sitzung aus einer Anfrage auf (oder `undefined` → 401). */
export type SessionResolver = (
  req: SessionRequest,
) => CaseworkerSession | undefined;

function headerWert(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** DEV/Test-Resolver: Sitzung aus `x-*`-Headern (kein IdP). Rechte als kommagetrennte `x-permissions`. */
export function headerSessionResolver(): SessionResolver {
  return (req) => {
    const h = req.headers;
    const subject = headerWert(h["x-actor-id"]);
    const tenantId = headerWert(h["x-tenant-id"]);
    const authorityId = headerWert(h["x-authority-id"]);
    if (!subject || !tenantId || !authorityId) return undefined;
    const permissions = (headerWert(h["x-permissions"]) ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const assuranceLevel = headerWert(h["x-assurance-level"]) as
      | AssuranceLevel
      | undefined;
    return claimsToSession({
      subject,
      tenantId,
      authorityId,
      ...(headerWert(h["x-jurisdiction-id"])
        ? { jurisdictionId: headerWert(h["x-jurisdiction-id"])! }
        : {}),
      ...(assuranceLevel ? { assuranceLevel } : {}),
      permissions,
    });
  };
}

/**
 * PROD-SEAM: extrahiert das Bearer-Token aus `Authorization`, verifiziert es über den injizierten `verify`
 * (die eigentliche OIDC-/JWKS-Validierung — im Test ein Fake, in PROD z. B. `jose` gegen den IdP-`jwks_uri`), und
 * bildet die geprüften Claims auf eine Sitzung ab. Ohne gültiges Token: keine Sitzung. So ist die OIDC-Anbindung
 * VORBEREITET und testbar, ohne einen laufenden Identity-Provider.
 */
export function oidcSessionResolver(
  verify: (token: string) => IdentityClaims | undefined,
): SessionResolver {
  return (req) => {
    const auth = headerWert(req.headers["authorization"]);
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) return undefined;
    const claims = verify(token);
    return claims ? claimsToSession(claims) : undefined;
  };
}

/** Wählt den Resolver aus der Umgebung: liegt eine OIDC-`issuer`-Konfiguration vor, MUSS ein echter Verifier
 *  gebaut werden (hier nur die Weiche — der konkrete JWKS-Verifier lebt im Server-Adapter); sonst der DEV-Header-
 *  Resolver. Bewusst KEIN Default-Bau eines unsicheren „Fake-OIDC" in PROD. */
export function resolverFromEnv(
  env: Record<string, string | undefined>,
  buildOidcVerify?: (
    issuer: string,
  ) => (token: string) => IdentityClaims | undefined,
): SessionResolver {
  const issuer = env["OIDC_ISSUER"];
  if (issuer && buildOidcVerify)
    return oidcSessionResolver(buildOidcVerify(issuer));
  return headerSessionResolver();
}
