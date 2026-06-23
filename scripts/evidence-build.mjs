import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const profilePath = join(repoRoot, "docs/compliance/profile.de.example.json");
const outputPath = join(repoRoot, "dist/evidence/evidence-plan.json");

const profile = JSON.parse(await readFile(profilePath, "utf-8"));
const plan = {
  profile,
  generatedAt: new Date().toISOString(),
  disclaimer:
    "Dieses Bundle ist prueffaehige Evidenz, keine automatische Compliance-Zusage.",
  items: [
    "system-data-flow-diagrams",
    "threat-model",
    "processing-inventory",
    "dpia-precheck",
    "tom-control-matrix",
    "retention-deletion-concept",
    "bsi-grundschutz-map",
    "c5-provider-references",
    "sbom-license-provenance",
    "kubernetes-policy-results",
    "api-event-catalogue",
    "accessibility-report",
    "restore-test-result",
    "migration-rollback-records",
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(plan, null, 2) + "\n");
console.log(`wrote ${outputPath}`);
