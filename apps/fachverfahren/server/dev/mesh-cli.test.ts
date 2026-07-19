// mesh-cli.test — die Agenten-CLI end-to-end (in-process, kein Prozess/Netz): Lese- + Steuer-Kommandos
// gegen die Golden Fixture, plus der STATEFUL Batch-Modus (add -> danach in list sichtbar in EINEM App-Boot).
import { describe, expect, it } from "vitest";
import { executeMeshCommands, runMeshCommand } from "./mesh-cli.js";

const CASE = "case.demo-0001";

describe("Agenten-CLI (mesh-cli)", () => {
  it("liest Verfahren + Faelle + Blackboard aus der Golden Fixture", async () => {
    const [procs, cases, vermerke] = await executeMeshCommands([
      ["procedures"],
      ["cases"],
      ["vermerk", "list", CASE],
    ]);
    expect(procs?.ok).toBe(true);
    expect(JSON.stringify(procs?.data)).toContain("musterverfahren");
    expect(cases?.ok).toBe(true);
    expect(JSON.stringify(cases?.data)).toContain(CASE);
    expect(vermerke?.ok).toBe(true);
    expect(
      (vermerke?.data as { vermerke: unknown[] }).vermerke,
    ).toHaveLength(3);
  });

  it("STATEFUL Batch: ein geschriebener Vermerk ist im selben Boot danach sichtbar", async () => {
    const results = await executeMeshCommands([
      ["vermerk", "add", CASE, "--text", "Neuer Vermerk aus der CLI", "--kind", "notiz"],
      ["vermerk", "list", CASE],
    ]);
    expect(results[0]?.ok).toBe(true);
    // 3 aus der Fixture + 1 neuer = 4.
    expect((results[1]?.data as { vermerke: unknown[] }).vermerke).toHaveLength(
      4,
    );
  });

  it("steuert den HITL-Review: der offene KI-Entwurf wird bestaetigt", async () => {
    const [review] = await executeMeshCommands([
      [
        "vermerk",
        "review",
        CASE,
        "audit.golden-vermerk-ki",
        "--entscheidung",
        "bestaetigt",
      ],
    ]);
    expect(review?.ok).toBe(true);
    expect((review?.data as { reviewStatus: string }).reviewStatus).toBe(
      "bestaetigt",
    );
  });

  it("Verfahrens-Wiki: KI-Wissen verwerfen -> faellt aus dem Export (fail-safe, stateful)", async () => {
    const results = await executeMeshCommands([
      [
        "wissen",
        "review",
        "musterverfahren",
        "1.0.0",
        "wissen.golden-ki",
        "--entscheidung",
        "verworfen",
      ],
      ["wissen", "export", "musterverfahren", "1.0.0"],
    ]);
    expect(results[0]?.ok).toBe(true);
    const exp = results[1]?.data as { eintraege: { eintragId: string }[] };
    expect(exp.eintraege.some((e) => e.eintragId === "wissen.golden-ki")).toBe(
      false,
    );
  });

  it("legt einen Fall an (case create -> 201, server-generierte caseId)", async () => {
    const [created] = await executeMeshCommands([
      ["case", "create", "musterverfahren", "1.0.0", "--state", "eingegangen"],
    ]);
    expect(created?.ok).toBe(true);
    expect(created?.status).toBe(201);
    const data = created?.data as { caseId: string; state: string };
    expect(data.caseId.startsWith("case.")).toBe(true);
    expect(data.state).toBe("eingegangen");
  });

  it("zeigt die moeglichen Uebergaenge (case actions)", async () => {
    const [actions] = await executeMeshCommands([
      ["case", "actions", CASE],
    ]);
    expect(actions?.ok).toBe(true);
    // Der Demo-Fall steht in „in-bearbeitung": pausieren + abschliessen sind moeglich.
    expect(JSON.stringify(actions?.data)).toContain("pausieren");
  });

  it("treibt den Zustandsuebergang (auto-version): in-bearbeitung -> pausiert -> in-bearbeitung", async () => {
    const results = await executeMeshCommands([
      ["case", "transition", CASE, "--action", "pausieren"],
      ["case", "transition", CASE, "--action", "fortsetzen"],
      ["case", "show", CASE],
    ]);
    expect(results[0]?.ok).toBe(true);
    expect((results[0]?.data as { state: string }).state).toBe("pausiert");
    expect(results[1]?.ok).toBe(true);
    expect((results[2]?.data as { state: string }).state).toBe("in-bearbeitung");
  });

  it("Vier-Augen serverseitig: derselbe Akteur darf den Abschluss nicht selbst freigeben (403)", async () => {
    // pausieren + fortsetzen (beide vom CLI-Akteur) machen ihn zum letzten Bearbeitungsschritt; der
    // requiresFourEyes-Abschluss durch DENSELBEN Akteur wird dann serverseitig mit 403 geblockt.
    const results = await executeMeshCommands([
      ["case", "transition", CASE, "--action", "pausieren"],
      ["case", "transition", CASE, "--action", "fortsetzen"],
      ["case", "transition", CASE, "--action", "abschließen"],
    ]);
    expect(results[2]?.ok).toBe(false);
    expect(results[2]?.status).toBe(403);
  });

  it("Vier-Augen POSITIV: bereitet Person A vor, gibt Person B (--as) frei -> abgeschlossen", async () => {
    const results = await executeMeshCommands([
      ["case", "transition", CASE, "--action", "pausieren", "--as", "actor.a"],
      ["case", "transition", CASE, "--action", "fortsetzen", "--as", "actor.a"],
      [
        "case",
        "transition",
        CASE,
        "--action",
        "abschließen",
        "--as",
        "actor.b",
      ],
    ]);
    expect(results[2]?.ok).toBe(true);
    expect((results[2]?.data as { state: string }).state).toBe("abgeschlossen");
  });

  it("Kontext-Export der Akte ist agenten-konsumierbar", async () => {
    const [exp] = await executeMeshCommands([["case", "export", CASE]]);
    expect(exp?.ok).toBe(true);
    expect((exp?.data as { caseId: string }).caseId).toBe(CASE);
  });

  it("Fehlbedienung -> ok:false, klare Meldung, Exit-Code 1", async () => {
    const { exitCode, results } = await runMeshCommand([
      "vermerk",
      "quatsch",
      CASE,
    ]);
    expect(results[0]?.ok).toBe(false);
    expect(exitCode).toBe(1);
  });

  it("help -> Nutzungstext, Exit-Code 0", async () => {
    const { exitCode, text } = await runMeshCommand(["help"]);
    expect(exitCode).toBe(0);
    expect(text).toContain("Agenten-CLI");
  });
});
