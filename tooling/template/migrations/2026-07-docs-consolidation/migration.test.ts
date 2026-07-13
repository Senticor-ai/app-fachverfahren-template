import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import metadata from "./migration.json" with { type: "json" };
import { up } from "./up.ts";

const legacyCodex = `# Codex Agent Bootstrap

Codex agents use \`AGENTS.md\` as the root policy and \`.agents/skills\` as the
canonical workflow contracts.

Start with:

\`\`\`bash
pnpm run agent:bootstrap -- --json
pnpm run agent:discover -- --json
pnpm run agent:context -- --task <app-spec> --paths <module-path> --json
\`\`\`

Follow \`context.nextCommands\` in order. Record executed commands in an agent
run report, then validate the final evidence with:

\`\`\`bash
pnpm run agent:verify -- --task <app-spec> --report <path> --json
\`\`\`
`;

const legacyBabelfish = `# Babelfish als Migrationsbrücke

Babelfish ist kein Greenfield-Default. Jede Nutzung braucht:

- T-SQL-Kompatibilitätsanalyse
- Inventar von Stored Procedures, Jobs und Integrationen
- Portability Score
- Zielarchitektur für natives PostgreSQL
- Sunset-Datum
- Reconciliation- und Rollback-Tests

Die Migration muss zwei Dinge beweisen:

1. Die Legacy-Anwendung kann während der Übergangsphase laufen.
2. Die Daten können später exportiert und nativ in PostgreSQL betrieben werden.
`;

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("2026-07-docs-consolidation", () => {
  it("declares a review-mode documentation migration", () => {
    expect(metadata).toMatchObject({
      id: "2026-07-docs-consolidation",
      mode: "review",
    });
    expect(metadata.touches).toContain("docs/ux-ui/**");
  });

  it("removes an unchanged deprecated document and is idempotent", async () => {
    const root = await tempRoot();
    const relativePath = "docs/agents/codex.md";
    const content = legacyCodex;
    await put(root, relativePath, content);
    const messages: string[] = [];
    const context = {
      root,
      dryRun: false,
      report: (message: string) => messages.push(message),
    };

    await up(context);
    await expect(stat(join(root, relativePath))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const afterFirstRun = [...messages];
    await up(context);
    expect(messages).toEqual(afterFirstRun);
  });

  it("reports dry-run operations without changing files", async () => {
    const root = await tempRoot();
    const relativePath = "docs/migration/babelfish.md";
    const content = legacyBabelfish;
    await put(root, relativePath, content);
    const messages: string[] = [];

    await up({
      root,
      dryRun: true,
      report: (message) => messages.push(message),
    });

    expect(await readFile(join(root, relativePath), "utf8")).toBe(content);
    expect(messages).toContain(`remove deprecated document ${relativePath}`);
  });

  it("preserves customized and unrelated documentation", async () => {
    const root = await tempRoot();
    const customized = "docs/agents/codex.md";
    const unrelated = "docs/domain/notes.md";
    await put(root, customized, "consumer-owned guidance\n");
    await put(root, unrelated, "keep me\n");
    const messages: string[] = [];

    await up({
      root,
      dryRun: false,
      report: (message) => messages.push(message),
    });

    expect(await readFile(join(root, customized), "utf8")).toBe(
      "consumer-owned guidance\n",
    );
    expect(await readFile(join(root, unrelated), "utf8")).toBe("keep me\n");
    expect(messages).toContain(
      `preserve customized deprecated document ${customized} for manual review`,
    );
  });

  it("fails when a deprecated document path is not a readable file", async () => {
    const root = await tempRoot();
    await mkdir(join(root, "docs/agents/codex.md"), { recursive: true });

    await expect(
      up({ root, dryRun: false, report: () => undefined }),
    ).rejects.toBeDefined();
  });
});

async function put(root: string, relativePath: string, content: string) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "docs-consolidation-"));
  tempRoots.push(root);
  return root;
}
