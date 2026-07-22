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
    expect((vermerke?.data as { vermerke: unknown[] }).vermerke).toHaveLength(
      3,
    );
  });

  it("STATEFUL Batch: ein geschriebener Vermerk ist im selben Boot danach sichtbar", async () => {
    const results = await executeMeshCommands([
      [
        "vermerk",
        "add",
        CASE,
        "--text",
        "Neuer Vermerk aus der CLI",
        "--kind",
        "notiz",
      ],
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
    const [actions] = await executeMeshCommands([["case", "actions", CASE]]);
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
    expect((results[2]?.data as { state: string }).state).toBe(
      "in-bearbeitung",
    );
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

  it("Aufgaben-Steuerung: einen Checklisten-Schritt abhaken (stateful)", async () => {
    const results = await executeMeshCommands([
      ["task", "done", "golden.schritt-1"],
      ["task", "list", CASE],
    ]);
    expect(results[0]?.ok).toBe(true);
    const tasks = (
      results[1]?.data as {
        tasks: { taskId: string; data?: { erledigt?: boolean } }[];
      }
    ).tasks;
    const schritt = tasks.find((t) => t.taskId === "golden.schritt-1");
    expect(schritt?.data?.erledigt).toBe(true);
  });

  it("Arbeits-Notiz anlegen (task notiz -> 201, taskKind notiz)", async () => {
    const [notiz] = await executeMeshCommands([
      ["task", "notiz", CASE, "--text", "Aktenvermerk-Notiz aus der CLI"],
    ]);
    expect(notiz?.ok).toBe(true);
    expect(notiz?.status).toBe(201);
    expect((notiz?.data as { taskKind: string }).taskKind).toBe("notiz");
  });

  it("case dump: kompletter Entscheidungs-Kontext in EINEM JSON", async () => {
    const [dump] = await executeMeshCommands([["case", "dump", CASE]]);
    expect(dump?.ok).toBe(true);
    const d = dump?.data as {
      case: { caseId: string };
      actions: unknown;
      progress: unknown;
      blackboard: { eintraege: unknown[] };
      tasks: unknown;
      verfahrensWissen: { eintraege: unknown[] };
    };
    expect(d.case.caseId).toBe(CASE);
    // Blackboard (Fixture: 3 Vermerke) + Verfahrens-Wissen (Fixture: 2 Eintraege) sind enthalten.
    expect(d.blackboard.eintraege.length).toBeGreaterThanOrEqual(3);
    expect(d.verfahrensWissen.eintraege.length).toBeGreaterThanOrEqual(2);
    expect(d.actions).not.toBeNull();
    expect(d.progress).not.toBeNull();
  });

  it("case dump eines unbekannten Falls -> ok:false, 404", async () => {
    const [dump] = await executeMeshCommands([
      ["case", "dump", "case.gibtsnicht"],
    ]);
    expect(dump?.ok).toBe(false);
    expect(dump?.status).toBe(404);
  });

  it("smoke: faehrt das Musterverfahren create -> Abschluss (fahrbar, closesCase erreicht)", async () => {
    const [smoke] = await executeMeshCommands([["smoke"]]);
    expect(smoke?.ok).toBe(true);
    const d = smoke?.data as {
      plannedPath: string[];
      finalState: string;
      closedAt: string | null;
      steps: { ok: boolean }[];
    };
    // Kuerzester Abschluss-Pfad des Musterverfahrens: annehmen -> abschliessen.
    expect(d.plannedPath).toEqual(["annehmen", "abschließen"]);
    expect(d.steps.every((s) => s.ok)).toBe(true);
    expect(d.finalState).toBe("abgeschlossen");
    expect(d.closedAt).not.toBeNull();
  });

  it("smoke unbekanntes Verfahren -> ok:false", async () => {
    const [smoke] = await executeMeshCommands([["smoke", "gibtsnicht"]]);
    expect(smoke?.ok).toBe(false);
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

  it("composable list: zeigt die deklarierten Composables mit enabled/hasSpine", async () => {
    const [res] = await executeMeshCommands([["composable", "list"]]);
    expect(res?.ok).toBe(true);
    const composables = (res?.data as { composables: { id: string }[] })
      .composables;
    const ids = composables.map((c) => c.id);
    expect(ids).toContain("musterverfahren");
    expect(ids).toContain("musterantrag");
  });

  it("composable show: Detail inkl. vollem Spine-Eskalationspfad + Zertifizierungsreife", async () => {
    const [res] = await executeMeshCommands([
      ["composable", "show", "musterverfahren"],
    ]);
    expect(res?.ok).toBe(true);
    const d = res?.data as {
      spine: { aufgaben: string[]; autonomy: string; rechtsnah: boolean };
      certification: { certifiable: boolean };
    };
    // Der Nutzer-Mandat-Eskalationspfad: von Assistenz bis Subsumtion/Review.
    expect(d.spine.aufgaben).toEqual([
      "assistenz",
      "strukturierung",
      "pruefung",
      "subsumtion",
      "review",
    ]);
    expect(d.spine.autonomy).toBe("AAL-2");
    expect(d.spine.rechtsnah).toBe(true);
    expect(d.certification.certifiable).toBe(true);
  });

  it("composable show eines unbekannten Composables -> ok:false, 404", async () => {
    const [res] = await executeMeshCommands([
      ["composable", "show", "gibt-es-nicht"],
    ]);
    expect(res?.ok).toBe(false);
    expect(res?.status).toBe(404);
  });

  it("composable spine: fuehrt eine rechtsnahe Pruefung aus -> Vorschlag mit reviewRequired (nie Entscheidung)", async () => {
    const [res] = await executeMeshCommands([
      [
        "composable",
        "spine",
        "musterverfahren",
        "pruefung",
        "--input",
        '{"sachverhalt":"synthetisch"}',
      ],
    ]);
    expect(res?.ok).toBe(true);
    const d = res?.data as {
      rechtsnah: boolean;
      autonomy: string;
      suggestion: { reviewRequired: boolean };
    };
    expect(d.rechtsnah).toBe(true);
    expect(d.autonomy).toBe("AAL-2");
    expect(d.suggestion.reviewRequired).toBe(true);
  });

  it("composable spine: eine nicht deklarierte Aufgabe -> ok:false, 422", async () => {
    // musterantrag deklariert nur assistenz+strukturierung → subsumtion ist nicht dabei.
    const [res] = await executeMeshCommands([
      ["composable", "spine", "musterantrag", "subsumtion", "--input", "{}"],
    ]);
    expect(res?.ok).toBe(false);
    expect(res?.status).toBe(422);
  });
});
