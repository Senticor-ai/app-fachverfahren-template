// oidc.test — der sicherheitskritische Kern, testgetrieben: PKCE (S256), die Authorization-URL, Discovery +
// Token-Exchange (mock fetch) und v.a. die ID-Token-Validierung gegen echte jose-Signaturen — jeder Angriffs-
// vektor (falscher nonce/audience/issuer/abgelaufen/fehlendes sub) MUSS abgewiesen werden.
import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT, type KeyLike } from "jose";
import { describe, expect, it } from "vitest";
import {
  buildAuthorizationUrl,
  codeChallengeFor,
  discoverOidc,
  exchangeCodeForTokens,
  generateCodeVerifier,
  OidcError,
  randomToken,
  validateIdToken,
} from "./oidc.js";

const ISSUER = "https://id.example.org/realms/verwaltung";
const CLIENT = "fachverfahren";
const NONCE = "nonce-abc";

async function signIdToken(
  privateKey: KeyLike | Uint8Array,
  claims: Record<string, unknown>,
  over: { issuer?: string; audience?: string; expiresInSec?: number } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("keycloak-user-123")
    .setIssuer(over.issuer ?? ISSUER)
    .setAudience(over.audience ?? CLIENT)
    .setIssuedAt()
    .setExpirationTime(
      Math.floor(Date.now() / 1000) + (over.expiresInSec ?? 3600),
    );
  return jwt.sign(privateKey);
}

describe("PKCE + Zufalls-Token", () => {
  it("codeChallengeFor ist S256(base64url) des Verifiers, deterministisch", () => {
    const verifier = "test-verifier-123";
    const erwartet = createHash("sha256")
      .update(verifier)
      .digest()
      .toString("base64url");
    expect(codeChallengeFor(verifier)).toBe(erwartet);
    expect(codeChallengeFor(verifier)).toBe(codeChallengeFor(verifier));
  });

  it("Verifier + Token sind URL-safe und ausreichend lang", () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("buildAuthorizationUrl", () => {
  it("setzt alle Pflicht-Parameter inkl. PKCE S256", () => {
    const url = new URL(
      buildAuthorizationUrl({
        authorizationEndpoint: `${ISSUER}/protocol/openid-connect/auth`,
        clientId: CLIENT,
        redirectUri: "https://app.example.org/auth/oidc/callback",
        state: "state-1",
        nonce: NONCE,
        codeChallenge: "challenge-1",
      }),
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(CLIENT);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("nonce")).toBe(NONCE);
    expect(url.searchParams.get("scope")).toContain("openid");
  });
});

describe("discoverOidc + exchangeCodeForTokens (mock fetch)", () => {
  it("liest die Endpunkte aus dem Discovery-Dokument", async () => {
    const fetchMock = (async () =>
      new Response(
        JSON.stringify({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/auth`,
          token_endpoint: `${ISSUER}/token`,
          jwks_uri: `${ISSUER}/certs`,
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const ep = await discoverOidc(ISSUER, fetchMock);
    expect(ep.tokenEndpoint).toBe(`${ISSUER}/token`);
    expect(ep.jwksUri).toBe(`${ISSUER}/certs`);
  });

  it("Token-Exchange schickt PKCE code_verifier + liefert id_token", async () => {
    let gesendet = "";
    const fetchMock = (async (_url: string, init: RequestInit) => {
      gesendet = String(init.body);
      return new Response(JSON.stringify({ id_token: "the.id.token" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const tokens = await exchangeCodeForTokens(
      {
        tokenEndpoint: `${ISSUER}/token`,
        code: "auth-code",
        codeVerifier: "verifier-xyz",
        clientId: CLIENT,
        redirectUri: "https://app/cb",
      },
      fetchMock,
    );
    expect(tokens.idToken).toBe("the.id.token");
    expect(gesendet).toContain("code_verifier=verifier-xyz");
    expect(gesendet).toContain("grant_type=authorization_code");
  });

  it("Token-Exchange ohne id_token wirft", async () => {
    const fetchMock = (async () =>
      new Response(JSON.stringify({ access_token: "a" }), {
        status: 200,
      })) as unknown as typeof fetch;
    await expect(
      exchangeCodeForTokens(
        {
          tokenEndpoint: `${ISSUER}/token`,
          code: "c",
          codeVerifier: "v",
          clientId: CLIENT,
          redirectUri: "r",
        },
        fetchMock,
      ),
    ).rejects.toBeInstanceOf(OidcError);
  });
});

describe("validateIdToken — Signatur + issuer + audience + exp + nonce", () => {
  it("akzeptiert ein korrektes Token und liefert die Claims", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await signIdToken(privateKey, {
      nonce: NONCE,
      email: "u@example.org",
      name: "U",
    });
    const claims = await validateIdToken(token, {
      keySet: publicKey,
      issuer: ISSUER,
      clientId: CLIENT,
      nonce: NONCE,
    });
    expect(claims.subject).toBeTruthy();
    expect(claims.email).toBe("u@example.org");
  });

  it("WEIST einen falschen nonce ab (Replay-Schutz)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await signIdToken(privateKey, { nonce: "anderer-nonce" });
    await expect(
      validateIdToken(token, {
        keySet: publicKey,
        issuer: ISSUER,
        clientId: CLIENT,
        nonce: NONCE,
      }),
    ).rejects.toBeInstanceOf(OidcError);
  });

  it("WEIST eine falsche audience ab (Token fuer anderen Client)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await signIdToken(
      privateKey,
      { nonce: NONCE },
      { audience: "anderer-client" },
    );
    await expect(
      validateIdToken(token, {
        keySet: publicKey,
        issuer: ISSUER,
        clientId: CLIENT,
        nonce: NONCE,
      }),
    ).rejects.toBeInstanceOf(OidcError);
  });

  it("WEIST einen falschen issuer ab", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await signIdToken(
      privateKey,
      { nonce: NONCE },
      { issuer: "https://evil.example.org" },
    );
    await expect(
      validateIdToken(token, {
        keySet: publicKey,
        issuer: ISSUER,
        clientId: CLIENT,
        nonce: NONCE,
      }),
    ).rejects.toBeInstanceOf(OidcError);
  });

  it("WEIST ein abgelaufenes Token ab", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const token = await signIdToken(
      privateKey,
      { nonce: NONCE },
      { expiresInSec: -60 },
    );
    await expect(
      validateIdToken(token, {
        keySet: publicKey,
        issuer: ISSUER,
        clientId: CLIENT,
        nonce: NONCE,
      }),
    ).rejects.toBeInstanceOf(OidcError);
  });

  it("WEIST eine FREMDE Signatur ab (falscher Schluessel)", async () => {
    const signer = await generateKeyPair("RS256");
    const other = await generateKeyPair("RS256");
    const token = await signIdToken(signer.privateKey, { nonce: NONCE });
    await expect(
      validateIdToken(token, {
        keySet: other.publicKey,
        issuer: ISSUER,
        clientId: CLIENT,
        nonce: NONCE,
      }),
    ).rejects.toBeInstanceOf(OidcError);
  });
});
