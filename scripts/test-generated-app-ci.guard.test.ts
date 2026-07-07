import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const script = join(process.cwd(), "scripts", "test-generated-app-ci.sh");

// Kanonische Identität der Vorlage — MUSS mit den Konstanten im Skript übereinstimmen.
// Bewusst dupliziert: ändert jemand die Konstanten im Skript (z.B. nach einem Repo-Umzug),
// schlägt dieser Test fehl, statt dass das Gate der Vorlage still zu skippen beginnt.
const TEMPLATE_GITLAB_PATH =
  "govtech-deutschland/platform-instances/deutschland-platform/senticor/senticor-app-fachverfahren-template";
const TEMPLATE_GITHUB_REPO = "Senticor-ai/app-fachverfahren-template";

// Neutrales cwd pro Test statt Repo-Root: diese Datei wird in generierte Konsumenten MITKOPIERT
// und läuft dort in deren `pnpm run test` — mit Repo-Root als cwd fände der Marker-Check dort
// .template/lock.json und die Fall-Through-Tests sähen die falsche Skip-Zeile. Im Temp-Verzeichnis
// ist der Marker-Zustand pro Test explizit.
let workdir: string;

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), "scaffold-health-guard-"));
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

// Minimal-Env: CI-Identitätsvariablen des echten Runners (GITHUB_REPOSITORY auf GitHub-Actions,
// CI_PROJECT_PATH auf GitLab) dürfen NICHT durchsickern, sonst testet der Test den Runner statt
// den Guard. Nur PATH bleibt erhalten.
async function runGuard(env: Record<string, string>) {
  return execFileAsync("sh", [script], {
    cwd: workdir,
    env: { PATH: process.env.PATH ?? "", ...env },
  });
}

describe("test-generated-app-ci.sh Selbst-Skip-Guard", () => {
  it("skippt in fremden GitLab-Projekten (CI_PROJECT_PATH ≠ Vorlage)", async () => {
    const { stdout } = await runGuard({
      CI_PROJECT_PATH: "someorg/some-consumer",
    });
    expect(stdout).toContain("skip: not the template's own GitLab project");
  });

  it("skippt in fremden GitHub-Repositories (GITHUB_REPOSITORY ≠ Vorlage)", async () => {
    const { stdout } = await runGuard({
      GITHUB_REPOSITORY: "someorg/some-consumer",
    });
    expect(stdout).toContain("skip: not the template's own GitHub repository");
  });

  it("skippt in per CLI generierten Konsumenten über den Marker .template/lock.json", async () => {
    await mkdir(join(workdir, ".template"));
    await writeFile(join(workdir, ".template", "lock.json"), "{}\n");
    const { stdout } = await runGuard({});
    expect(stdout).toContain(
      "skip: generated consumer app detected via .template/lock.json",
    );
  });

  it("läuft im eigenen GitLab-Projekt weiter (Identität matcht, Rekursions-Guard greift danach)", async () => {
    // SCAFFOLD_GENERATED_APP_CI_RUNNING=1 stoppt NACH Identitäts- und Marker-Guard — beweist den
    // Fall-Through, ohne die teure Scaffold-Harness wirklich zu fahren.
    const { stdout } = await runGuard({
      CI_PROJECT_PATH: TEMPLATE_GITLAB_PATH,
      SCAFFOLD_GENERATED_APP_CI_RUNNING: "1",
    });
    expect(stdout).toContain("skip: recursive generated-app CI invocation");
    expect(stdout).not.toContain("not the template's own");
  });

  it("läuft im eigenen GitHub-Repository weiter (Identität matcht)", async () => {
    const { stdout } = await runGuard({
      GITHUB_REPOSITORY: TEMPLATE_GITHUB_REPO,
      SCAFFOLD_GENERATED_APP_CI_RUNNING: "1",
    });
    expect(stdout).toContain("skip: recursive generated-app CI invocation");
    expect(stdout).not.toContain("not the template's own");
  });

  it("lokal (keine CI-Identität gesetzt) bleibt das bisherige Verhalten erhalten", async () => {
    const { stdout } = await runGuard({
      SCAFFOLD_GENERATED_APP_CI_RUNNING: "1",
    });
    expect(stdout).toContain("skip: recursive generated-app CI invocation");
  });
});
