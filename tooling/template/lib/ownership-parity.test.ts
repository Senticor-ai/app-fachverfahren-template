import { describe, expect, it } from "vitest";
import { runGit } from "./git.ts";
import {
  defaultOwnership,
  explainOwnership,
  matchesOwnershipPattern,
} from "./manifest.ts";
import { managedCandidateFiles } from "./merge.ts";
import { isLiveConsumerProject, isRenderedRepoPath } from "./render.ts";

// Ownership-/Scaffold-Paritäts-Ratsche: JEDE Datei, die der Scaffold in Konsumenten kopiert,
// braucht eine EXPLIZITE Update-Entscheidung. `explainOwnership` fällt für ungelistete Pfade auf
// `(default) merge` zurück — und merge-Pfade außerhalb der kuratierten Kandidatenliste nimmt der
// Update-Plan NIE in die Hand (planOwnershipUpdate). Ein solcher Pfad wird also gescaffoldet,
// aber von template:update für immer stillschweigend übersprungen. Genau so brach der
// Demo-Konsument: `packages/**` hatte keinen Ownership-Eintrag, PR #27 änderte Server-Code und
// Paket-API im Gleichschritt, das Update erneuerte nur apps/*/server/** — TS-Fehler gegen die
// alte Paket-API (Deploy-Run 29241279544).
//
// Fällt dieser Test bei einer NEUEN Datei durch, gibt es zwei legitime Auswege:
//  1. Der Pfad ist Vorlagen-Fundament → Ownership-Eintrag in defaultOwnership (manifest.ts).
//  2. Der Pfad gehört bewusst dem Konsumenten bzw. bleibt bewusst un-verwaltet → Eintrag
//     UNTEN in updateUnmanagedPaths, mit Begründung in der jeweiligen Gruppe.
// (Kein Block-Kommentar: die Muster enthalten `*/` und beendeten ihn vorzeitig.)

// Bewusst NICHT update-verwaltete Pfade (Stand: Aufnahme dieser Ratsche). Muster bewusst ENG
// halten: ein breites `apps/*/**` würde z.B. auch das Verschwinden des `apps/*/server/**`-Eintrags
// maskieren. Tote Einträge (matchen keine unverwaltete Datei mehr) meldet der zweite Test —
// so schrumpft die Liste mit, wenn Pfade später verwaltet werden.
const updateUnmanagedPaths: string[] = [
  // Repo-/Editor-/Toolchain-Konfiguration der Konsumenten: nach dem Scaffold deren Hoheit.
  ".dockerignore",
  // Lokales Dev-Postgres (Ein-Kommando-Start): Konsumenten betreiben ihre DB selbst (Compose/k8s/Cloud).
  "docker-compose.yml",
  ".editorconfig",
  ".env.example",
  ".gitignore",
  ".npmrc",
  ".prettierignore",
  ".prettierrc",
  "eslint.config.js",
  "mise.toml",
  "tsconfig.base.json",
  "tsconfig.json",
  "tsconfig.storybook.json",
  "tsconfig.strict.json",
  "vitest.browser.config.ts",
  "vitest.config.ts",
  "vitest.e2e.config.ts",
  // Postgres-Integrationstest-Konfig (testcontainers) — wie vitest.e2e/browser Konsumenten-Hoheit.
  "vitest.pg.config.ts",
  "vitest.shims.d.ts",
  // MSW-Service-Worker (generiert, Test-Artefakt für vitest-browser) — Konsumenten-Hoheit.
  "public/mockServiceWorker.js",
  ".storybook/**",
  // Konsumenten-CI und -Git-Hooks: laufen im Konsumenten-Repo, dessen Entwickler entscheiden.
  ".github/workflows/**",
  ".husky/**",
  "scripts/git-hooks/**",
  "scripts/setup-husky.mjs",
  "scripts/verify-husky.mjs",
  // Agent-Skill-Zeiger (.claude spiegelt die verwalteten .agents/skills/**) — Kandidat für
  // einen späteren replace-Eintrag, bis dahin bewusst hier dokumentiert.
  ".claude/skills/**",
  // Release-Notes-Fragmente der Vorlage: Provenienz-Doku, kein Laufzeitverhalten.
  ".template-changes/**",
  // Repo-Stammdokumente: Konsumenten schreiben sie um (Projektname, Governance, Lizenzwahl).
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  // App-Hülle außerhalb der verwalteten server/public/deploy-Bäume: Frontend/Config, die
  // Konsumenten an ihre Domäne anpassen. Achtung: Vorlagen-PRs, die Frontend UND Server ändern,
  // erreichen Konsumenten hier NICHT über template:update — bekannte Lücke, Produktentscheidung.
  "apps/*/dev-proxy.ts",
  "apps/*/index.html",
  "apps/*/leistung.contract.json",
  "apps/*/package.json",
  "apps/*/procedure.contract.json",
  "apps/*/scripts/**",
  "apps/*/src/**",
  "apps/*/tests/**",
  "apps/*/tsconfig.json",
  "apps/*/tsconfig.server.json",
  "apps/*/vite.config.ts",
  // Lokale Entwicklungsumgebung + E2E + PG-Testcontainer-Setup: Konsumenten-Hoheit.
  "dev/**",
  "tests/e2e/**",
  "tests/pg/**",
  // Arbeitsplaene der VORLAGE selbst: Projekt-Steuerung dieses Repos, kein Konsumenten-Fundament.
  // Seit dem Doku-Umbau 2026-07-31 liegen sie geschlossen unter `docs/planning/` (vorher lose im
  // docs-Wurzelverzeichnis als `docs/UX-UPGRADE-PLAN.md` + `docs/PLAN-*.md`). EIN Ordner-Muster statt
  // zweier Einzel-/Namensmuster — damit der naechste Plan die Ratsche nicht erneut rot faerbt und der
  // Dead-Entry-Test unten das Muster ehrlich haelt (verschwindet der letzte Plan, meldet er den toten
  // Eintrag).
  "docs/planning/**",
  // Der Doku-INDEX (2026-07-31 neu angelegt): Konsumenten-Hoheit, und zwar nicht aus Bequemlichkeit.
  // Er benennt die Bereiche nach Rolle — und die Mehrzahl davon (adr/, planning/, architecture/,
  // compliance/ …) steht genau in dieser Liste, gehoert also dem Konsumenten. Ein von der Vorlage
  // ERSETZTER Index wuerde bei jedem Update auf Ordner zeigen, die der Konsument anders fuehrt: er
  // waere ein Verzeichnis fremder Wahrheit ueber eigenem Bestand. Die Vorlage liefert ihn einmal als
  // Startpunkt; ab dann pflegt ihn, wem der Inhalt gehoert.
  "docs/README.md",
  // `docs/adr/**` ist seit 2026-08-31 im Manifest als `consumer` gefuehrt — also explizit klassifiziert
  // und hier tot. Die Liste schrumpft mit, genau wie ihr Kopf es vorsieht.
  "docs/architecture/**",
  "docs/compliance/**",
  "docs/contributing/**",
  "docs/examples/**",
  "docs/migration/**",
  "docs/operations/**",
  "docs/ux-ui/**",
  "docs/validation/**",
  // Rechtsraum-Pakete: Konsumenten ergänzen eigene Jurisdiktionen — Kandidat für replace,
  // sobald die Abgrenzung geteilt/konsumenten-eigen entschieden ist.
  "jurisdictions/*/**",
  // modules/*/** ist consumer-verwaltet; die Wurzel-Doku daneben gehört ebenfalls dem Konsumenten.
  "modules/AGENTS.md",
  "modules/README.md",
  // Lockfiles divergieren legitim (siehe deploy-demo-consumer.sh: bewusst nicht template-managed).
  "pnpm-lock.yaml",
  // Repo-Skripte außerhalb der verwalteten check-template-*/check-web|k8s-delivery/scaffold-*-Muster.
  "scripts/check-antrag-procedure.mts",
  "scripts/check-bpmn-example.mts",
  "scripts/check-composables.mts",
  // check:composables-Härtung (S7): gemountete Composables Anspruch∧Beleg. Lib + Test der
  // Mesh-Mount-Prüfung — Repo-Maintainer-Skripte wie check-composables.mts selbst, kein
  // Konsumenten-verwaltetes Vorlagen-Fundament.
  "scripts/lib/verify-mounted-composables.mts",
  // Geteilter Nutzlast-Filter der Quell-Gates (CSS-Token + Motion): Dokumentation ist kein Code. Gehoert zu
  // denselben Repo-Maintainer-Skripten wie die Gates, die ihn benutzen — kein Konsumenten-Fundament.
  "scripts/lib/doku-nutzlast.mjs",
  "scripts/verify-mounted-composables.test.ts",
  "scripts/check-css-token-aliases.mjs",
  "scripts/check-dev-dependencies.mjs",
  "scripts/check-dockerfile-paths.mjs",
  "scripts/check-domain-contracts.mjs",
  "scripts/check-esm-policy.mjs",
  "scripts/check-leistung-contract.mts",
  // Emit der Pflicht-Form nach schemas/leistung-config.schema.json. Gehoert derselben Klasse an wie
  // check-leistung-contract.mts, dessen Frische-Gate ihn erzwingt: Repo-Maintainer-Skript, kein
  // Konsumenten-Fundament. Sein ERZEUGNIS (schemas/**) ist dagegen `replace` und reist mit.
  "scripts/emit-leistung-schema.mts",
  "scripts/check-motion-tokens.mjs",
  "scripts/check-procedure-contract.mts",
  "scripts/check-pwa-browser.mjs",
  "scripts/check-pwa-runtime.mjs",
  "scripts/check-storybook-coverage.mjs",
  "scripts/check-typescript-policy.mjs",
  "scripts/ci-setup-node.sh",
  "scripts/ci-validate.sh",
  "scripts/codesphere-redeploy-demo.sh",
  "scripts/deploy-demo-consumer.sh",
  // Lokaler Dev-Runtime-Starter (pnpm dev:api): wie dev/** Konsumenten-Hoheit — Ports,
  // Postgres-URL und Bootstrap-Weg sind Umgebungsentscheidungen des Konsumenten.
  "scripts/dev-api.mjs",
  "scripts/dev-api.test.mjs",
  "scripts/evidence-build.mjs",
  "scripts/motion-baseline.json",
  // PDF/A-Konvertierung des Bescheids (open source, Python/pikepdf, kein Java) — polyglottes Tool
  // + Doku; Toolchain-Bereitstellung (venv/ICC) ist Umgebungsentscheidung des Konsumenten.
  "scripts/pdfa/**",
  "scripts/smoke-generated-app.sh",
  "scripts/test-generated-app-ci.guard.test.ts",
  "scripts/test-generated-app-ci.sh",
  // Flotten-Registry der Vorlagen-Maintainer.
  "template-consumers.yaml",
];

const root = process.cwd();

// Die Baum-Prüfungen gelten nur der PRISTINEN Vorlage: Konsumenten führen diese Tests über die
// verbatim kopierte Engine ebenfalls aus, und deren Bäume enthalten legitim eigene Dateien.
//
// ── DER RIEGEL WAR RICHTIG UND FRAGTE DAS FALSCHE (gemessen 2026-08-31) ──────────────────────────────────
// Er fragte nach dem PAKETNAMEN — `sourcePackage.name.includes("fachverfahren-template")`. Ein Konsument, der
// die Vorlage klont, ohne sie umzubenennen, traegt diesen Namen weiter; gemessen an zwei fertig gebauten
// Verfahren steht in beiden `senticor-app-fachverfahren-template` in der Wurzel-`package.json`. Der Riegel
// hielt sie also fuer die pristine Vorlage, liess die Baum-Pruefungen laufen und meldete die sechzehn Dateien
// des governten Baus als unklassifiziert — in JEDEM erzeugten Verfahren.
//
// Gefragt wird jetzt nach der EIGENSCHAFT, und zwar mit DEMSELBEN Praedikat, das der Scaffold-Riegel benutzt
// (`isLiveConsumerProject`, CHOS-CODE#68): traegt der Baum CHOS-Overlay-Marken (`.chos/`, `cognitive-hive.*`),
// ist er ein governter Konsument. Ein Name kann mitwandern; diese Marken entstehen erst im Bau.
const isPristineTemplate = !(await isLiveConsumerProject(root));

async function listRenderedTrackedFiles(): Promise<string[]> {
  const result = await runGit(["ls-files", "-z"], { cwd: root });
  return result.stdout.split("\0").filter(Boolean).filter(isRenderedRepoPath);
}

function isExplicitlyClassified(path: string): boolean {
  if (explainOwnership(defaultOwnership, path).pattern !== "(default)") {
    return true;
  }
  // Kuratierte merge-Kandidaten (planOwnershipUpdate): tauchen bei Drift als Konflikt auf —
  // bewusst behandelt, auch ohne Ownership-Muster.
  return managedCandidateFiles.includes(path);
}

describe("ownership/scaffold parity", () => {
  it("resolves shared runtime packages to replace", () => {
    const sample = explainOwnership(
      defaultOwnership,
      "packages/app-store-postgres/src/index.ts",
    );
    expect(sample).toEqual({ pattern: "packages/*/**", strategy: "replace" });
  });

  it("hält die Dossier-Naht beim Konsumenten — sonst überschriebe template:update sein Verfahren", () => {
    // procedure.config.ts trägt das Verfahren des Konsumenten (dossierProcedure). Fiele sie unter
    // apps/*/server/** = replace, überschriebe JEDES Upgrade sie mit dem neutralen Musterverfahren.
    expect(
      explainOwnership(
        defaultOwnership,
        "apps/fachverfahren/server/procedure.config.ts",
      ),
    ).toEqual({
      pattern: "apps/*/server/procedure.config.ts",
      strategy: "consumer",
    });
    // Die Composable-Naht bleibt ebenfalls beim Konsumenten (deklariert seine Composables + Spine-Agenten).
    expect(
      explainOwnership(
        defaultOwnership,
        "apps/fachverfahren/server/composables.config.ts",
      ),
    ).toEqual({
      pattern: "apps/*/server/composables.config.ts",
      strategy: "consumer",
    });
    // Das übrige Server-Fundament bleibt Vorlagen-besitz (replace) — die Ausnahme ist chirurgisch.
    expect(
      explainOwnership(defaultOwnership, "apps/fachverfahren/server/index.ts"),
    ).toEqual({ pattern: "apps/*/server/**", strategy: "replace" });
  });

  it.skipIf(!isPristineTemplate)(
    "classifies every scaffolded file: ownership entry, curated candidate, or documented opt-out",
    async () => {
      const files = await listRenderedTrackedFiles();
      // Leere Liste hieße git-Ausfall, nicht Erfolg — die Ratsche wäre stillschweigend blind.
      expect(files.length).toBeGreaterThan(100);
      const offenders = files.filter(
        (file) =>
          !isExplicitlyClassified(file) &&
          !updateUnmanagedPaths.some((pattern) =>
            matchesOwnershipPattern(pattern, file),
          ),
      );
      expect(offenders).toEqual([]);
    },
  );

  it.skipIf(!isPristineTemplate)(
    "keeps the opt-out list free of dead entries",
    async () => {
      const files = await listRenderedTrackedFiles();
      const unmanaged = files.filter((file) => !isExplicitlyClassified(file));
      const dead = updateUnmanagedPaths.filter(
        (pattern) =>
          !unmanaged.some((file) => matchesOwnershipPattern(pattern, file)),
      );
      expect(dead).toEqual([]);
    },
  );
});
