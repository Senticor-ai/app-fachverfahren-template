import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDomainApp } from "./render.ts";
import { assertRefusesToScaffold, canScaffoldFrom } from "./pristine-source.ts";

// Verzeichnisse, die beim Residue-Scan NICHT als Fehler zählen: Build-/Abhängigkeits-Ausgaben und
// die Provenienz-Metadaten (.template/lock.json führt bewusst den Namen der QUELL-Vorlage
// `senticor-app-fachverfahren-template` — das ist korrekte Herkunft, kein Residue).
const scanIgnored = new Set([".git", "node_modules", ".template"]);

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!scanIgnored.has(entry.name)) {
        files.push(...(await collectFiles(join(root, entry.name))));
      }
    } else {
      files.push(join(root, entry.name));
    }
  }
  return files;
}

/**
 * Liest alle Text-Dateien unter `root` EINMAL und prüft jeden Inhalt gegen ALLE Muster.
 * Ergebnis: Muster-Schlüssel -> repo-relative Treffer-Pfade. So localisiert ein fehlgeschlagenes
 * Contract-Assert weiterhin die konkrete Datei — aber der Full-Tree-Scan kostet nur EINEN
 * I/O-Durchlauf statt einem pro Muster. Auf den engen opencode.de-Runner-Quoten (siehe
 * vitest.config.ts) war der Mehrfach-Scan der Timeout-Treiber (RC1: 6 Durchläufe, 60s+).
 */
async function residueByPattern(
  root: string,
  patterns: Record<string, RegExp>,
): Promise<Record<string, string[]>> {
  const hits: Record<string, string[]> = {};
  for (const key of Object.keys(patterns)) {
    hits[key] = [];
  }
  for (const file of await collectFiles(root)) {
    const rel = relative(root, file).split("\\").join("/");
    // Die generische Engine unter tooling/template/ wird VERBATIM kopiert (siehe RC4-Test) und führt
    // ihre Ersetzungs-Tabelle + Fixtures als DATEN — dort ist `fachverfahren` legitim, kein App-Residue.
    if (rel.startsWith("tooling/template/")) {
      continue;
    }
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    // NUL-Byte => Binärdatei, kein Text-Residue-Kandidat.
    if (content.includes("\u0000")) {
      continue;
    }
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) {
        hits[key].push(rel);
      }
    }
  }
  return hits;
}

/** Erwartungswert für einen residue-freien Scan: jedes Muster ohne Treffer. */
function noResidue(patterns: Record<string, RegExp>): Record<string, string[]> {
  return Object.fromEntries(Object.keys(patterns).map((key) => [key, []]));
}

// Jeder Test rendert das volle Repo (RC2 sogar zweimal) und scannt danach den kompletten Baum —
// das Zeitbudget dafür setzt zentral das `template-tooling`-Projekt in vitest.config.ts.
describe("domain app render contract", () => {
  it("leaves NO base-template identity residue after scaffold (RC1: text detection covers .mts/.env.example/.husky)", async () => {
    // ── NO PRISTINE SOURCE HERE? THEN THE GUARD IS WHAT GETS PROVEN ────────────────────────────────────
    // This engine ships into every generated application, and a governed consumer has nothing pristine to
    // render FROM (CHOS-CODE#68). Measured 2026-08-31 in two built procedures this assertion was red with the
    // guard's own message — a witness without a subject, not a defect. Skipping quietly would claim a check
    // that never happened, so the consumer branch asserts the refusal instead: the property matters most
    // exactly where it fires.
    if (!(await canScaffoldFrom(process.cwd()))) {
      await assertRefusesToScaffold(() =>
        renderDomainApp(process.cwd(), join(tmpdir(), "never-created"), {
          domain: "demo-k8s",
          displayName: "Demo",
          force: true,
          allowDirty: true,
        }),
      );
      return;
    }
    const root = await mkdtemp(join(tmpdir(), "render-contract-residue-"));
    try {
      const target = join(root, "app");
      await renderDomainApp(process.cwd(), target, {
        domain: "beispiel",
        displayName: "Beispiel",
        force: true,
        allowDirty: true,
      });

      // Der umbenannte App-Ordner (apps/fachverfahren -> apps/beispiel) und das Helm-Chart dürfen
      // NIRGENDS mehr unter dem alten Pfad referenziert werden — jede Referenz bricht die generierte
      // App (z.B. scripts/check-leistung-contract.mts importiert apps/<domain>/src/leistung.config.ts).
      const patterns = {
        "apps/fachverfahren": /apps\/fachverfahren\b/,
        "deploy/helm/fachverfahren": /deploy\/helm\/fachverfahren\b/,
        // Das App-Paket (@senticor/fachverfahren) wird umbenannt; @senticor/fachverfahren-kit bleibt.
        "@senticor/fachverfahren": /@senticor\/fachverfahren(?!-kit)/,
        // Der Vorlagen-Repo-Name wird zur App-Identität (außerhalb von .template/, siehe scanIgnored).
        "senticor-app-fachverfahren-template":
          /senticor-app-fachverfahren-template/,
        // Punkt-/Label-Identitäten (Agent-Discovery-ID, unquotiertes k8s-part-of-Label) mit-umschreiben.
        "senticor.fachverfahren": /senticor\.fachverfahren\b/,
        "app.kubernetes.io/part-of: fachverfahren":
          /app\.kubernetes\.io\/part-of: *fachverfahren\b/,
      };
      expect(await residueByPattern(target, patterns)).toEqual(
        noResidue(patterns),
      );
      // Kein kopierter TS-Inkrementell-State: `*.tsbuildinfo` (git-ignoriert, liegt neben tsconfig)
      // täuschte aus einem gebauten Arbeitsbaum `tsc -b` „schon gebaut" vor -> TS6305 im generierten App.
      const copiedBuildInfo = (await collectFiles(target))
        .filter((file) => file.endsWith(".tsbuildinfo"))
        .map((file) => relative(target, file));
      expect(copiedBuildInfo).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("re-scaffolds from an ALREADY-scaffolded consumer (RC2: render is domain-agnostic about its source app)", async () => {
    // ── NO PRISTINE SOURCE HERE? THEN THE GUARD IS WHAT GETS PROVEN ────────────────────────────────────
    // This engine ships into every generated application, and a governed consumer has nothing pristine to
    // render FROM (CHOS-CODE#68). Measured 2026-08-31 in two built procedures this assertion was red with the
    // guard's own message — a witness without a subject, not a defect. Skipping quietly would claim a check
    // that never happened, so the consumer branch asserts the refusal instead: the property matters most
    // exactly where it fires.
    if (!(await canScaffoldFrom(process.cwd()))) {
      await assertRefusesToScaffold(() =>
        renderDomainApp(process.cwd(), join(tmpdir(), "never-created"), {
          domain: "demo-k8s",
          displayName: "Demo",
          force: true,
          allowDirty: true,
        }),
      );
      return;
    }
    const root = await mkdtemp(join(tmpdir(), "render-contract-rescaffold-"));
    try {
      // 1) Vorlage -> Konsument `beispiel`.
      const consumer = join(root, "beispiel");
      await renderDomainApp(process.cwd(), consumer, {
        domain: "beispiel",
        displayName: "Beispiel",
        force: true,
        allowDirty: true,
      });

      // 2) Konsument `beispiel` -> `demo-k8s`. Das ist exakt, was die mitgelieferte render.test.ts
      //    im generierten `pnpm test` tut. Es MUSS funktionieren, obwohl die Basis-App jetzt
      //    apps/beispiel heißt (nicht apps/fachverfahren).
      const second = join(root, "demo-k8s");
      await renderDomainApp(consumer, second, {
        domain: "demo-k8s",
        displayName: "Demo K8s",
        force: true,
        allowDirty: true,
      });

      // App + Helm-Chart wurden anhand der ERKANNTEN Basis-Domain (beispiel) umbenannt.
      await expect(
        readFile(
          join(
            second,
            "apps",
            "demo-k8s",
            "deploy",
            "helm",
            "demo-k8s",
            "Chart.yaml",
          ),
          "utf8",
        ),
      ).resolves.toContain("name: demo-k8s");

      const packageJson = await readFile(join(second, "package.json"), "utf8");
      expect(packageJson).toContain("@senticor/demo-k8s");
      expect(packageJson).not.toContain("@senticor/beispiel");

      // Keine Restspuren der Zwischen-Domain `beispiel` in Identitäts-Pfaden/-Labels.
      const patterns = {
        "apps/beispiel": /apps\/beispiel\b/,
        "@senticor/beispiel": /@senticor\/beispiel\b/,
        "senticor.beispiel": /senticor\.beispiel\b/,
        "app.kubernetes.io/part-of: beispiel":
          /app\.kubernetes\.io\/part-of: *beispiel\b/,
      };
      expect(await residueByPattern(second, patterns)).toEqual(
        noResidue(patterns),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("copies the generic template engine VERBATIM (RC4: no self-substitution of tooling/template)", async () => {
    // ── NO PRISTINE SOURCE HERE? THEN THE GUARD IS WHAT GETS PROVEN ────────────────────────────────────
    // This engine ships into every generated application, and a governed consumer has nothing pristine to
    // render FROM (CHOS-CODE#68). Measured 2026-08-31 in two built procedures this assertion was red with the
    // guard's own message — a witness without a subject, not a defect. Skipping quietly would claim a check
    // that never happened, so the consumer branch asserts the refusal instead: the property matters most
    // exactly where it fires.
    if (!(await canScaffoldFrom(process.cwd()))) {
      await assertRefusesToScaffold(() =>
        renderDomainApp(process.cwd(), join(tmpdir(), "never-created"), {
          domain: "demo-k8s",
          displayName: "Demo",
          force: true,
          allowDirty: true,
        }),
      );
      return;
    }
    const root = await mkdtemp(join(tmpdir(), "render-contract-engine-"));
    try {
      const target = join(root, "app");
      await renderDomainApp(process.cwd(), target, {
        domain: "beispiel",
        displayName: "Beispiel",
        force: true,
        allowDirty: true,
      });

      // Die Engine enthält ihre Ersetzungs-Tabelle + Provenienz-Konstanten als DATEN. Würden sie
      // textersetzt, zerlegte sich die Engine im Konsumenten selbst (z.B. `["fachverfahren-template",
      // domain]` -> `["beispiel", domain]`, eine nackte Regel, die Identifier wie `beispielBerechnung`
      // in ungültiges TS `demo-k8sBerechnung` verwandelt). Deshalb MUSS die Kopie byte-gleich sein.
      for (const rel of [
        "tooling/template/lib/render.ts",
        "tooling/template/lib/manifest.ts",
        "tooling/template/cli.ts",
      ]) {
        expect(await readFile(join(target, rel), "utf8")).toBe(
          await readFile(join(process.cwd(), rel), "utf8"),
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
