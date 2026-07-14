import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function declarationConfigs(root) {
  const appsDir = path.join(root, "apps");
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      path.join(appsDir, entry.name, "src", "barrierefreiheit.config.ts"),
    )
    .filter((candidate) => existsSync(candidate));
}

function demoEnabled(raw) {
  return /^(1|true|yes)$/i.test(raw ?? "");
}

export function checkAccessibilityDeclaration({
  root = process.cwd(),
  env = process.env,
} = {}) {
  const configs = declarationConfigs(root);
  if (configs.length === 0) {
    return { checked: false, reason: "legacy-no-config" };
  }

  // Nur generierte/adoptierte Konsumenten tragen Lifecycle-Provenienz. Die
  // kanonische Vorlage darf die sichtbar markierten Musterwerte enthalten.
  if (!existsSync(path.join(root, ".template", "lock.json"))) {
    return { checked: false, reason: "canonical-template" };
  }

  const findings = [];
  for (const config of configs) {
    const source = readFileSync(config, "utf8");
    const relative = path.relative(root, config);
    if (!/\bprovisional\s*:\s*false\b/.test(source)) {
      findings.push(`${relative}: provisional muss false sein`);
    }
    if (/example\.org/i.test(source)) {
      findings.push(`${relative}: example.org ist ein bekannter Placeholder`);
    }
    if (/im deployment zu ersetzen|platzhalter|placeholder/i.test(source)) {
      findings.push(`${relative}: Placeholder-Daten sind noch enthalten`);
    }
  }

  if (findings.length === 0) {
    return { checked: true, reason: "approved" };
  }

  if (env["ALLOW_PROVISIONAL_ACCESSIBILITY_DECLARATION"] === "1") {
    if (!demoEnabled(env["DEMO_MODE"])) {
      throw new Error(
        "Provisional accessibility declaration override is allowed only for a documented demo with DEMO_MODE=true",
      );
    }
    return { checked: false, reason: "documented-demo-override" };
  }

  throw new Error(
    `Accessibility declaration release check failed:\n${findings
      .map((finding) => `- ${finding}`)
      .join("\n")}`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = checkAccessibilityDeclaration();
    console.log(`accessibility declaration: ${result.reason}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
