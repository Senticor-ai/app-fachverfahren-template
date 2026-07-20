// oidc-routes — die Fastify-Verdrahtung des OIDC-Flows (Keycloak, Authorization Code + PKCE). OPT-IN: nur
// registriert, wenn eine OidcConfig vorliegt (oidcConfigFromEnv). Nutzt den puren Kern (oidc.ts) + issueSession
// (dieselbe Session wie der lokale Login) + resolveActorForIdentity (KEINE Auto-Provisionierung — nur explizit
// verlinkte Identitaeten). Der Flow-State (state/nonce/code_verifier) lebt in einem kurzlebigen httpOnly-Cookie;
// der `state`-Vergleich in /callback ist der CSRF-Schutz, der `nonce` (im ID-Token) der Replay-Schutz.
import { createRemoteJWKSet } from "jose";
import type { AuthStore } from "@senticor/app-store-postgres";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteShorthandOptions,
} from "fastify";
import { DEFAULT_TENANT_ID } from "./bootstrap.js";
import { resolveActorForIdentity } from "./identity.js";
import {
  buildAuthorizationUrl,
  codeChallengeFor,
  discoverOidc,
  exchangeCodeForTokens,
  generateCodeVerifier,
  OidcError,
  randomToken,
  validateIdToken,
  type OidcEndpoints,
} from "./oidc.js";
import { issueSession } from "./routes.js";

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  /** Muss EXAKT mit der bei Keycloak registrierten Redirect-URI uebereinstimmen. */
  redirectUri: string;
  tenantId?: string;
  /** Wohin nach erfolgreichem Login (Default "/"). */
  postLoginRedirect?: string;
}

/** OIDC-Config aus der Umgebung — OPT-IN: nur mit Issuer + Client + Redirect (sonst kein OIDC, Vorlage laeuft). */
export function oidcConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OidcConfig | undefined {
  const issuerUrl = env["OIDC_ISSUER_URL"];
  const clientId = env["OIDC_CLIENT_ID"];
  const redirectUri = env["OIDC_REDIRECT_URI"];
  if (!issuerUrl || !clientId || !redirectUri) return undefined;
  return {
    issuerUrl,
    clientId,
    redirectUri,
    ...(env["OIDC_TENANT_ID"] ? { tenantId: env["OIDC_TENANT_ID"] } : {}),
    ...(env["OIDC_POST_LOGIN_REDIRECT"]
      ? { postLoginRedirect: env["OIDC_POST_LOGIN_REDIRECT"] }
      : {}),
  };
}

const FLOW_COOKIE = "oidc_flow";
const FLOW_COOKIE_PATH = "/auth/oidc";

interface FlowState {
  state: string;
  nonce: string;
  codeVerifier: string;
}

function setFlowCookie(reply: FastifyReply, flow: FlowState): void {
  reply.setCookie(FLOW_COOKIE, JSON.stringify(flow), {
    path: FLOW_COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 600,
  });
}

function readFlowCookie(request: FastifyRequest): FlowState | undefined {
  const raw = request.cookies?.[FLOW_COOKIE];
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed["state"] === "string" &&
      typeof parsed["nonce"] === "string" &&
      typeof parsed["codeVerifier"] === "string"
    ) {
      return {
        state: parsed["state"],
        nonce: parsed["nonce"],
        codeVerifier: parsed["codeVerifier"],
      };
    }
  } catch {
    // fehlerhaft -> als fehlend behandeln
  }
  return undefined;
}

export interface OidcRouteDeps {
  authStore: AuthStore;
  config: OidcConfig;
  /** Die routeAuth-Optionen fuer eine PUBLIC-Route (aus registerAuthRoutes) — die OIDC-Endpunkte sind der Login-Flow. */
  publicRoute: RouteShorthandOptions;
  /** fetch injizierbar (Mock-IdP im Test). */
  fetchImpl?: typeof fetch;
  /** JWKS-Key-Resolver injizierbar (Test); PROD: createRemoteJWKSet(jwks_uri). */
  keySetFor?: (jwksUri: string) => Parameters<typeof validateIdToken>[1]["keySet"];
  now?: () => Date;
}

export function registerOidcRoutes(
  app: FastifyInstance,
  deps: OidcRouteDeps,
): void {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? ((): Date => new Date());
  const tenantId = deps.config.tenantId ?? DEFAULT_TENANT_ID;
  const keySetFor =
    deps.keySetFor ??
    ((jwksUri: string) => createRemoteJWKSet(new URL(jwksUri)));

  let endpointsCache: OidcEndpoints | undefined;
  const endpoints = async (): Promise<OidcEndpoints> => {
    endpointsCache ??= await discoverOidc(deps.config.issuerUrl, fetchImpl);
    return endpointsCache;
  };

  // ── /auth/oidc/login — Redirect zum IdP (state/nonce/PKCE erzeugen + im Flow-Cookie ablegen) ──
  app.get("/auth/oidc/login", deps.publicRoute, async (request, reply) => {
    try {
      const ep = await endpoints();
      const flow: FlowState = {
        state: randomToken(),
        nonce: randomToken(),
        codeVerifier: generateCodeVerifier(),
      };
      setFlowCookie(reply, flow);
      const url = buildAuthorizationUrl({
        authorizationEndpoint: ep.authorizationEndpoint,
        clientId: deps.config.clientId,
        redirectUri: deps.config.redirectUri,
        state: flow.state,
        nonce: flow.nonce,
        codeChallenge: codeChallengeFor(flow.codeVerifier),
      });
      return reply.redirect(url);
    } catch (error) {
      request.log.error({ err: error }, "oidc.login.failed");
      return reply.code(502).send({ error: "oidc login unavailable" });
    }
  });

  // ── /auth/oidc/callback — Exchange -> validate -> resolve -> Session ──
  app.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>("/auth/oidc/callback", deps.publicRoute, async (request, reply) => {
    const flow = readFlowCookie(request);
    reply.clearCookie(FLOW_COOKIE, { path: FLOW_COOKIE_PATH });
    if (request.query.error) {
      return reply.code(401).send({ error: `oidc: ${request.query.error}` });
    }
    if (!flow || !request.query.code || !request.query.state) {
      return reply.code(400).send({ error: "oidc: missing flow state" });
    }
    // CSRF: der state aus der Callback-URL MUSS zum state im (httpOnly) Flow-Cookie passen.
    if (request.query.state !== flow.state) {
      return reply.code(401).send({ error: "oidc: state mismatch" });
    }
    try {
      const ep = await endpoints();
      const tokens = await exchangeCodeForTokens(
        {
          tokenEndpoint: ep.tokenEndpoint,
          code: request.query.code,
          codeVerifier: flow.codeVerifier,
          clientId: deps.config.clientId,
          redirectUri: deps.config.redirectUri,
        },
        fetchImpl,
      );
      const claims = await validateIdToken(tokens.idToken, {
        keySet: keySetFor(ep.jwksUri),
        issuer: ep.issuer,
        clientId: deps.config.clientId,
        nonce: flow.nonce,
      });
      // KEINE Auto-Provisionierung: nur eine EXPLIZIT verlinkte Identitaet loest einen Actor auf.
      const actorId = await resolveActorForIdentity(deps.authStore, {
        tenantId,
        provider: `oidc:${ep.issuer}`,
        subject: claims.subject,
      });
      if (actorId === undefined) {
        return reply.code(403).send({ error: "oidc: identity not linked" });
      }
      const account = await deps.authStore.getUserById({ tenantId, actorId });
      if (account === undefined) {
        return reply.code(403).send({ error: "oidc: account not found" });
      }
      // Dieselbe Session wie der lokale Login (Cookie + Store) — die Autorisierung bleibt unberuehrt.
      await issueSession(
        deps.authStore,
        reply,
        {
          actorId,
          tenantId,
          authorityId: account.authorityId,
          jurisdictionId: account.jurisdictionId,
        },
        now(),
      );
      return reply.redirect(deps.config.postLoginRedirect ?? "/");
    } catch (error) {
      request.log.error({ err: error }, "oidc.callback.failed");
      const status = error instanceof OidcError ? 401 : 502;
      return reply.code(status).send({ error: "oidc: authentication failed" });
    }
  });
}
