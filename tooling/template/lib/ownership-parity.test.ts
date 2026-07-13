import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runGit } from "./git.ts";
import {
  defaultOwnership,
  explainOwnership,
  matchesOwnershipPattern,
} from "./manifest.ts";
import { managedCandidateFiles } from "./merge.ts";
import { isRenderedRepoPath } from "./render.ts";

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
  "vitest.shims.d.ts",
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
  "apps/*/index.html",
  "apps/*/leistung.contract.json",
  "apps/*/package.json",
  "apps/*/scripts/**",
  "apps/*/src/**",
  "apps/*/tests/**",
  "apps/*/tsconfig.json",
  "apps/*/tsconfig.server.json",
  "apps/*/vite.config.ts",
  // Lokale Entwicklungsumgebung + E2E: Konsumenten-Hoheit.
  "dev/**",
  "tests/e2e/**",
  // Doku außerhalb der verwalteten docs/agents|assets|reference|capabilities-Bäume.
  "docs/UX-UPGRADE-PLAN.md",
  "docs/adr/**",
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
  "scripts/check-css-token-aliases.mjs",
  "scripts/check-dev-dependencies.mjs",
  "scripts/check-dockerfile-paths.mjs",
  "scripts/check-domain-contracts.mjs",
  "scripts/check-esm-policy.mjs",
  "scripts/check-leistung-contract.mts",
  "scripts/check-motion-tokens.mjs",
  "scripts/check-pwa-browser.mjs",
  "scripts/check-pwa-runtime.mjs",
  "scripts/check-storybook-coverage.mjs",
  "scripts/check-typescript-policy.mjs",
  "scripts/ci-setup-node.sh",
  "scripts/ci-validate.sh",
  "scripts/codesphere-redeploy-demo.sh",
  "scripts/deploy-demo-consumer.sh",
  "scripts/evidence-build.mjs",
  "scripts/motion-baseline.json",
  "scripts/smoke-generated-app.sh",
  "scripts/test-generated-app-ci.guard.test.ts",
  "scripts/test-generated-app-ci.sh",
  // Flotten-Registry der Vorlagen-Maintainer.
  "template-consumers.yaml",
];

const root = process.cwd();

// Die Baum-Prüfungen gelten nur der PRISTINEN Vorlage: Konsumenten führen diese Tests über die
// verbatim kopierte Engine ebenfalls aus, und deren Bäume enthalten legitim eigene Dateien.
// Gleiches Selbsttest-Idiom wie die Engine (`sourcePackage.name.includes("fachverfahren-template")`).
const rootPackage = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
) as { name?: string };
const isPristineTemplate = (rootPackage.name ?? "").includes(
  "fachverfahren-template",
);

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
