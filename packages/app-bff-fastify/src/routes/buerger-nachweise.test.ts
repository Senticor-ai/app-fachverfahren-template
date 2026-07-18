import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import { buildBffApp, citizenSession } from "../test-helpers.js";

const procedure: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["offen"],
  allowedTransitions: [],
};

const INHALT = "Nachweis-Inhalt (synthetisch)";
const CONTENT_B64 = Buffer.from(INHALT).toString("base64");

async function annaMitAntrag() {
  const caseStore = new InMemoryCaseStore();
  const registry = createInMemoryProcedureRegistry([procedure]);
  const { app } = await buildBffApp({
    session: citizenSession({ actorId: "actor.anna" }),
    caseStore,
    procedureRegistry: registry,
  });
  const antrag = (
    await app.inject({
      method: "POST",
      url: "/api/buerger/antraege",
      payload: {
        procedureId: "musterantrag",
        procedureVersion: "1",
        data: {},
      },
    })
  ).json();
  return { app, caseStore, registry, antragId: antrag.antragId as string };
}

describe("BFF Nachweis-Upload (/api/buerger/antraege/:id/nachweise)", () => {
  it("Upload → 201 mit server-berechneter Größe + SHA-256; Liste + Download-Roundtrip erhalten die Bytes", async () => {
    const { app, antragId } = await annaMitAntrag();
    const up = await app.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/nachweise`,
      payload: {
        fileName: "meldebescheinigung.txt",
        mimeType: "text/plain",
        contentBase64: CONTENT_B64,
      },
    });
    expect(up.statusCode).toBe(201);
    const ref = up.json();
    expect(ref.fileName).toBe("meldebescheinigung.txt");
    expect(ref.sizeBytes).toBe(Buffer.byteLength(INHALT));
    expect(ref.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    // Liste enthält den Nachweis.
    const liste = (
      await app.inject({
        method: "GET",
        url: `/api/buerger/antraege/${antragId}/nachweise`,
      })
    ).json();
    expect(liste.nachweise).toHaveLength(1);
    expect(liste.nachweise[0].attachmentId).toBe(ref.attachmentId);

    // Download: die Bytes kommen exakt zurück (Roundtrip), Prüfsumme stimmt.
    const dl = await app.inject({
      method: "GET",
      url: `/api/buerger/antraege/${antragId}/nachweise/${ref.attachmentId}`,
    });
    expect(dl.statusCode).toBe(200);
    const download = dl.json();
    expect(Buffer.from(download.contentBase64, "base64").toString()).toBe(
      INHALT,
    );
    expect(download.checksumSha256).toBe(ref.checksumSha256);
    await app.close();
  });

  it("400 bei leerem/ungültigem Inhalt", async () => {
    const { app, antragId } = await annaMitAntrag();
    const res = await app.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/nachweise`,
      // dekodiert zu 0 Bytes.
      payload: { fileName: "x.txt", mimeType: "text/plain", contentBase64: "====" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("404 beim Download einer unbekannten Anlage (kein Cross-Case-Zugriff)", async () => {
    const { app, antragId } = await annaMitAntrag();
    const res = await app.inject({
      method: "GET",
      url: `/api/buerger/antraege/${antragId}/nachweise/att.gibtsnicht`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("eine FREMDE Bürgerin bekommt 404 (kein Existenz-Orakel)", async () => {
    const { caseStore, registry, antragId } = await annaMitAntrag();
    const { app: bodo } = await buildBffApp({
      session: citizenSession({ actorId: "actor.bodo" }),
      caseStore,
      procedureRegistry: registry,
    });
    const res = await bodo.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/nachweise`,
      payload: {
        fileName: "x.txt",
        mimeType: "text/plain",
        contentBase64: CONTENT_B64,
      },
    });
    expect(res.statusCode).toBe(404);
    await bodo.close();
  });
});
