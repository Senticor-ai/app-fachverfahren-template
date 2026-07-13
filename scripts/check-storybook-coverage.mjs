import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const requiredFiles = [
  ".storybook/main.ts",
  ".storybook/preview.ts",
  "packages/fachverfahren-kit/src/stories/DesignSystem.stories.tsx",
  "packages/fachverfahren-kit/src/stories/ScreenContracts.stories.tsx",
  "packages/fachverfahren-kit/src/stories/PublicSectorUi.stories.tsx",
  "packages/fachverfahren-kit/src/stories/UxMethodikPublicSector.stories.tsx",
  "packages/fachverfahren-kit/src/stories/FachverfahrenDesignManual.stories.tsx",
  "packages/fachverfahren-kit/src/stories/MdfilesUxUiSkill.stories.tsx",
  "docs/reference/fachverfahren-kit-components.md",
  "docs/reference/storybook.md",
  "docs/reference/test-driven-development.md",
  "docs/ux-ui/fachverfahren-ux-contract.md",
  "docs/ux-ui/template-conformance.md",
];
const storyRoots = [
  "modules",
  "packages/fachverfahren-kit/src",
  "packages/public-sector-ui/src",
];

async function exists(path) {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function collectStories(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectStories(path)));
    } else if (/\.stories\.tsx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const failures = [];

for (const file of requiredFiles) {
  if (!(await exists(join(root, file)))) {
    failures.push(`missing required Storybook/TDD file: ${file}`);
  }
}

const componentSource = await readFile(
  join(root, "packages/public-sector-ui/src/components.tsx"),
  "utf8",
);
const publicComponents = [
  ...componentSource.matchAll(/^export function ([A-Z][A-Za-z0-9]+)/gm),
].map((match) => match[1]);

const stories = (
  await Promise.all(
    storyRoots.map((storyRoot) => collectStories(join(root, storyRoot))),
  )
).flat();
const storyText = (
  await Promise.all(stories.map((story) => readFile(story, "utf8")))
).join("\n");

for (const component of publicComponents) {
  if (!storyText.includes(component)) {
    failures.push(`public UI component lacks Storybook coverage: ${component}`);
  }
}

if (!storyText.includes("Screen Contract")) {
  failures.push("stories must expose at least one Screen Contract example");
}

const requiredMethodologyTerms = [
  "UX-Methodik",
  "Time to Clarity",
  "HCAI",
  "Bürgerin",
  "Sachbearbeitung",
  "RC-Gap",
];

for (const term of requiredMethodologyTerms) {
  if (!storyText.includes(term)) {
    failures.push(`UX methodology story must include: ${term}`);
  }
}

const requiredDesignManualTerms = [
  "Fachverfahren Design Manual",
  "Sachbearbeiter:in",
  "Bürger:in",
  "Master-Detail",
  "Loading, Empty, Error, Success",
];

for (const term of requiredDesignManualTerms) {
  if (!storyText.includes(term)) {
    failures.push(`Fachverfahren design manual story must include: ${term}`);
  }
}

const requiredSourceSetTerms = [
  "UX/UI Source Set",
  "Doc 3",
  "Build Console",
  "ContextRail",
  "GovernanceBar",
  "Run Cards",
  "Working Context",
  "Fachbeispiele ausgeschlossen",
];

for (const term of requiredSourceSetTerms) {
  if (!storyText.includes(term)) {
    failures.push(`UX/UI source-set story must include: ${term}`);
  }
}

if (failures.length > 0) {
  console.error("Storybook coverage gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  const storyRootList = storyRoots
    .map((storyRoot) => relative(root, join(root, storyRoot)))
    .join(", ");
  console.log(
    `Storybook coverage gate passed for ${stories.length} story files in ${storyRootList}.`,
  );
}
