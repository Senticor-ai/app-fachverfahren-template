import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appNew,
  buildAgentContext,
  buildDiscovery,
  deriveModuleContract,
  readStructuredFile,
  validateAgentRunReport,
  validateAgentPreflight,
  validateSourceRegistry,
  type AppSpec,
  collectDeclaredSeam,
} from "./agent-platform.ts";

const root = process.cwd();

describe("agent platform contract", () => {
  it("emits deterministic discovery without local paths by default", async () => {
    const discovery = await buildDiscovery(root);
    const text = JSON.stringify(discovery);
    expect(discovery.schemaVersion).toBe("1.0.0");
    expect(discovery.provenance).toBeUndefined();
    expect(text).not.toContain(root);
    expect(discovery.commands.map((command) => command.id)).toContain(
      "agent.context",
    );
  });

  it("selects minimal task context for the Hundesteuer spec", async () => {
    const context = await buildAgentContext(root, {
      taskPath: "docs/examples/hundesteuer/app.spec.yaml",
      paths: ["modules/hundesteuer"],
    });
    expect(context.taskId).toBe("hundesteuer");
    expect(context.selectedCapabilities).toContain("identity-and-trust");
    expect(context.selectedSources).toEqual(["fimportal"]);
    expect(context.writeBoundaries).toContain("modules/hundesteuer");
    expect(context.writeBoundaries).toContain(".agent/sources/");
    expect(context.nextCommands.map((command) => command.id)).toContain(
      "fetch-governed-source:fimportal",
    );
    const scaffoldCommand = context.nextCommands.find(
      (command) => command.id === "scaffold-full-repository",
    );
    expect(scaffoldCommand?.expectedArtifacts).toContain(
      "<target-dir>/.template/lock.json",
    );
    expect(scaffoldCommand?.followUpCwd).toBe("<target-dir>");
    expect(
      context.selectedContext.some((item) => item.reason === "UX contract"),
    ).toBe(true);
  });

  it("derives a module contract from an app spec", async () => {
    const spec = await readStructuredFile<AppSpec>(
      join(root, "docs/examples/hundesteuer/app.spec.yaml"),
    );
    const contract = deriveModuleContract(spec);
    expect(contract.moduleId).toBe("hundesteuer");
    expect(contract.consumedCapabilities).toContain("payment");
    expect(contract.allowedDomainPaths).toContain("modules/hundesteuer");
    expect(contract.permissions).toContain("hundesteuer.auditor");
    expect(JSON.stringify(contract)).toContain("AuditPort");
  });

  it("scaffolds an app spec idempotently", async () => {
    const temp = await mkdtemp(join(tmpdir(), "agent-app-new-"));
    try {
      const specPath = "docs/examples/hundesteuer/app.spec.yaml";
      await mkdir(join(temp, "docs/examples/hundesteuer"), {
        recursive: true,
      });
      await cp(join(root, specPath), join(temp, specPath));
      const first = await appNew(temp, {
        specPath,
      });
      const second = await appNew(temp, {
        specPath,
      });
      expect(first.status).toBe("ok");
      expect(first.generated).toContain(
        "modules/hundesteuer/contracts/audit-workspace.screen.yaml",
      );
      expect(first.generated).toContain(
        "modules/hundesteuer/ui/HundesteuerScreens.stories.tsx",
      );
      expect(first.generated).toContain(
        "modules/hundesteuer/migrations/database/0001_create_hundesteuer_cases.sql",
      );
      expect(first.generated).toContain(
        "modules/hundesteuer/compliance/profile.example.json",
      );
      expect(second.status).toBe("ok");
      expect(second.preserved).toContain("modules/hundesteuer");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("defaults optional approvals and normalizes generated SQL identifiers", async () => {
    const temp = await mkdtemp(join(tmpdir(), "agent-app-new-safe-"));
    try {
      const specPath = "docs/examples/custom/app.spec.yaml";
      const source = await readStructuredFile<AppSpec>(
        join(root, "docs/examples/hundesteuer/app.spec.yaml"),
      );
      const spec = {
        ...source,
        id: "custom",
        fim: source.fim
          ? {
              sourceId: source.fim.sourceId,
              rootId: source.fim.rootId,
            }
          : undefined,
        module: {
          ...source.module,
          id: "123-service",
          destination: "modules/123-service",
        },
      };
      delete spec.humanApproval;
      await mkdir(join(temp, "docs/examples/custom"), {
        recursive: true,
      });
      await writeFile(
        join(temp, specPath),
        `${JSON.stringify(spec, null, 2)}\n`,
      );

      const result = await appNew(temp, { specPath });
      const migration = await readFile(
        join(
          temp,
          "modules/123-service/migrations/database/0001_create_m_123_service_cases.sql",
        ),
        "utf8",
      );
      const domainModule = await readFile(
        join(temp, "modules/123-service/domain.module.yaml"),
        "utf8",
      );

      expect(result.status).toBe("ok");
      expect(migration).toContain(
        "CREATE TABLE IF NOT EXISTS m_123_service_cases",
      );
      expect(domainModule).toContain("  services: []");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("wirft bei JEDEM module.destination, das per .. aus dem modules-Baum ausbricht (Traversal-Schutz)", async () => {
    // Alle drei passieren die Praefix-Pruefung ("modules/") und brachen vorher aus. Der mittlere Fall war
    // der gefaehrlichste: destination === Repo-Wurzel → app:new ueberschrieb die echte AGENTS.md
    // (relative(root, root) === "" — weder ".."-Praefix noch absolut).
    const ausbrueche = [
      "modules/../../ausserhalb", // ausserhalb des Repos
      "modules/..", // Repo-Wurzel
      "modules/../modules-evil", // im Repo, aber ausserhalb des modules-Baums
    ];
    for (const destination of ausbrueche) {
      const temp = await mkdtemp(join(tmpdir(), "agent-app-new-escape-"));
      try {
        // Eine echte Repo-Datei, die app:new NIEMALS anfassen darf.
        await writeFile(join(temp, "AGENTS.md"), "ORIGINAL");
        const source = await readStructuredFile<AppSpec>(
          join(root, "docs/examples/hundesteuer/app.spec.yaml"),
        );
        const spec = {
          ...source,
          id: "escape",
          fim: source.fim
            ? { sourceId: source.fim.sourceId, rootId: source.fim.rootId }
            : undefined,
          module: { ...source.module, id: "escape", destination },
        };
        const specPath = "docs/examples/escape/app.spec.yaml";
        await mkdir(join(temp, "docs/examples/escape"), { recursive: true });
        await writeFile(
          join(temp, specPath),
          `${JSON.stringify(spec, null, 2)}\n`,
        );

        // Der Spec faellt SAUBER durch die Validierung (governed-build-Fehlerkanal) — nicht als
        // Exception tief im Schreibpfad. Der Write-Boundary-Guard bleibt die letzte Verteidigungslinie.
        const result = await appNew(temp, { specPath });
        expect(result.status, `destination "${destination}"`).toBe("failed");
        expect(result.failures ?? []).toContain(
          "module destination must not contain .. segments",
        );
        // ... und nichts angefasst haben.
        expect(await readFile(join(temp, "AGENTS.md"), "utf8")).toBe(
          "ORIGINAL",
        );
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    }
  });

  it("validates the OPTIONAL dossier procedure block (rejects malformed, accepts valid, stays optional)", async () => {
    const source = await readStructuredFile<AppSpec>(
      join(root, "docs/examples/hundesteuer/app.spec.yaml"),
    );
    const base = {
      ...source,
      fim: source.fim
        ? { sourceId: source.fim.sourceId, rootId: source.fim.rootId }
        : undefined,
    };
    const validProcedure = {
      procedureId: "integrationsmanagement",
      version: "2026.1",
      legalBasisIds: ["de-aufenthg-43"],
      allowedStates: ["aufgenommen", "aktiv", "abgeschlossen"],
      allowedTransitions: [
        { from: "aufgenommen", to: "aktiv", action: "aktivieren" },
        {
          from: "aktiv",
          to: "abgeschlossen",
          action: "abschliessen",
          requiresFourEyes: true,
          closesCase: true,
        },
        { from: "abgeschlossen", to: "aktiv", action: "wiederaufnehmen" },
      ],
    };

    async function runWith(
      procedure: unknown,
    ): Promise<{ status: string; failures: string[] }> {
      const temp = await mkdtemp(join(tmpdir(), "agent-app-new-proc-"));
      try {
        const spec = {
          ...base,
          id: "proc",
          module: {
            ...base.module,
            id: "proc-service",
            destination: "modules/proc-service",
          },
          ...(procedure !== undefined ? { procedure } : {}),
        };
        const specPath = "docs/examples/proc/app.spec.yaml";
        await mkdir(join(temp, "docs/examples/proc"), { recursive: true });
        await writeFile(
          join(temp, specPath),
          `${JSON.stringify(spec, null, 2)}\n`,
        );
        const result = await appNew(temp, { specPath });
        return { status: result.status, failures: result.failures ?? [] };
      } finally {
        await rm(temp, { recursive: true, force: true });
      }
    }

    // Valide → nicht abgelehnt.
    expect((await runWith(validProcedure)).status).not.toBe("failed");

    // Ohne den schließenden Übergang → kein closesCase → abgelehnt.
    const noClose = await runWith({
      ...validProcedure,
      allowedTransitions: validProcedure.allowedTransitions.filter(
        (t) => !("closesCase" in t),
      ),
    });
    expect(noClose.status).toBe("failed");
    expect(
      noClose.failures.some((f) => f.includes("schließender Übergang")),
    ).toBe(true);

    // Übergang auf einen unbekannten Zustand → abgelehnt.
    const dangling = await runWith({
      ...validProcedure,
      allowedTransitions: [
        ...validProcedure.allowedTransitions,
        {
          from: "aktiv",
          to: "nirgendwo",
          action: "abzweigen",
          closesCase: true,
        },
      ],
    });
    expect(dangling.status).toBe("failed");
    expect(
      dangling.failures.some((f) =>
        f.includes('unbekannten to-Zustand "nirgendwo"'),
      ),
    ).toBe(true);

    // OHNE procedure-Block bleibt der Spec valide (Optionalität — Antrag-nur-Apps).
    expect((await runWith(undefined)).status).not.toBe("failed");
  });

  it("rejects stale report task hashes", async () => {
    const spec = await readStructuredFile<AppSpec>(
      join(root, "docs/examples/hundesteuer/app.spec.yaml"),
    );
    const report = validReportForSpec({
      spec: { ...spec, permittedExternalSources: [] },
      task: "docs/examples/hundesteuer/app.spec.yaml",
      taskHash: "stale",
      filesChanged: ["AGENTS.md"],
    });

    const failures = await validateAgentRunReport(
      root,
      { ...spec, permittedExternalSources: [] },
      report,
      {
        taskPath: "docs/examples/hundesteuer/app.spec.yaml",
        taskHash: "fresh",
      },
    );

    expect(failures).toContain("report taskHash does not match current task");
  });

  it("validates governed source provenance status and digest", async () => {
    const temp = await mkdtemp(join(tmpdir(), "agent-source-proof-"));
    try {
      await writeFile(
        join(temp, "changed.ts"),
        "export const changed = true;\n",
      );
      await mkdir(join(temp, ".agent/sources/bad-source"), {
        recursive: true,
      });
      await writeFile(
        join(temp, ".agent/sources/bad-source/provenance.json"),
        `${JSON.stringify(
          {
            sourceId: "bad-source",
            status: 500,
            sha256: "a".repeat(64),
          },
          null,
          2,
        )}\n`,
      );
      const source = await readStructuredFile<AppSpec>(
        join(root, "docs/examples/hundesteuer/app.spec.yaml"),
      );
      const spec = {
        ...source,
        permittedExternalSources: ["bad-source"],
      };

      const failures = await validateAgentRunReport(
        temp,
        spec,
        validReportForSpec({
          spec,
          task: "app.spec.yaml",
          taskHash: "hash",
          filesChanged: ["changed.ts"],
        }),
        { taskPath: "app.spec.yaml", taskHash: "hash" },
      );

      expect(failures).toContain(
        "governed source bad-source returned unsuccessful status 500",
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  // ── A DECLARED DIRECTORY SEAM, AND THE SEPARATOR THAT MADE IT INERT (2026-09-14) ──────────────────────
  //
  // The seam list is EXACT-MATCH, but deploy manifests are written under names no fixed list can know in
  // advance: `deploy/k8s/deployment.yaml` for a monolith, and `deploy/k8s/<zone>/deployment.yaml`,
  // `deploy/k8s/<unit>/service.yaml`, `deploy/k8s/datenfluss-<id>/cronjob.yaml` once the project declares
  // zones or a deploy split. An incomplete list does not under-report here — it OVER-reports: every unlisted
  // manifest becomes a false blocker, which is the exact failure this exemption exists to end (measured on
  // `hundesteuer`: the leakage finding on `deploy/k8s/deployment.yaml` was that run's LAST blocker).
  //
  // ⚠️ THE FIRST CUT WAS WRITTEN, SHIPPED AND SILENTLY INERT. It assumed `join` strips a trailing slash and
  // appended one, producing `deploy/k8s//` — a prefix that matches nothing. The gate behaved exactly as
  // before and nothing went red. That is why this witness pins the SEPARATOR itself and not merely "a
  // directory can be declared": the failure mode of this feature is silence, not noise.
  // ⛔ AND THE WITNESS MUST NOT NAME `apps/fachverfahren` (measured 2026-09-15, it did).
  //
  // `collectDeclaredSeam` walks `apps/*` and stores `apps/<NAME>/<entry>`. In the pristine template that
  // NAME is `fachverfahren`; in a SCAFFOLDED procedure the directory is renamed after the domain, so the
  // stored form reads `apps/beispiel/deploy/k8s/`. Pinning the template's own demo identity made this test
  // pass here and fail in every consumer: `pnpm run test:generated-app-ci` (the gate that proves a freshly
  // scaffolded app passes ITS OWN CI) went red on `domain=beispiel`, and with it the push.
  //
  // ⭐ So the subject is taken from the SAME source the function reads — not from a second, hand-written
  // copy of a name. The house has paid this exact class before (23 witnesses anchored on the template's
  // demo identity, 2026-08-31).
  it("a declared directory seam carries exactly one separator and matches what lives under it", async () => {
    const seam = await collectDeclaredSeam(root);
    // POSITIVE CONTROL: without an app directory carrying a declared seam there is nothing to judge, and a
    // green verdict over the empty set would be the loudest lie this suite could tell.
    const dir = [...seam].find((entry) => entry.endsWith("/deploy/k8s/"));
    expect(
      dir,
      "no app declares `deploy/k8s/` as a directory seam",
    ).toBeDefined();
    const appDir = dir!.slice(0, dir!.indexOf("/deploy/k8s/"));
    expect(appDir.startsWith("apps/")).toBe(true);
    expect([...seam].some((entry) => entry.includes("//"))).toBe(false);
    // The call site matches with `startsWith` — so the stored form must actually match a real manifest path.
    const manifest = `${appDir}/deploy/k8s/deployment.yaml`;
    expect(
      [...seam].some(
        (entry) => entry.endsWith("/") && manifest.startsWith(entry),
      ),
    ).toBe(true);
    // NEGATIVE CONTROL: a sibling OUTSIDE the declared directory must NOT be covered.
    const sibling = `${appDir}/deploy-notes.yaml`;
    expect(
      [...seam].some(
        (entry) => entry.endsWith("/") && sibling.startsWith(entry),
      ),
    ).toBe(false);
    // The file entries keep working — a directory declaration must not swallow the exact-match ones.
    expect(seam.has(`${appDir}/src/leistung.config.ts`)).toBe(true);
  });

  it("validates source registry and preflight contracts", async () => {
    expect(await validateSourceRegistry(root)).toEqual([]);
    expect(await validateAgentPreflight(root)).toEqual([]);
  });

  // ── A GENERATED ARTEFACT IS NOT AUTHORED CODE (2026-09-14) ───────────────────────────────────────────────
  //
  // MEASURED on a real generated project (`hundesteuer`): the leakage gate reported FIVE hard findings —
  //
  //     apps/fachverfahren/deploy/k8s/service.yaml contains domain term Hundesteuer outside modules/hundesteuer
  //
  // — and they were that run's ONLY remaining blocker on the way to `fertig` (10/10 mandatory requirements,
  // shipped tests PASSED 145/0). A k8s Service for the Hundesteuer deployment MUST be named after it: that is
  // IDENTITY, not leakage. This gate already says so at its own exception: it protects AUTHORED code.
  //
  // The criterion therefore moves from a FILE NAME to a property the artefact carries itself. The generator
  // side was fixed first (CHOS `deploy-emit` now stamps every manifest it writes at its one seam), so the
  // property is actually readable — a gate cannot apply a rule it cannot see.
  //
  // ⚠️ THE RESIDUAL RISK IS NAMED, NOT WAVED AWAY: a header is a claim, and an agent could write one to slip
  // domain vocabulary into shared code. Two things bound it. The marker must NAME ITS PRODUCER (both real
  // generators do: "CHOS deploy-emit", "scripts/emit-docs-manifest.mts"), so a bare "// GENERATED" does not
  // pass. And this gate is an advisory guard against ACCIDENTAL hardcoding, not an adversarial control — the
  // measured cost of the false blocker (one run's whole path to done) exceeds the cost of that residue.
  // What would make this wrong: a run that writes shared runtime code and stamps it as generated. If that is
  // ever measured, the criterion must narrow to declared generator outputs, not widen further.
  // ── A GATE BEHIND ANOTHER GATE'S EARLY RETURN IS A GATE THAT SWITCHES ITSELF OFF (2026-09-14) ─────────
  //
  // `validateSkillShims` and `validateDomainLeakage` used to be the last two statements of
  // `validateAgentDiscovery`, behind its `if (!discovery) return failures;`. Neither reads `discovery`.
  // So a missing or unreadable `agent.discovery.json` silently switched BOTH off, and the only symptom was
  // one line about a different file — the house class «a failure became a statement: there is nothing»,
  // applied to a gate's own existence. Found while building the witness below: its fixture was green twice
  // for the wrong reason before the manifest was added.
  it("preflight: a broken discovery manifest does not switch the leakage gate off", async () => {
    const temp = await mkdtemp(join(tmpdir(), "preflight-gate-off-"));
    try {
      await mkdir(join(temp, "docs", "examples", "x"), { recursive: true });
      await mkdir(join(temp, "modules", "hundesteuer"), { recursive: true });
      const k8s = join(temp, "apps", "fachverfahren", "deploy", "k8s");
      await mkdir(k8s, { recursive: true });
      await writeFile(
        join(temp, "docs", "examples", "x", "app.spec.yaml"),
        "domainVocabulary:\n  - Hundesteuer\nmodule:\n  destination: modules/hundesteuer\n",
        "utf8",
      );
      await writeFile(
        join(k8s, "leaks.yaml"),
        "name: hundesteuer-service\n",
        "utf8",
      );
      await writeFile(
        join(temp, "package.json"),
        JSON.stringify({ name: "gate-off-fixture", scripts: {} }),
        "utf8",
      );

      // (a) THE MANIFEST IS ABSENT — which is exactly when the gate used to disappear.
      const ohneManifest = await validateAgentPreflight(temp);
      expect(
        ohneManifest.some((f) => f.includes("cannot read")),
        "POSITIVE CONTROL: the missing manifest must still be reported",
      ).toBe(true);
      expect(
        ohneManifest.some((f) => f.includes("leaks.yaml")),
        `the leak must be reported EVEN THOUGH the manifest is unreadable — got: ${JSON.stringify(ohneManifest).slice(0, 300)}`,
      ).toBe(true);

      // (b) AND WITH A READABLE MANIFEST NOTHING CHANGES ABOUT THE LEAK — the two are independent, which is
      //     the whole reason the gate does not belong behind the other one's early return.
      await writeFile(
        join(temp, "agent.discovery.json"),
        JSON.stringify({
          $schema: "x",
          schemaVersion: "1.0.0",
          templateVersion: "1.0.0",
        }),
        "utf8",
      );
      const mitManifest = await validateAgentPreflight(temp);
      expect(mitManifest.some((f) => f.includes("leaks.yaml"))).toBe(true);
      expect(
        mitManifest.some((f) => f.includes("cannot read agent.discovery.json")),
      ).toBe(false);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("leakage gate: a file that declares itself generated is not authored code", async () => {
    const temp = await mkdtemp(join(tmpdir(), "leak-generated-"));
    try {
      // ── WHAT THIS FIXTURE HAS TO CARRY, AND WHY — all four parts were MEASURED, not guessed ─────────────
      //
      // (a) NOT THE KIT ROOT. The pristine template declares no module and ships no `app.spec.yaml` under
      //     `docs/examples`, so `specs` is empty and the loop body never runs. A test against the root would
      //     be VACUOUSLY GREEN — which is exactly why the kit's own preflight passes while a generated
      //     project reports five findings.
      //
      // (b) THE SPEC LIVES UNDER `docs/examples`. `validateDomainLeakage` collects its specs from
      //     `docs/examples/**/app.spec.yaml` — a spec beside the app is not read. Placing it there was my
      //     first fixture, and it produced a silently empty `specs` and a green positive control.
      //
      // (c) ⛔ AND A READABLE `agent.discovery.json`, WHICH IS A FINDING OF ITS OWN. The leakage gate is the
      //     LAST statement of `validateAgentDiscovery`, behind its early `if (!discovery) return failures;`.
      //     So a missing or unreadable discovery manifest silently switches the whole domain-leakage gate
      //     (and the skill-shim gate) OFF, and the only symptom is one line about a different file. Measured:
      //     without the manifest this fixture reports 3 findings and NONE of them is the leak; with it, 3
      //     findings of which one IS. That is the house class «a failure became a statement: there is
      //     nothing» — recorded here, cut separately, because it is a different gate's control flow.
      //
      // (d) The two remaining findings (`platform/capabilities.json`, `sources/registry.yaml`) are noise from
      //     other validators. Every assertion below therefore names the FILE, never a finding count.
      await mkdir(join(temp, "docs", "examples", "x"), { recursive: true });
      await mkdir(join(temp, "modules", "hundesteuer"), { recursive: true });
      const k8s = join(temp, "apps", "fachverfahren", "deploy", "k8s");
      await mkdir(k8s, { recursive: true });
      await writeFile(
        join(temp, "docs", "examples", "x", "app.spec.yaml"),
        "domainVocabulary:\n  - Hundesteuer\nmodule:\n  destination: modules/hundesteuer\n",
        "utf8",
      );
      await writeFile(
        join(temp, "agent.discovery.json"),
        JSON.stringify({
          $schema: "x",
          schemaVersion: "1.0.0",
          templateVersion: "1.0.0",
        }),
        "utf8",
      );
      await writeFile(
        join(temp, "package.json"),
        JSON.stringify({ name: "leak-fixture", scripts: {} }),
        "utf8",
      );

      const meldet = async (inhalt: string) => {
        await writeFile(join(k8s, "handwritten.yaml"), inhalt, "utf8");
        const befunde = await validateAgentPreflight(temp);
        return {
          leck: befunde.some((f) => f.includes("handwritten.yaml")),
          befunde,
        };
      };

      // (0) POSITIVE CONTROL — without it, "no finding" is indistinguishable from "the gate never looked".
      const unmarkiert = await meldet("name: hundesteuer-service\n");
      expect(
        unmarkiert.leck,
        `the gate must report an UNMARKED file — got: ${JSON.stringify(unmarkiert.befunde).slice(0, 240)}`,
      ).toBe(true);

      // (1) THE SAME CONTENT, declaring its producer in its head: not authored code, not this gate's business.
      expect(
        (
          await meldet(
            "# GENERIERT (deterministisch, CHOS deploy-emit) — nicht von Hand pflegen.\nname: hundesteuer-service\n",
          )
        ).leck,
      ).toBe(false);

      // (1b) The comment syntax is the file's, not the rule's — `//` carries the same declaration as `#`.
      expect(
        (
          await meldet(
            '// GENERATED by scripts/emit-docs-manifest.mts\nexport const x = "Hundesteuer";\n',
          )
        ).leck,
      ).toBe(false);

      // (2) ⛔ A BARE WORD IS NOT A DECLARATION — the producer name is the whole difference, in both languages.
      expect(
        (await meldet("# GENERATED\nname: hundesteuer-service\n")).leck,
        "a bare marker without a named producer must NOT exempt a file",
      ).toBe(true);
      expect(
        (await meldet("# GENERIERT\nname: hundesteuer-service\n")).leck,
      ).toBe(true);

      // (3) ⛔ ONLY THE HEAD COUNTS. A marker further down is CONTENT — otherwise any file could exempt itself
      //     by mentioning the word somewhere. Measured boundary: line 3 passes, line 4 does not.
      expect(
        (
          await meldet(
            "a: 1\nb: 2\n# GENERIERT von CHOS deploy-emit\nname: hundesteuer-service\n",
          )
        ).leck,
      ).toBe(false);
      expect(
        (
          await meldet(
            "a: 1\nb: 2\nc: 3\n# GENERIERT von CHOS deploy-emit\nname: hundesteuer-service\n",
          )
        ).leck,
        "a marker below the head is content, not a declaration",
      ).toBe(true);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

function validReportForSpec({
  spec,
  task,
  taskHash,
  filesChanged,
}: {
  spec: AppSpec;
  task: string;
  taskHash: string;
  filesChanged: string[];
}) {
  return {
    schemaVersion: "1.0.0",
    runId: "test-run",
    task,
    taskHash,
    selectedInstructionHashes: [],
    filesChanged: filesChanged.map((path) => ({ path })),
    commandsExecuted: [
      {
        id: "test",
        command: "pnpm test",
        cwd: ".",
      },
    ],
    acceptanceCriteria: spec.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      tests: criterion.tests,
    })),
  };
}
