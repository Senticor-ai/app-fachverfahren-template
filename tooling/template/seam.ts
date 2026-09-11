// seam — THE EXCHANGE SEAM AS A TOOL. Two verbs, one notion of form.
//
//   node --experimental-strip-types tooling/template/seam.ts shape
//   node --experimental-strip-types tooling/template/seam.ts check --from <file|-> [--part <part>]
//   node --experimental-strip-types tooling/template/seam.ts set   --from <file|-> --part <part>
//
// ── THE MEASUREMENT THAT FORCED THIS TOOL ──────────────────────────────────────────────────────────
// (1) 2026-09-01, run `beweis-0901b`: the build phase spent its entire round budget on 26 reads and ZERO
//     writes; 16 of them went to ONE file (`types.ts`, 57 KB), only to learn which fields the seam
//     mandatorily carries. The order gave an ADDRESS where it could have given the FORM.
// (2) 2026-09-09, four products of the same build path: the build agent writes the seam as TEXT through
//     file tools (2x whole-file write, 40x edit) and empties what the template shipped filled. Three of
//     four applications were unusable afterwards.
//
// `shape` answers (1): the form comes to the agent, instead of the agent reading 57 KB to find the form.
// `check` answers (2): a seam becomes CHECKABLE BEFORE it is written — and partially, instead of only as
// a whole. Whoever delivers only `antrag` leaves the remaining parts alone instead of emptying them.
//
// ── WHAT THIS TOOL EXPLICITLY DOES NOT DO ──────────────────────────────────────────────────────────
// It prescribes NO content. No sample steps, no default fields, no "sensible defaults", no fallback to
// the template. The surfaces of a procedure are worked out in the domain concept and are procedure
// SPECIFIC; a default would not be friendliness here but a false statement about a public procedure —
// the same class as the four products whose server procedure stood byte-identical with the identifier of
// the sample application. The tool enforces and SHOWS the FORM. The invariant
// `konditionierendesFeld ⊆ steps[0].felder` says WHERE a field must stand, never WHICH one.
//
// ── NO SECOND NOTION OF FORM ───────────────────────────────────────────────────────────────────────
// Every rule that runs here comes from `packages/fachverfahren-kit/src/leistung-contract-form.ts` — the
// same source that `check:leistung-contract` executes and `schemas/leistung-config.schema.json` projects.
// This tool copies no rule and knows none of its own. The PART list is derived too (the top members of
// the mandatory paths), not laid down beside it — and so is the JSON shape each part's value must have.
//
// ── WHAT IT DOES NOT CHECK (named honestly, and both with a reason) ────────────────────────────────
// (1) The FRESHNESS of the contract snapshot. It compares the emitted file against the committed one and
//     therefore presupposes that a write happened — a pre-check cannot do that.
// (2) The purpose binding of the data connection (`verifyDatenanbindung`). Its module hangs off the full
//     `LeistungConfig` type graph and would pull JSX through `PersonaSwitcher.tsx` into a tool program
//     that knows none — the gate `check:template-types` catches exactly that. It stays with the checker.
// `check` is therefore a true SUBSET of `check:leistung-contract` and never replaces it: the gate remains
// the truth, this tool is the earliest warning.
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LEISTUNG_APPLICATION_INVARIANTS,
  LEISTUNG_CONTRACT_FORM,
  LEISTUNG_STATE_MACHINE_INVARIANTS,
  checkApplicationForm,
  checkStateMachine,
  pruefeForm,
  zuJsonSchema,
  type FormArt,
  type FormPflicht,
} from "../../packages/fachverfahren-kit/src/leistung-contract-form.ts";

const EXIT = { ok: 0, violation: 1, usage: 2 } as const;

/** The PARTS of the seam — DERIVED from the mandatory paths, not written down beside them. */
function parts(): string[] {
  const heads: string[] = [];
  for (const duty of LEISTUNG_CONTRACT_FORM) {
    const head = duty.pfad.split(".")[0]!;
    if (!heads.includes(head)) heads.push(head);
  }
  return heads;
}

/** The duties of ONE part. */
function dutiesOf(part: string): FormPflicht[] {
  return LEISTUNG_CONTRACT_FORM.filter(
    (duty) => duty.pfad === part || duty.pfad.startsWith(`${part}.`),
  );
}

// ── THE JSON SHAPE OF A PART — DERIVED, NOT LISTED ─────────────────────────────────────────────────
// ⛔ MEASURED 2026-09-11: `parts()` advertised eight parts and the candidate reader rejected everything
// that was not an object. `--part rechtsgrundlagen` (an array) and `--part id` (a string) died with exit 2
// on «der Kandidat ist kein JSON-Objekt» — FIVE of the eight advertised parts were unusable, and the two
// that the measured break is about (`antrag`, `statusMachine`) only worked by accident of being objects.
// A hand-written list of "these parts are arrays" would have been the second truth this tool exists to
// avoid, so the shape comes from the same place as the rules: a part addressed by a duty of its OWN has
// that duty's `art`; a part that only appears as the HEAD of deeper duties (`antrag.steps`) is an object.
type PartShape = FormArt | "object";

function shapeOfPart(part: string): PartShape {
  const ownDuty = LEISTUNG_CONTRACT_FORM.find((duty) => duty.pfad === part);
  return ownDuty ? ownDuty.art : "object";
}

function matchesShape(value: unknown, shape: PartShape): boolean {
  if (shape === "string") return typeof value === "string";
  if (shape === "array") return Array.isArray(value);
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** German names of the three shapes — this text reaches the person reading the error. */
const SHAPE_NAMES: Record<PartShape, string> = {
  string: "eine Zeichenkette",
  array: "eine Liste",
  object: "ein Objekt",
};

function nameOfValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "eine Liste";
  if (typeof value === "string") return "eine Zeichenkette";
  if (typeof value === "object") return "ein Objekt";
  return `ein Wert vom Typ ${typeof value}`;
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function readCandidate(source: string): unknown {
  const raw =
    source === "-"
      ? readFileSync(0, "utf8")
      : readFileSync(source, { encoding: "utf8" });
  return JSON.parse(raw);
}

// ── shape ─────────────────────────────────────────────────────────────────────
// Prints the MANDATORY FORM: the eight mandatory fields with the JSON shape each part takes, the
// cross-field invariants and the JSON-Schema projection. Always JSON — a form has no prose edition.
function shape(): void {
  process.stdout.write(
    JSON.stringify(
      {
        source:
          "packages/fachverfahren-kit/src/leistung-contract-form.ts (die EINE Pflicht-Form; ausgefuehrt von scripts/check-leistung-contract.mts)",
        seam: "apps/fachverfahren/src/leistung.config.ts",
        note: "Diese Form beschreibt, WELCHE Felder eine Naht tragen MUSS und WIE sie zueinander stehen. Sie enthaelt KEINEN fachlichen Inhalt: Schritte, Felder, Codelisten und Sektionen eines Verfahrens werden im Fachkonzept verfahrens-spezifisch erarbeitet.",
        parts: parts().map((part) => ({ part, shape: shapeOfPart(part) })),
        duties: LEISTUNG_CONTRACT_FORM.map((duty) => ({
          path: duty.pfad,
          kind: duty.art,
          ...(duty.minItems !== undefined ? { minItems: duty.minItems } : {}),
          reason: duty.grund,
        })),
        invariants: {
          antrag: LEISTUNG_APPLICATION_INVARIANTS.map(
            ({ id, rule, reason }) => ({
              id,
              rule,
              reason,
            }),
          ),
          statusMachine: LEISTUNG_STATE_MACHINE_INVARIANTS.map(
            ({ id, rule, reason }) => ({ id, rule, reason }),
          ),
        },
        schema: zuJsonSchema(),
        notCheckedBySeamCheck: [
          "Frische des Vertrags-Snapshots gegen apps/fachverfahren/leistung.contract.json (setzt voraus, dass bereits geschrieben wurde) — dafuer `pnpm run check:leistung-contract`.",
          "Zweckbindung und Verbindungsklasse der `datenanbindung` (Art. 5 DSGVO / BSI TR-03190) — ebenfalls `pnpm run check:leistung-contract`.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
}

// ── check ─────────────────────────────────────────────────────────────────────
// FAIL-CLOSED: every form error is named AND leads to a failure. It is never accepted "as far as
// possible" — a half-valid seam is the state the measured breaks came out of.
/**
 * THE ONE CHECKING PLACE. `check` prints it, `set` obeys it — there is no write path around it and no
 * second set of rules.
 */
function violationsOf(candidate: unknown, part: string | undefined): string[] {
  // A PART is mounted under its own name and checked ONLY against the rules of that part. That way an
  // application delivery does not report eight times that the remaining parts are missing — they are not
  // missing, they were not the subject.
  const snapshot = part ? { [part]: candidate } : candidate;
  const violations: string[] = [];

  // `pruefeForm` always checks the WHOLE duty set; for a part its result is filtered down to the
  // violation texts of THAT part. The RESULT is filtered, never the rule — the duty set stays undivided
  // as the one source.
  const relevantTexts = new Set(
    (part ? dutiesOf(part) : [...LEISTUNG_CONTRACT_FORM]).map(
      (duty) => duty.verstoss,
    ),
  );
  violations.push(...pruefeForm(snapshot).filter((v) => relevantTexts.has(v)));
  if (!part || part === "antrag")
    violations.push(...checkApplicationForm(snapshot));
  if (!part || part === "statusMachine")
    violations.push(...checkStateMachine(snapshot));
  return violations;
}

/** Reads and validates the input of ONE run. `null` ⇒ usage error (already reported). */
function candidateOf(
  verb: string,
  args: string[],
): { candidate: unknown; part: string | undefined } | null {
  const source = argValue(args, "--from");
  const part = argValue(args, "--part");
  if (!source) {
    process.stderr.write(
      `seam ${verb}: --from <datei|-> fehlt (\`-\` liest von stdin).\n`,
    );
    return null;
  }
  if (part !== undefined && !parts().includes(part)) {
    process.stderr.write(
      `seam ${verb}: unbekannter Teil "${part}". Bekannt: ${parts().join(", ")}.\n`,
    );
    return null;
  }
  let candidate: unknown;
  try {
    candidate = readCandidate(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `seam ${verb}: ${source} nicht lesbar/kein JSON — ${reason}\n`,
    );
    return null;
  }
  const expected: PartShape = part ? shapeOfPart(part) : "object";
  if (!matchesShape(candidate, expected)) {
    process.stderr.write(
      `seam ${verb}: ${part ? `Teil "${part}"` : "Die ganze Naht"} muss ${SHAPE_NAMES[expected]} sein ` +
        `(abgeleitet aus der Pflicht-Form), der Kandidat ist ${nameOfValue(candidate)}.\n`,
    );
    return null;
  }
  return { candidate, part };
}

function check(args: string[]): number {
  const input = candidateOf("check", args);
  if (!input) return EXIT.usage;
  const { candidate, part } = input;
  const violations = violationsOf(candidate, part);

  if (args.includes("--json")) {
    process.stdout.write(
      JSON.stringify(
        { ok: violations.length === 0, part: part ?? null, violations },
        null,
        2,
      ) + "\n",
    );
  } else if (violations.length) {
    process.stderr.write(
      `seam check: ${violations.length} Formverstoss/-verstoesse${part ? ` in Teil "${part}"` : ""} — NICHTS wird geschrieben:\n`,
    );
    for (const violation of violations)
      process.stderr.write(`- ${violation}\n`);
  } else {
    process.stdout.write(
      `seam check ok${part ? ` — Teil "${part}"` : ""}. Die Form haelt; der Gehalt bleibt Sache des Fachkonzepts. ` +
        "Die Frische des Vertrags-Snapshots prueft erst `pnpm run check:leistung-contract`.\n",
    );
  }
  return violations.length ? EXIT.violation : EXIT.ok;
}

// ── set ───────────────────────────────────────────────────────────────────────
// PARTIAL, STATELESS WRITING. That is the measured lever, not convenience.
//
// MEASURED (2026-09-09, `.chos/gate.jsonl`, phase `build`, four products of the same build path):
//
//   procedure   file_write  file_edit  file_read  result
//   UC4              4          8          8      steps FILLED
//   UC1              2         40         34      steps: []
//   UC2              2          8         46      steps: []
//   UC3              2         24         42      steps: []
//
// The three broken ones did 3.2 to 3.8 times the work and delivered nothing. The difference is the WRITE
// FORM: `file_edit` demands the exact OLD TEXT, so a 29 KB file must first be read in slices before the
// next change can even be phrased — 34 to 46 reads. The information was never missing; the TOOL was the
// limit.
//
// This verb needs NO old text: it addresses a PART by its name and replaces its value. And it does NOT
// touch the remaining parts — the escape route "rewrite the whole file" is exactly the one that emptied
// the filled template state.
//
// FAIL-CLOSED IN THIS ORDER: check first, then write. A form error writes NOTHING — no half seam, no
// "as far as possible".

const DEFAULT_SEAM_PATH = fileURLToPath(
  new URL("../../apps/fachverfahren/src/leistung.config.ts", import.meta.url),
);

/** The span of ONE top-level key in the object literal of the seam. */
interface Span {
  /** Index of the first character of the key. */
  from: number;
  /** Index BEHIND the last character of the value (without the separating comma). */
  to: number;
}

/**
 * Finds the spans of the TOP-LEVEL keys in the object literal that begins at `openBrace` (the `{`).
 *
 * The scanner knows strings (', ", `), line and block comments and the nesting of `{}`, `[]`, `()`. It is
 * deliberately SMALL: it understands the seam as an object literal, not as TypeScript. When it meets
 * something it cannot interpret safely it says so — it never guesses.
 */
function topLevelKeys(text: string, openBrace: number): Map<string, Span> {
  const spans = new Map<string, Span>();
  let index = openBrace + 1;
  let depth = 0;
  let expectKey = true;
  let current: { name: string; from: number } | null = null;

  const isWordChar = (character: string) => /[A-Za-z0-9_$]/.test(character);

  while (index < text.length) {
    const character = text[index]!;
    const pair = text.slice(index, index + 2);

    if (pair === "//") {
      const end = text.indexOf("\n", index);
      index = end < 0 ? text.length : end + 1;
      continue;
    }
    if (pair === "/*") {
      const end = text.indexOf("*/", index + 2);
      if (end < 0) throw new Error("unbeendeter Blockkommentar in der Naht");
      index = end + 2;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      let cursor = index + 1;
      while (cursor < text.length) {
        if (text[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (text[cursor] === character) break;
        cursor++;
      }
      if (cursor >= text.length)
        throw new Error("unbeendete Zeichenkette in der Naht");
      // A key may be written as a string.
      if (depth === 0 && expectKey && current === null)
        current = { name: text.slice(index + 1, cursor), from: index };
      index = cursor + 1;
      continue;
    }
    if (character === "{" || character === "[" || character === "(") {
      depth++;
      index++;
      continue;
    }
    if (character === "]" || character === ")") {
      depth--;
      index++;
      continue;
    }
    if (character === "}") {
      if (depth === 0) {
        // The object literal ends here — the last value reaches up to this point.
        if (current) spans.set(current.name, { from: current.from, to: index });
        return spans;
      }
      depth--;
      index++;
      continue;
    }
    if (depth === 0 && character === ",") {
      if (current) spans.set(current.name, { from: current.from, to: index });
      current = null;
      expectKey = true;
      index++;
      continue;
    }
    if (depth === 0 && expectKey && isWordChar(character) && current === null) {
      let cursor = index;
      while (cursor < text.length && isWordChar(text[cursor]!)) cursor++;
      current = { name: text.slice(index, cursor), from: index };
      index = cursor;
      continue;
    }
    if (depth === 0 && character === ":") expectKey = false;
    index++;
  }
  throw new Error("das Objektliteral der Naht ist nicht geschlossen");
}

/** The object literal of the seam — the index of its opening `{`. */
function seamObjectLiteral(text: string): number {
  const match = /export\s+const\s+leistungConfig\s*(?::[^=]*)?=\s*\{/.exec(
    text,
  );
  if (!match)
    throw new Error(
      "in der Naht wurde kein `export const leistungConfig = { … }` gefunden.",
    );
  return match.index + match[0].length - 1;
}

/** Serialises the value as a TypeScript literal. JSON IS valid TypeScript; prettier formats afterwards. */
function asLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function set(args: string[]): number {
  const source = argValue(args, "--from");
  const part = argValue(args, "--part");
  const seamPath = argValue(args, "--file") ?? DEFAULT_SEAM_PATH;
  if (!source || !part) {
    process.stderr.write(
      "seam set: --part <teil> UND --from <datei|-> sind Pflicht (`-` liest von stdin).\n",
    );
    return EXIT.usage;
  }
  if (!parts().includes(part)) {
    process.stderr.write(
      `seam set: unbekannter Teil "${part}". Bekannt: ${parts().join(", ")}.\n`,
    );
    return EXIT.usage;
  }

  // CHECK FIRST, THEN WRITE — the same checking place as `check`, no second notion of form and no write
  // path around it.
  const input = candidateOf("set", args);
  if (!input) return EXIT.usage;
  const violations = violationsOf(input.candidate, part);
  if (violations.length) {
    process.stderr.write(
      `seam set: ${violations.length} Formverstoss/-verstoesse in Teil "${part}" — es wurde NICHTS geschrieben:\n`,
    );
    for (const violation of violations)
      process.stderr.write(`- ${violation}\n`);
    return EXIT.violation;
  }

  let text: string;
  try {
    text = readFileSync(seamPath, "utf8");
  } catch (error) {
    process.stderr.write(
      `seam set: die Naht ${seamPath} ist nicht lesbar — ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return EXIT.usage;
  }

  let updated: string;
  try {
    const openBrace = seamObjectLiteral(text);
    const spans = topLevelKeys(text, openBrace);
    const literal = asLiteral(input.candidate);
    const existing = spans.get(part);
    updated = existing
      ? text.slice(0, existing.from) +
        `${part}: ${literal}` +
        text.slice(existing.to)
      : // The part is not there yet: mount it as the FIRST entry. The others stay untouched.
        text.slice(0, openBrace + 1) +
        `\n  ${part}: ${literal},` +
        text.slice(openBrace + 1);
  } catch (error) {
    process.stderr.write(
      `seam set: die Naht konnte nicht sicher zerlegt werden — ${error instanceof Error ? error.message : String(error)}\n` +
        "Es wurde NICHTS geschrieben.\n",
    );
    return EXIT.violation;
  }

  // Atomic: write beside it first, then rename. An aborted run never leaves half a seam behind — and half
  // a seam is exactly the state the measured breaks came out of.
  const sidecar = `${seamPath}.seam-neu`;
  writeFileSync(sidecar, updated, "utf8");
  renameSync(sidecar, seamPath);

  try {
    execFileSync("npx", ["prettier", "--write", seamPath], {
      stdio: "ignore",
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
    });
  } catch {
    // Prettier is cosmetics, not truth. If it fails the seam still stands correctly and `pnpm run format`
    // catches up — that is said out loud, not swallowed.
    process.stdout.write(
      "seam set: prettier lief nicht durch — `pnpm run format` nachziehen.\n",
    );
  }

  process.stdout.write(
    `seam set ok — Teil "${part}" in ${seamPath} ersetzt; die uebrigen Teile sind unberuehrt.\n` +
      "NAECHSTER SCHRITT (Pflicht): `pnpm --filter @senticor/fachverfahren emit:contract`, dann " +
      "`pnpm run check:leistung-contract` — der Vertrags-Snapshot ist jetzt veraltet.\n",
  );
  return EXIT.ok;
}

function printUsage(): void {
  process.stdout.write(
    [
      "seam — die Austausch-Naht als Werkzeug (Form, nie Inhalt).",
      "",
      "  shape                                  gibt die PFLICHTFORM als JSON aus",
      "  check --from <datei|-> [--part <teil>] prueft einen Kandidaten fail-closed",
      "  set   --from <datei|-> --part <teil>   schreibt GENAU diesen Teil in die Naht (erst pruefen)",
      "",
      "Teile (Name und geforderte JSON-Form):",
      ...parts().map((part) => `  ${part}: ${SHAPE_NAMES[shapeOfPart(part)]}`),
      "",
      "Die Wahrheit ueber die Form ist packages/fachverfahren-kit/src/leistung-contract-form.ts;",
      "das abschliessende Gate bleibt `pnpm run check:leistung-contract`.",
      "",
    ].join("\n"),
  );
}

const rawArgs =
  process.argv[2] === "--" ? process.argv.slice(3) : process.argv.slice(2);
const verb = rawArgs[0] ?? "help";
const rest = rawArgs.slice(1);

switch (verb) {
  case "shape":
    shape();
    break;
  case "check":
    process.exitCode = check(rest);
    break;
  case "set":
    process.exitCode = set(rest);
    break;
  case "help":
  case "--help":
  case "-h":
    printUsage();
    break;
  default:
    process.stderr.write(`seam: unbekanntes Verb "${verb}".\n`);
    printUsage();
    process.exitCode = EXIT.usage;
}
