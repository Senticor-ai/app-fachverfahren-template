// oidc-routes.test — der volle OIDC-Flow gegen einen MOCK-Keycloak (Discovery + Token-Endpoint gemockt, der
// oeffentliche Schluessel injiziert). Beweist: login->callback->Session bei verlinkter Identitaet; state
// mismatch -> 401 (CSRF); nicht verlinkte Identitaet -> 403 (keine Auto-Provisionierung).
import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import fastify, { type FastifyInstance } from "fastify";
import { generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { registerAuthRoutes } from "./routes.js";

const ISSUER = "https://id.example.org/realms/verwaltung";
const CLIENT = "fachverfahren";
const REDIRECT = "https://app.example.org/auth/oidc/callback";
const TENANT = "default";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let idTokenToReturn = "";

async function signIdToken(
  nonce: string,
  subject = "keycloak-sub-123",
): Promise<string> {
  return new SignJWT({ nonce, email: "u@example.org", name: "U" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(subject)
    .setIssuer(ISSUER)
    .setAudience(CLIENT)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(keys.privateKey);
}

const mockFetch = (async (url: string | URL) => {
  const u = String(url);
  if (u.endsWith("/.well-known/openid-configuration")) {
    return new Response(
      JSON.stringify({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/auth`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/certs`,
      }),
      { status: 200 },
    );
  }
  if (u === `${ISSUER}/token`) {
    return new Response(JSON.stringify({ id_token: idTokenToReturn }), {
      status: 200,
    });
  }
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

async function buildApp(authStore: InMemoryAuthStore): Promise<FastifyInstance> {
  const app = fastify({ logger: false });
  await app.register(fastifyCookie);
  registerAuthRoutes(app, {
    authStore,
    kanbanStore: new InMemoryKanbanStore(),
    auditStore: new InMemoryAuditStore(),
    bootstrapToken: undefined,
    oidcConfig: {
      issuerUrl: ISSUER,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      tenantId: TENANT,
    },
    oidcFetch: mockFetch,
    oidcKeySetFor: () => keys.publicKey,
  });
  await app.ready();
  return app;
}

async function seedLinkedUser(
  authStore: InMemoryAuthStore,
  subject: string,
): Promise<void> {
  const now = new Date().toISOString();
  await authStore.createUser({
    actorId: "actor.oidc",
    tenantId: TENANT,
    authorityId: "default",
    jurisdictionId: "de",
    email: "u@example.org",
    displayName: "U",
    status: "active",
    role: "member",
    localPersonas: [],
    oidcPersonas: [],
    personaManagementMode: "local",
    principalVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  await authStore.linkIdentity({
    tenantId: TENANT,
    provider: `oidc:${ISSUER}`,
    subject,
    actorId: "actor.oidc",
  });
}

function parseFlowCookie(setCookie: string | string[] | undefined): {
  cookie: string;
  state: string;
  nonce: string;
} {
  const arr = ([] as string[]).concat(setCookie ?? []);
  const raw = arr.find((c) => c.startsWith("oidc_flow="));
  if (!raw) throw new Error("kein oidc_flow-Cookie gesetzt");
  const pair = raw.split(";")[0] ?? "";
  const value = decodeURIComponent(pair.split("=").slice(1).join("="));
  const flow = JSON.parse(value) as { state: string; nonce: string };
  return { cookie: pair, state: flow.state, nonce: flow.nonce };
}

beforeEach(async () => {
  keys = await generateKeyPair("RS256");
  idTokenToReturn = "";
});

describe("OIDC-Routen (Keycloak, Authorization Code + PKCE)", () => {
  it("voller Flow: login -> callback -> Session (verlinkte Identitaet)", async () => {
    const authStore = new InMemoryAuthStore();
    await seedLinkedUser(authStore, "keycloak-sub-123");
    const app = await buildApp(authStore);

    const login = await app.inject({ method: "GET", url: "/auth/oidc/login" });
    expect(login.statusCode).toBe(302);
    expect(login.headers.location).toContain(`${ISSUER}/auth`);
    expect(login.headers.location).toContain("code_challenge_method=S256");
    const flow = parseFlowCookie(login.headers["set-cookie"]);

    idTokenToReturn = await signIdToken(flow.nonce);
    const cb = await app.inject({
      method: "GET",
      url: `/auth/oidc/callback?code=auth-code&state=${flow.state}`,
      headers: { cookie: flow.cookie },
    });
    expect(cb.statusCode).toBe(302);
    const sessionCookie = ([] as string[])
      .concat(cb.headers["set-cookie"] ?? [])
      .find((c) => c.startsWith("app_session="));
    expect(sessionCookie).toBeTruthy();
    await app.close();
  });

  it("state mismatch -> 401 (CSRF-Schutz)", async () => {
    const authStore = new InMemoryAuthStore();
    await seedLinkedUser(authStore, "keycloak-sub-123");
    const app = await buildApp(authStore);
    const login = await app.inject({ method: "GET", url: "/auth/oidc/login" });
    const flow = parseFlowCookie(login.headers["set-cookie"]);
    idTokenToReturn = await signIdToken(flow.nonce);
    const cb = await app.inject({
      method: "GET",
      url: `/auth/oidc/callback?code=x&state=FALSCHER-STATE`,
      headers: { cookie: flow.cookie },
    });
    expect(cb.statusCode).toBe(401);
    await app.close();
  });

  it("nicht verlinkte Identitaet -> 403 (KEINE Auto-Provisionierung)", async () => {
    const authStore = new InMemoryAuthStore(); // kein linkIdentity
    const app = await buildApp(authStore);
    const login = await app.inject({ method: "GET", url: "/auth/oidc/login" });
    const flow = parseFlowCookie(login.headers["set-cookie"]);
    idTokenToReturn = await signIdToken(flow.nonce, "unverlinkter-sub");
    const cb = await app.inject({
      method: "GET",
      url: `/auth/oidc/callback?code=x&state=${flow.state}`,
      headers: { cookie: flow.cookie },
    });
    expect(cb.statusCode).toBe(403);
    await app.close();
  });
});
