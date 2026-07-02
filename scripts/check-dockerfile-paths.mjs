#!/usr/bin/env node
// check-dockerfile-paths — deterministischer Guard gegen genau den Fehler, der die GitLab-`container-image`-
// Stage nach dem apps/fachverfahren-template -> apps/antragsservice-Rename brach: das Dockerfile verwies auf
// Pfade, die es nicht mehr gibt (kaniko: "lstat .../apps/fachverfahren-template/package.json: no such file").
//
// Läuft OHNE Netzwerk/Registry (im Gegensatz zu `docker build`, das das opencode-Base-Image ziehen müsste und
// von GitHub-Runnern aus unzuverlässig erreichbar ist). Prüft:
//   1. Jede lokale COPY-Quelle (kein `--from=`) existiert im Repo.
//   2. Jeder referenzierte Workspace-Pfad (apps/<x>, packages/<x>, jurisdictions/<x>) — egal ob in COPY, ENV
//      oder CMD, auch hinter `/app/` — zeigt auf ein existierendes Verzeichnis. Fängt stale App-/Paketnamen
//      auch in den Runtime-COPY-`--from`-Zeilen und im CMD ab.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dockerfilePath = join(root, "Dockerfile");

if (!existsSync(dockerfilePath)) {
  console.error(
    "check-dockerfile-paths: kein Dockerfile im Repo-Root gefunden.",
  );
  process.exit(1);
}

const raw = await readFile(dockerfilePath, "utf8");
// Zeilenfortsetzungen (`\` am Zeilenende) zusammenführen, damit mehrzeilige Instruktionen als eine gelten.
const lines = raw.replace(/\\\r?\n/g, " ").split(/\r?\n/);

const violations = [];
const hasGlob = (token) => /[*?[\]]/.test(token);

// (1) Lokale COPY-Quellen prüfen.
for (const line of lines) {
  const trimmed = line.trim();
  if (!/^COPY\b/i.test(trimmed)) continue;
  if (/--from=/.test(trimmed)) continue; // Build-Stage-interne Kopie, kein Repo-Pfad.

  const tokens = trimmed
    .slice("COPY".length)
    .trim()
    .split(/\s+/)
    .filter((token) => !token.startsWith("--")); // Flags wie --chown ignorieren.

  const sources = tokens.slice(0, -1); // letzter Token = Ziel.
  for (const source of sources) {
    if (source === "." || hasGlob(source)) continue;
    if (!existsSync(join(root, source))) {
      violations.push(`COPY-Quelle existiert nicht: ${source}`);
    }
  }
}

// (2) Referenzierte Workspace-Verzeichnisse prüfen (überall im Dockerfile).
const workspaceRefs = new Set();
const refPattern =
  /(?:^|[\s"'=(/])(?:\/app\/)?(apps|packages|jurisdictions)\/([A-Za-z0-9._-]+)/g;
let match;
while ((match = refPattern.exec(raw)) !== null) {
  workspaceRefs.add(`${match[1]}/${match[2]}`);
}
for (const ref of [...workspaceRefs].sort()) {
  if (!existsSync(join(root, ref))) {
    violations.push(
      `Referenziertes Workspace-Verzeichnis existiert nicht: ${ref}`,
    );
  }
}

if (violations.length > 0) {
  console.error(
    "Dockerfile-Pfad-Verletzungen (würden den Container-Build brechen):",
  );
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Dockerfile-Pfad-Check bestanden.");
