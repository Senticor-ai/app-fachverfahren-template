import { describe, expect, it } from "vitest";
import {
  capabilityFailure,
  defaultSemantics,
  type EvidenceRetrievalPort,
} from "@senticor/platform-contracts";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

/** Ein EvidenceRetrievalPort, der fail-closed antwortet — für den ehrlichen Fehler-Pfad (kein fingierter Nachweis). */
const failingEvidence: EvidenceRetrievalPort = {
  descriptor: {
    id: "evidence-retrieval",
    name: "Failing",
    version: "0.0.0",
    provider: "test-failing",
    dataClassification: "restricted",
    schemas: [],
    semantics: defaultSemantics,
  },
  async requestEvidence() {
    return capabilityFailure(
      "register/rejected",
      "Register lehnte den Abruf ab",
      {
        retryable: false,
        classification: "restricted",
      },
    );
  },
};

const anfrage = {
  evidenceType: "meldebestaetigung",
  subjectId: "actor-citizen",
  purpose: "Antrag — Wohnsitznachweis",
  acceptedSchemaVersions: ["xmeld.v1"],
};

describe("BFF /api/register/evidence", () => {
  it("200: Sachbearbeitung ruft einen Nachweis ab → EvidenceRecord + Audit (Zweck)", async () => {
    const { app, auditSink } = await buildBffApp({
      session: caseworkerSession(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/register/evidence",
      payload: anfrage,
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json();
    expect(dto.evidenceType).toBe("meldebestaetigung");
    expect(typeof dto.evidenceId).toBe("string");
    expect(typeof dto.issuerAuthorityId).toBe("string");
    expect(
      auditSink.events.some(
        (e) =>
          e.kind === "app-data" &&
          e.event.eventType === "register.evidence.requested",
      ),
    ).toBe(true);
    await app.close();
  });

  it("403: Bürgerin darf keinen Register-Abruf auslösen (Once-Only ist behördlich)", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/register/evidence",
      payload: anfrage,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("401: ohne Sitzung", async () => {
    const { app } = await buildBffApp({});
    const res = await app.inject({
      method: "POST",
      url: "/api/register/evidence",
      payload: anfrage,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("400: leere acceptedSchemaVersions → Validation-Envelope", async () => {
    const { app } = await buildBffApp({ session: caseworkerSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/register/evidence",
      payload: { ...anfrage, acceptedSchemaVersions: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("502: Register lehnt ab → ehrliches Scheitern, kein fingierter Nachweis", async () => {
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      evidenceRetrieval: failingEvidence,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/register/evidence",
      payload: anfrage,
    });
    expect(res.statusCode).toBe(502);
    await app.close();
  });
});
