import { describe, expect, it } from "vitest";
import {
  capabilityFailure,
  defaultSemantics,
  type IdentityAndTrustPort,
} from "@senticor/platform-contracts";
import { buildBffApp, citizenSession } from "../test-helpers.js";

/** Ein IdentityAndTrustPort, der fail-closed antwortet — für den ehrlichen Fehler-Pfad (kein fingiertes Profil). */
const failingIdentity: IdentityAndTrustPort = {
  descriptor: {
    id: "identity-and-trust",
    name: "Failing",
    version: "0.0.0",
    provider: "test-failing",
    dataClassification: "confidential",
    schemas: [],
    semantics: defaultSemantics,
  },
  async getCurrentIdentity() {
    return capabilityFailure("identity/unavailable", "eID nicht erreichbar", {
      retryable: true,
      classification: "confidential",
    });
  },
  async requireAssurance() {
    return capabilityFailure(
      "identity/step-up-required",
      "höheres Vertrauensniveau nötig",
      { retryable: false, classification: "confidential" },
    );
  },
};

describe("BFF /api/identity", () => {
  it("200: liest die eigene Identität aus der Sitzung (subjectId = actorId)", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({ method: "GET", url: "/api/identity" });
    expect(res.statusCode).toBe(200);
    const dto = res.json();
    expect(dto.subjectId).toBe("actor-citizen");
    expect(typeof dto.assuranceLevel).toBe("string");
    expect(typeof dto.identityProvider).toBe("string");
    await app.close();
  });

  it("200: verlangt ein Vertrauensniveau → accepted (local-fake)", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/identity/assurance",
      payload: { minimumAssuranceLevel: "substanziell" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accepted).toBe(true);
    await app.close();
  });

  it("400: fehlendes minimumAssuranceLevel → Validation-Envelope", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/identity/assurance",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("401: ohne Sitzung", async () => {
    const { app } = await buildBffApp({});
    const res = await app.inject({ method: "GET", url: "/api/identity" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("503: eID nicht erreichbar → ehrliches Scheitern, kein fingiertes Profil", async () => {
    const { app } = await buildBffApp({
      session: citizenSession(),
      identityAndTrust: failingIdentity,
    });
    const res = await app.inject({ method: "GET", url: "/api/identity" });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
