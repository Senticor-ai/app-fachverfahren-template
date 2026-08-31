// mesh-cli.test — die Agenten-CLI end-to-end (in-process, kein Prozess/Netz): Lese- + Steuer-Kommandos
// gegen die Golden Fixture, plus der STATEFUL Batch-Modus (add -> danach in list sichtbar in EINEM App-Boot).
import { describe, expect, it } from "vitest";
import { executeMeshCommands, runMeshCommand } from "./mesh-cli.js";
import { createComposableRegistry } from "../composables.config.js";
import { istRechtsnah } from "@senticor/public-sector-sdk";
import { composableWith, withoutTask } from "../composable-subject.js";

const CASE = "case.demo-0001";

// ── THE SUBJECT COMES FROM THE REGISTRY THE CLI ITSELF ASKS ───────────────────────────────────────────────
// The names `musterverfahren`/`musterantrag` were copied out here six times. They hold ONLY in this template: in
// a built procedure `createComposableRegistry` mounts the EMITTED places and replaces the demo patterns —
// explicitly and by documented design. Measured 2026-08-31 against two fully built procedures, exactly these six
// assertions were red in BOTH, with an identical cause and not a single domain defect among them.
// Selection now happens by PROPERTY — and it throws with a reason when the registry cannot supply one.
const REG = createComposableRegistry();
/** The place where governance is checked: a law-adjacent spine that declares `pruefung`. */
const LAW_ADJACENT = composableWith(
  REG,
  (c) =>
    !!c.spine &&
    istRechtsnah(c.spine) &&
    !!c.spine.aufgaben?.includes("pruefung"),
  "a composable with a LAW-ADJACENT spine that declares the task `pruefung`",
);

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
    // The property: the CLI shows EXACTLY the mounted places — not a selection, not this template's demo
    // patterns. Comparing names only checked which procedure had been built.
    expect([...ids].sort()).toEqual([...REG.list().map((c) => c.id)].sort());
  });

  it("composable show: Detail inkl. vollem Spine-Eskalationspfad + Zertifizierungsreife", async () => {
    const [res] = await executeMeshCommands([
      ["composable", "show", LAW_ADJACENT.id],
    ]);
    expect(res?.ok).toBe(true);
    const d = res?.data as {
      spine: { aufgaben: string[]; autonomy: string; rechtsnah: boolean };
      certification: { certifiable: boolean };
    };
    // The CLI reports EXACTLY what the place declares — the task list comes from the registry, not from a copy
    // inside the witness. A fixed list checked THIS template's escalation path, not the seam.
    expect(d.spine.aufgaben).toEqual(LAW_ADJACENT.spine?.aufgaben);
    expect(d.spine.autonomy).toBe(LAW_ADJACENT.spine?.autonomy);
    // ⛔ THE NON-NEGOTIABLE ASSERTION STAYS HARD, because it is a claim about GOVERNANCE and not about the
    // procedure: a law-adjacent place stays at AAL-2 — the AI advises, it never decides.
    expect(d.spine.rechtsnah).toBe(true);
    expect(LAW_ADJACENT.spine?.autonomy).toBe("AAL-2");
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
        LAW_ADJACENT.id,
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
    // The subject is the PROPERTY "has a spine but does not declare `subsumtion`" — which place that is, the
    // registry decides. This used to read `musterantrag`, a name belonging to this template.
    const undeclared = withoutTask(
      REG,
      "subsumtion",
      "a composable with a spine that does NOT declare `subsumtion` (the subject of the rejection)",
    );
    const [res] = await executeMeshCommands([
      ["composable", "spine", undeclared.id, "subsumtion", "--input", "{}"],
    ]);
    expect(res?.ok).toBe(false);
    expect(res?.status).toBe(422);
  });

  it("composable chat: governed Chat-Runde -> Vorschlag mit reviewRequired + Erdungs-Block + chat.turn-Evidence", async () => {
    const results = await executeMeshCommands([
      [
        "composable",
        "chat",
        LAW_ADJACENT.id,
        "--message",
        "Welche Frist gilt?",
      ],
      ["composable", "evidence", LAW_ADJACENT.id],
    ]);
    expect(results[0]?.ok).toBe(true);
    const d = results[0]?.data as {
      antwort: { reviewRequired: boolean; marking: string };
      erdung: { geerdet: boolean; quellen: string[] };
    };
    expect(d.antwort.reviewRequired).toBe(true);
    expect(d.antwort.marking).toBe("ki-vorschlag");
    // ── THE GROUNDING NAMES THE KNOWLEDGE DOMAINS THE PLACE DECLARES — not its id.
    // This read `domain:musterverfahren`, and my first rebinding turned it into `domain:${LAW_ADJACENT.id}`.
    // Both held only by coincidence: in this template the demo composable's id and its knowledge domain are the
    // same word. Measured in a generated procedure the sources read the procedure's own knowledge domain for a place whose id differs from it.
    // The invariant the server actually guarantees is stated one line above its own code: "Zitierfaehige Quellen
    // leitet der SERVER ab (Evidence-Wahrheit) — nie aus der Modell-Antwort", derived from
    // `found.spine.knowledgeDomains`. That is what gets asserted — and it is stronger than either name.
    const declared = LAW_ADJACENT.spine?.knowledgeDomains ?? [];
    expect(
      declared.length,
      "the chosen place declares no knowledge domain — then grounding cannot be checked",
    ).toBeGreaterThan(0);
    for (const dom of declared)
      expect(d.erdung.quellen).toContain(`domain:${dom}`);
    // And nothing beyond them: an invented domain would be exactly the fabrication the server prevents.
    const domainSources = d.erdung.quellen.filter((q) =>
      q.startsWith("domain:"),
    );
    expect([...domainSources].sort()).toEqual(
      [...declared].map((x) => `domain:${x}`).sort(),
    );
    const ev = results[1]?.data as {
      entries: { entryType: string }[];
      chain: { valid: boolean };
    };
    expect(ev.entries.some((e) => e.entryType === "chat.turn")).toBe(true);
    expect(ev.chain.valid).toBe(true);
  });

  it("composable evidence: Spine-Handlungen landen hash-verkettet im Ledger (stateful, verifizierbar)", async () => {
    const results = await executeMeshCommands([
      ["composable", "spine", LAW_ADJACENT.id, "assistenz", "--input", "{}"],
      ["composable", "spine", LAW_ADJACENT.id, "pruefung", "--input", "{}"],
      ["composable", "evidence", LAW_ADJACENT.id],
    ]);
    expect(results[2]?.ok).toBe(true);
    const ev = results[2]?.data as {
      entries: { prevHash: string | null; entryHash: string }[];
      chain: { valid: boolean; length: number };
    };
    expect(ev.entries).toHaveLength(2);
    expect(ev.entries[0]?.prevHash).toBeNull();
    expect(ev.entries[1]?.prevHash).toBe(ev.entries[0]?.entryHash);
    expect(ev.chain).toEqual({ valid: true, length: 2 });
  });
});
