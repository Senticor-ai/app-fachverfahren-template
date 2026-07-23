// oidc — der PURE, testbare Kern des OIDC-Authorization-Code-Flows (PKCE) fuer Keycloak (Standard-OIDC via
// Discovery + JWKS). BEWUSST OHNE Fastify/DOM/Netz-Kopplung: fetch ist injizierbar, die Krypto kommt aus `jose`
// (bewaehrt, keine Hand-Krypto). Die Routen (auth/oidc-routes.ts) verdrahten das mit Cookies/Session.
//
// SICHERHEIT (defence-in-depth): Authorization Code + PKCE (S256, Public Client — KEIN Client-Secret noetig);
// `state` gegen CSRF; `nonce` gegen Replay; die ID-Token-Validierung prueft Signatur (JWKS) + issuer + audience
// + exp/nbf (jose) UND den nonce. Keine Auto-Provisionierung: der Callback loest den Actor nur ueber einen
// EXPLIZIT verlinkten Identity-Link auf (resolveActorForIdentity), sonst deny.
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, type JWTVerifyGetKey, type KeyLike } from "jose";

/** Ein Validierungs-/Protokollfehler des OIDC-Flows (fuer 401/400-Mapping in der Route). */
export class OidcError extends Error {}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** PKCE code_verifier — 32 zufaellige Bytes, URL-safe (43 Zeichen). */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

/** PKCE code_challenge (S256) aus dem Verifier — base64url(SHA-256(verifier)). */
export function codeChallengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/** Zufalls-Token fuer state (CSRF) bzw. nonce (Replay). */
export function randomToken(): string {
  return base64url(randomBytes(32));
}

// ── Discovery ──────────────────────────────────────────────────────────────────────────────────────────
export interface OidcEndpoints {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

function requireString(doc: Record<string, unknown>, key: string): string {
  const value = doc[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new OidcError(`OIDC discovery document missing ${key}`);
  }
  return value;
}

/** Das OpenID-Provider-Metadata-Dokument holen (`${issuer}/.well-known/openid-configuration`). fetch injizierbar. */
export async function discoverOidc(
  issuerUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OidcEndpoints> {
  const url = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new OidcError(`OIDC discovery failed (${res.status})`);
  const doc = (await res.json()) as Record<string, unknown>;
  return {
    issuer: requireString(doc, "issuer"),
    authorizationEndpoint: requireString(doc, "authorization_endpoint"),
    tokenEndpoint: requireString(doc, "token_endpoint"),
    jwksUri: requireString(doc, "jwks_uri"),
  };
}

// ── Authorization-Redirect ───────────────────────────────────────────────────────────────────────────────
export interface AuthorizationUrlInput {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  /** OIDC-Scopes; Default `openid profile email` (der Persona-Claim kommt aus dem Client-Scope-Mapper). */
  scope?: string;
}

/** Die Authorization-URL bauen (Response-Type code, PKCE S256, state, nonce). Rein/deterministisch (bis auf Inputs). */
export function buildAuthorizationUrl(input: AuthorizationUrlInput): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scope ?? "openid profile email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

// ── Token-Exchange ───────────────────────────────────────────────────────────────────────────────────────
export interface TokenSet {
  idToken: string;
  accessToken?: string;
}

/** Authorization Code gegen Tokens tauschen (PKCE: code_verifier statt Client-Secret). fetch injizierbar. */
export async function exchangeCodeForTokens(
  input: {
    tokenEndpoint: string;
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
  });
  const res = await fetchImpl(input.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new OidcError(`OIDC token exchange failed (${res.status})`);
  const doc = (await res.json()) as Record<string, unknown>;
  if (typeof doc["id_token"] !== "string") {
    throw new OidcError("OIDC token response missing id_token");
  }
  return {
    idToken: doc["id_token"],
    ...(typeof doc["access_token"] === "string"
      ? { accessToken: doc["access_token"] }
      : {}),
  };
}

// ── ID-Token-Validierung ─────────────────────────────────────────────────────────────────────────────────
export interface IdTokenClaims {
  subject: string;
  email?: string;
  name?: string;
  /** Die vollstaendige Payload (fuer den Persona-Claim-Parser). */
  raw: Record<string, unknown>;
}

/** Das ID-Token vollstaendig validieren: Signatur (JWKS) + issuer + audience + exp/nbf (jose) UND nonce + sub.
 *  `keySet` ist der jose-Key-Resolver (PROD: createRemoteJWKSet(jwks_uri); Test: der oeffentliche Schluessel). */
export async function validateIdToken(
  idToken: string,
  options: {
    keySet: JWTVerifyGetKey | KeyLike | Uint8Array;
    issuer: string;
    clientId: string;
    nonce: string;
  },
): Promise<IdTokenClaims> {
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(
      idToken,
      options.keySet as Parameters<typeof jwtVerify>[1],
      { issuer: options.issuer, audience: options.clientId },
    );
    payload = verified.payload as Record<string, unknown>;
  } catch (error) {
    throw new OidcError(
      `OIDC id token verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (payload["nonce"] !== options.nonce) {
    throw new OidcError("OIDC id token nonce mismatch");
  }
  const subject = payload["sub"];
  if (typeof subject !== "string" || subject.length === 0) {
    throw new OidcError("OIDC id token missing sub");
  }
  return {
    subject,
    ...(typeof payload["email"] === "string" ? { email: payload["email"] } : {}),
    ...(typeof payload["name"] === "string" ? { name: payload["name"] } : {}),
    raw: payload,
  };
}
