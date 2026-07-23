// golden-fixture.test — der SELBSTTEST: seedet die Golden Fixture in In-Memory-Stores, bootet appBff
// in-process und faehrt den VOLLEN Mesh-Fluss (lesen · pruefen · exportieren) — OHNE finalen Build, ohne
// Server/Netz. Das ist die Nutzer-Zusage „ohne finalen build selbst testen": die Fixture beweist das Mesh.
import { describe, expect, it } from "vitest";
import { buildGoldenMesh } from "./golden-fixture.js";
import { buildSeededMeshApp } from "./mesh-harness.js";

const CASE = "case.demo-0001";
const VERMERKE = `/api/cases/${CASE}/vermerke`;
const WISSEN = "/api/verfahren/musterverfahren/1.0.0/wissen";

describe("Golden Fixture — Selbsttest des Mesh ohne finalen Build", () => {
  it("ist deterministisch (buildGoldenMesh zweimal → tief gleich)", () => {
    expect(buildGoldenMesh()).toEqual(buildGoldenMesh());
  });

  it("seedet den Fall + Blackboard: 3 Vermerke, der KI-Entwurf ist offen (pruefpflichtig)", async () => {
    const { app } = await buildSeededMeshApp();
    const liste = (await app.inject({ method: "GET", url: VERMERKE })).json();
    expect(liste.vermerke).toHaveLength(3);
    const ki = liste.vermerke.find(
      (v: { quelle: string }) => v.quelle === "ki",
    );
    expect(ki.vermerkId).toBe("audit.golden-vermerk-ki");
    expect(ki.reviewStatus).toBe("offen");
    // Menschliche Vermerke sind nicht pruefpflichtig.
    expect(
      liste.vermerke
        .filter((v: { quelle: string }) => v.quelle === "mensch")
        .every(
          (v: { reviewStatus: string }) =>
            v.reviewStatus === "nicht-erforderlich",
        ),
    ).toBe(true);
    await app.close();
  });

  it("faehrt den HITL-Review live: der offene KI-Entwurf wird bestaetigt", async () => {
    const { app } = await buildSeededMeshApp();
    const res = await app.inject({
      method: "POST",
      url: `${VERMERKE}/audit.golden-vermerk-ki/review`,
      payload: { entscheidung: "bestaetigt" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reviewStatus).toBe("bestaetigt");
    await app.close();
  });

  it("seedet das Verfahrens-Wiki: 2 Eintraege, das KI-Wissen ist offen", async () => {
    const { app } = await buildSeededMeshApp();
    const liste = (await app.inject({ method: "GET", url: WISSEN })).json();
    expect(liste.eintraege).toHaveLength(2);
    const ki = liste.eintraege.find(
      (e: { quelle: string }) => e.quelle === "ki",
    );
    expect(ki.eintragId).toBe("wissen.golden-ki");
    expect(ki.reviewStatus).toBe("offen");
    await app.close();
  });

  it("Fail-safe: verworfenes KI-Wissen faellt aus dem Export (Bruecke)", async () => {
    const { app } = await buildSeededMeshApp();
    await app.inject({
      method: "POST",
      url: `${WISSEN}/wissen.golden-ki/review`,
      payload: { entscheidung: "verworfen" },
    });
    const exp = (
      await app.inject({ method: "GET", url: `${WISSEN}/export` })
    ).json();
    expect(
      exp.eintraege.some(
        (e: { eintragId: string }) => e.eintragId === "wissen.golden-ki",
      ),
    ).toBe(false);
    // Das bestaetigungsfaehige Mensch-Wissen bleibt.
    expect(
      exp.eintraege.some(
        (e: { eintragId: string }) => e.eintragId === "wissen.golden-1",
      ),
    ).toBe(true);
    await app.close();
  });

  it("Export der Akte liefert das agenten-konsumierbare Bundle (Bruecke)", async () => {
    const { app } = await buildSeededMeshApp();
    const exp = (
      await app.inject({ method: "GET", url: `${VERMERKE}/export` })
    ).json();
    expect(exp.caseId).toBe(CASE);
    expect(exp.eintraege.length).toBeGreaterThanOrEqual(3);
    await app.close();
  });

  it("seed:false startet leer (kein Fall) — der Leerzustand ist fahrbar", async () => {
    const { app } = await buildSeededMeshApp({ seed: false });
    const res = await app.inject({ method: "GET", url: VERMERKE });
    // Ohne Seed existiert der Fall nicht → 404 (kein Blackboard).
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
