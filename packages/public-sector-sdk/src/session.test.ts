import { describe, it, expect } from "vitest";
import {
  claimsToSession,
  erfuelltAssurance,
  headerSessionResolver,
  oidcSessionResolver,
  resolverFromEnv,
  type IdentityClaims,
} from "./session.js";

describe("claimsToSession — Claims → Sitzung (fail-closed)", () => {
  it("bildet vollständige Claims ab", () => {
    const s = claimsToSession({
      subject: "sb.a",
      tenantId: "t1",
      authorityId: "b1",
      permissions: ["case.read"],
    });
    expect(s).toEqual({
      actorId: "sb.a",
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      permissions: ["case.read"],
    });
  });
  it("liefert undefined ohne Mandant/Behörde/Subject (kein Client-Scope-Leak)", () => {
    expect(
      claimsToSession({ subject: "", tenantId: "t1", authorityId: "b1" }),
    ).toBeUndefined();
    expect(
      claimsToSession({ subject: "x", tenantId: "", authorityId: "b1" }),
    ).toBeUndefined();
    expect(
      claimsToSession({ subject: "x", tenantId: "t1", authorityId: "" }),
    ).toBeUndefined();
  });
});

describe("erfuelltAssurance — eIDAS-Gate", () => {
  it("ordnet niedrig < substanziell < hoch", () => {
    expect(erfuelltAssurance("hoch", "substanziell")).toBe(true);
    expect(erfuelltAssurance("substanziell", "substanziell")).toBe(true);
    expect(erfuelltAssurance("niedrig", "substanziell")).toBe(false);
    expect(erfuelltAssurance(undefined, "substanziell")).toBe(false);
  });
});

describe("headerSessionResolver — DEV", () => {
  it("löst die Sitzung aus x-*-Headern", () => {
    const r = headerSessionResolver();
    const s = r({
      headers: {
        "x-actor-id": "sb.a",
        "x-tenant-id": "t1",
        "x-authority-id": "b1",
        "x-permissions": "case.read, case.decide",
      },
    });
    expect(s?.actorId).toBe("sb.a");
    expect(s?.permissions).toEqual(["case.read", "case.decide"]);
  });
  it("liefert undefined ohne Akteur", () => {
    expect(
      headerSessionResolver()({ headers: { "x-tenant-id": "t1" } }),
    ).toBeUndefined();
  });

  it("leitet Rechte aus x-roles über die RBAC-Registry ab (caseworker → sein Rechte-Set)", () => {
    const s = headerSessionResolver()({
      headers: {
        "x-actor-id": "sb.a",
        "x-tenant-id": "t1",
        "x-authority-id": "b1",
        "x-roles": "caseworker",
      },
    });
    expect(s?.permissions).toContain("task.read");
    expect(s?.permissions).toContain("task.write");
    expect(s?.permissions).toContain("case.read");
    expect(s?.permissions).toContain("ai.assist");
    // Registry-Gap (ehrlich): case.transition/case.decide sind NICHT im caseworker-Rollen-Set — Rollen-Auth allein
    // kann heute (noch) keine Übergänge; dafür weiterhin explizite x-permissions oder eine erweiterte Rolle nötig.
    expect(s?.permissions).not.toContain("case.transition");
  });

  it("VEREINIGT Rollen-Rechte mit expliziten x-permissions (additiv)", () => {
    const s = headerSessionResolver()({
      headers: {
        "x-actor-id": "sb.a",
        "x-tenant-id": "t1",
        "x-authority-id": "b1",
        "x-roles": "citizen",
        "x-permissions": "case.transition",
      },
    });
    expect(s?.permissions).toContain("session.read"); // aus der citizen-Rolle abgeleitet
    expect(s?.permissions).toContain("case.transition"); // explizit ergänzt
  });

  it("ignoriert unbekannte Rollen (kein Crash, keine Rechte daraus)", () => {
    const s = headerSessionResolver()({
      headers: {
        "x-actor-id": "sb.a",
        "x-tenant-id": "t1",
        "x-authority-id": "b1",
        "x-roles": "gibtsnicht",
        "x-permissions": "case.read",
      },
    });
    expect(s?.permissions).toEqual(["case.read"]);
  });

  it("bleibt rückwärtskompatibel: ohne x-roles zählen nur die x-permissions", () => {
    const s = headerSessionResolver()({
      headers: {
        "x-actor-id": "sb.a",
        "x-tenant-id": "t1",
        "x-authority-id": "b1",
        "x-permissions": "view.read",
      },
    });
    expect(s?.permissions).toEqual(["view.read"]);
  });
});

describe("oidcSessionResolver — PROD-Seam (injizierte Verifikation)", () => {
  const fakeVerify = (token: string): IdentityClaims | undefined =>
    token === "gueltig"
      ? {
          subject: "oidc-user",
          tenantId: "t1",
          authorityId: "b1",
          assuranceLevel: "hoch",
          permissions: ["case.decide"],
        }
      : undefined;

  it("mappt ein gültiges Bearer-Token → Sitzung", () => {
    const s = oidcSessionResolver(fakeVerify)({
      headers: { authorization: "Bearer gueltig" },
    });
    expect(s?.actorId).toBe("oidc-user");
    expect(s?.permissions).toContain("case.decide");
  });
  it("weist ein ungültiges/fehlendes Token ab", () => {
    expect(
      oidcSessionResolver(fakeVerify)({
        headers: { authorization: "Bearer falsch" },
      }),
    ).toBeUndefined();
    expect(oidcSessionResolver(fakeVerify)({ headers: {} })).toBeUndefined();
  });
});

describe("resolverFromEnv — Weiche", () => {
  it("nutzt den OIDC-Verifier, wenn OIDC_ISSUER + Builder vorliegen", () => {
    const r = resolverFromEnv(
      { OIDC_ISSUER: "https://idp.example" },
      () => (t) =>
        t === "ok"
          ? { subject: "u", tenantId: "t1", authorityId: "b1" }
          : undefined,
    );
    expect(r({ headers: { authorization: "Bearer ok" } })?.actorId).toBe("u");
  });
  it("fällt ohne OIDC_ISSUER auf den Header-Resolver zurück (DEV)", () => {
    const r = resolverFromEnv({});
    expect(
      r({
        headers: {
          "x-actor-id": "sb.a",
          "x-tenant-id": "t1",
          "x-authority-id": "b1",
        },
      })?.actorId,
    ).toBe("sb.a");
  });
  it("FAIL-CLOSED: OIDC_ISSUER gesetzt, aber kein Verifier → wirft (KEIN Rückfall auf den Header-Resolver)", () => {
    // Sonst könnte ein Aufrufer per x-*-Headern eine voll privilegierte Sitzung fälschen (Rechte-Eskalation in PROD).
    expect(() =>
      resolverFromEnv({ OIDC_ISSUER: "https://idp.example" }),
    ).toThrow(/OIDC_ISSUER/);
  });
});
