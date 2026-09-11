// seam.test — THE WITNESS OF THE SEAM TOOL. It drives the real CLI as a subprocess, because exactly the
// two properties that matter are only measurable there: the EXIT CODE (fail-closed) and the fact that on
// a form error NOTHING but the reason comes out.
//
// ── FOUR ASSURANCES, FOUR PAID LESSONS ──────────────────────────────────────────────────────────────
// (1) `shape` hands over the FORM, not an address. On 2026-09-01 the build phase read `types.ts` (57 KB)
//     sixteen times to learn eight mandatory fields.
// (2) `check` fails closed, and on EXACTLY the break that three of four products had on 2026-09-09:
//     `konditionierendesFeld` points at a field outside `steps[0]`.
// (3) `shape` prescribes NO content. The surfaces of a procedure are worked out procedure-specifically in
//     the domain concept; a shipped sample would be a false statement about a public procedure — the same
//     class as the four products whose server procedure stood byte-identical with the identifier of the
//     sample application. This assurance is the only one that stops somebody from later teaching the tool
//     "helpful defaults".
// (4) ⛔ EVERY ADVERTISED PART IS ACTUALLY USABLE. Measured 2026-09-11: `shape` advertised eight parts and
//     the candidate reader accepted only objects, so `--part id` (a string) and `--part rechtsgrundlagen`
//     (an array) died with exit 2 — FIVE of eight parts were unusable, and a tool that advertises what it
//     refuses is worse than one that advertises nothing. The assurance is DERIVED from the tool's own
//     advertisement, so a ninth part cannot slip in unmeasured.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tool = fileURLToPath(new URL("./seam.ts", import.meta.url));

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function seam(...args: string[]): Run {
  try {
    const stdout = execFileSync(
      process.execPath,
      ["--experimental-strip-types", tool, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      status: failure.status ?? -1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

const workDirectory = mkdtempSync(join(tmpdir(), "seam-witness-"));

function asFile(name: string, value: unknown): string {
  const path = join(workDirectory, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

/** The measured break: the conditioning field is only collected in the second step. */
const brokenApplication = {
  konditionierendesFeld: "b.zwei",
  steps: [
    {
      id: "s1",
      titel: "Erster",
      felder: [{ name: "a.eins", label: "Eins", typ: "text" }],
    },
    {
      id: "s2",
      titel: "Zweiter",
      felder: [{ name: "b.zwei", label: "Zwei", typ: "select" }],
    },
  ],
};

/** THE SAME data, ordered correctly — the positive control for the break above. */
const goodApplication = {
  konditionierendesFeld: "b.zwei",
  steps: [
    {
      id: "s2",
      titel: "Zweiter",
      felder: [{ name: "b.zwei", label: "Zwei", typ: "select" }],
    },
    {
      id: "s1",
      titel: "Erster",
      felder: [{ name: "a.eins", label: "Eins", typ: "text" }],
    },
  ],
};

interface AdvertisedPart {
  part: string;
  shape: "string" | "array" | "object";
}

const advertised = (
  JSON.parse(seam("shape").stdout) as { parts: AdvertisedPart[] }
).parts;

describe("seam shape — the FORM comes to the agent", () => {
  it("names duties, invariants, parts with their JSON shape, and the schema", () => {
    const run = seam("shape");
    expect(run.status).toBe(0);
    const form = JSON.parse(run.stdout) as Record<string, unknown>;
    expect((form["duties"] as unknown[]).length).toBeGreaterThanOrEqual(8);
    expect(advertised.map((entry) => entry.part)).toContain("antrag");
    // Without the shape per part the list would be an advertisement an agent cannot act on.
    for (const entry of advertised)
      expect(["string", "array", "object"]).toContain(entry.shape);
    const invariants = form["invariants"] as Record<
      string,
      { id: string; rule: string; reason: string }[]
    >;
    expect(invariants["antrag"]!.map((entry) => entry.id)).toContain(
      "konditionierendes-feld-in-schritt-eins",
    );
    // The record is shown WITH its sentence — an id alone tells an agent nothing about the rule.
    for (const entry of [
      ...invariants["antrag"]!,
      ...invariants["statusMachine"]!,
    ]) {
      expect(entry.rule.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
    expect(invariants["statusMachine"]!.length).toBeGreaterThanOrEqual(6);
    expect(form["schema"]).toHaveProperty("$schema");
  });

  it("PRESCRIBES NO CONTENT — no sample step, no default field, no template identifier", () => {
    const raw = seam("shape").stdout;
    // The template carries a filled sample application. If any of it came out here, the tool would hand
    // every generated procedure somebody else's domain content.
    for (const forbiddenContent of [
      "musterantrag",
      "Musterantrag",
      "antragsteller.vorname",
      "Stadt Musterstadt",
    ])
      expect(raw).not.toContain(forbiddenContent);
    // And no example step list under any name.
    const form = JSON.parse(raw) as Record<string, unknown>;
    expect(form).not.toHaveProperty("steps");
    expect(form).not.toHaveProperty("beispiel");
    expect(form).not.toHaveProperty("vorlage");
  });
});

// ── EVERY ADVERTISED PART IS USABLE ─────────────────────────────────────────────────────────────────
// The candidates below are derived from the ADVERTISED shape, not from a list of names. Whatever `shape`
// announces must be deliverable; the only permitted rejection is a FORM violation (exit 1), never a usage
// error (exit 2) about the JSON type.
const minimalForShape: Record<AdvertisedPart["shape"], unknown> = {
  string: "x",
  array: [],
  object: {},
};

/** A candidate per part that satisfies the duty form — the positive control to the derived case above. */
const validCandidates: Record<string, unknown> = {
  id: "hundesteuer",
  label: "Hundesteuer",
  kommune: "Musterstadt",
  rechtsgrundlagen: [{ norm: "§ 1 HStS", titel: "Hundesteuersatzung" }],
  detailSektionen: [{ id: "uebersicht", titel: "Übersicht" }],
  antrag: goodApplication,
  statusMachine: {
    initial: "offen",
    states: [{ key: "offen" }, { key: "fertig", terminal: true }],
    transitions: [{ from: "offen", to: "fertig", rollen: ["sb"] }],
  },
  register: { suchfelder: [{ name: "a.eins", label: "Eins" }] },
};

describe("seam check — every part the tool advertises can actually be delivered", () => {
  it("COVERAGE: every advertised part has a valid candidate here", () => {
    expect(Object.keys(validCandidates).sort()).toEqual(
      advertised.map((entry) => entry.part).sort(),
    );
  });

  it.each(advertised.map((entry) => [entry.part, entry.shape] as const))(
    "%s (%s): a candidate of the advertised shape is never a usage error",
    (part, shape) => {
      const run = seam(
        "check",
        "--part",
        part,
        "--from",
        asFile(`shape-${part}.json`, minimalForShape[shape]),
        "--json",
      );
      // Exit 2 would mean the tool refuses what it itself advertises. Exit 1 is legitimate: an empty list
      // violates `minItems`, and that is a statement about CONTENT, not about the JSON type.
      expect(run.status).not.toBe(2);
      expect(run.stderr).toBe("");
      expect((JSON.parse(run.stdout) as { part: string | null }).part).toBe(
        part,
      );
    },
  );

  it.each(advertised.map((entry) => entry.part))(
    "%s: a candidate that satisfies the duty form passes (exit 0)",
    (part) => {
      const run = seam(
        "check",
        "--part",
        part,
        "--from",
        asFile(`valid-${part}.json`, validCandidates[part]),
      );
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    },
  );

  it("a candidate of the WRONG JSON type is a usage error (exit 2) and names the required shape", () => {
    const run = seam(
      "check",
      "--part",
      "id",
      "--from",
      asFile("wrong-shape.json", { nicht: "eine Zeichenkette" }),
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("eine Zeichenkette");
  });
});

describe("seam check — fail-closed on the measured break", () => {
  it("falls with exit 1 and names the reason when the conditioning field is not in steps[0]", () => {
    const run = seam(
      "check",
      "--part",
      "antrag",
      "--from",
      asFile("broken.json", brokenApplication),
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("antrag.steps[0].felder");
    // Fail-CLOSED means: nothing but the reason comes out — no repaired candidate.
    expect(run.stdout).toBe("");
  });

  it("POSITIVE CONTROL: the same data, ordered correctly, passes (exit 0)", () => {
    const run = seam(
      "check",
      "--part",
      "antrag",
      "--from",
      asFile("good.json", goodApplication),
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("ok");
  });

  it("a PART is checked only against the rules of ITS part — not against the whole seam", () => {
    const run = seam(
      "check",
      "--part",
      "antrag",
      "--from",
      asFile("good2.json", goodApplication),
      "--json",
    );
    const result = JSON.parse(run.stdout) as { violations: string[] };
    // Neither `id`/`label`/`kommune` nor `register.suchfelder` are missed here: they were not the subject.
    // Exactly that permits the section-wise delivery which a whole-file write empties.
    expect(result.violations).toEqual([]);
  });

  it("the WHOLE seam without a part declaration does miss every absent duty", () => {
    const run = seam(
      "check",
      "--from",
      asFile("onlyApplication.json", { antrag: goodApplication }),
      "--json",
    );
    expect(run.status).toBe(1);
    const result = JSON.parse(run.stdout) as { violations: string[] };
    expect(result.violations.length).toBeGreaterThanOrEqual(6);
  });

  it("an unknown part and a missing source are usage errors (exit 2), not a silent zero", () => {
    expect(seam("check", "--part", "gibtsnicht", "--from", "x").status).toBe(2);
    expect(seam("check").status).toBe(2);
    expect(
      seam("check", "--from", join(workDirectory, "missing.json")).status,
    ).toBe(2);
  });
});

// ── seam set — THE MEASURED LEVER ───────────────────────────────────────────────────────────────────
// The three broken products of 2026-09-09 wrote twice and then EDITED 24 to 40 times — every edit needs
// the exact old text, so 34 to 46 reads of a 29 KB file. This verb needs no old text. Two properties must
// stay true for that, and both stand here: on a form error it writes NOTHING, and it does NOT touch the
// remaining parts.
describe("seam set — partial, stateless, fail-closed", () => {
  /** A working copy of the real seam. The witness never touches the seam of the repo. */
  function copyOfSeam(name: string): string {
    const target = join(workDirectory, name);
    writeFileSync(
      target,
      readFileSync(
        fileURLToPath(
          new URL(
            "../../apps/fachverfahren/src/leistung.config.ts",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    );
    return target;
  }

  it("a form error writes NOTHING — the file stays byte-identical", () => {
    const target = copyOfSeam("failclosed.ts");
    const before = readFileSync(target, "utf8");
    const run = seam(
      "set",
      "--part",
      "antrag",
      "--from",
      asFile("set-broken.json", brokenApplication),
      "--file",
      target,
    );
    expect(run.status).toBe(1);
    expect(readFileSync(target, "utf8")).toBe(before);
  });

  it("a valid part is replaced — and ALL remaining parts stay in place", () => {
    const target = copyOfSeam("success.ts");
    const before = readFileSync(target, "utf8");
    const run = seam(
      "set",
      "--part",
      "antrag",
      "--from",
      asFile("set-good.json", goodApplication),
      "--file",
      target,
    );
    expect(run.status).toBe(0);
    const after = readFileSync(target, "utf8");
    expect(after).not.toBe(before);
    // The new content is there …
    expect(after).toContain('konditionierendesFeld: "b.zwei"');
    // … and the parts the agent did NOT deliver are untouched. Exactly this assurance separates the verb
    // from the whole-file write that emptied the filled template state.
    for (const untouched of [
      "statusMachine:",
      "detailSektionen:",
      "register:",
      "berechne:",
      "rechtsgrundlagen:",
    ])
      expect(after).toContain(untouched);
    // And the user is told that the contract snapshot is now stale.
    expect(run.stdout).toContain("emit:contract");
  });

  it("a non-object part is writable too — the shape comes from the duty form", () => {
    const target = copyOfSeam("string-part.ts");
    const run = seam(
      "set",
      "--part",
      "kommune",
      "--from",
      asFile("set-kommune.json", "Musterstadt an der Naht"),
      "--file",
      target,
    );
    expect(run.status).toBe(0);
    expect(readFileSync(target, "utf8")).toContain('"Musterstadt an der Naht"');
  });

  it("the result is valid, formatted TypeScript (prettier parses it)", () => {
    const target = copyOfSeam("format.ts");
    expect(
      seam(
        "set",
        "--part",
        "antrag",
        "--from",
        asFile("set-good2.json", goodApplication),
        "--file",
        target,
      ).status,
    ).toBe(0);
    // `prettier --check` fails both on syntax errors and on format deviation.
    expect(() =>
      execFileSync("npx", ["prettier", "--check", target], { stdio: "ignore" }),
    ).not.toThrow();
  });

  it("without --part, set is a usage error (exit 2) — there is no whole-file write", () => {
    expect(
      seam("set", "--from", asFile("x.json", goodApplication)).status,
    ).toBe(2);
  });
});
