// leistung-antragsform.test — THE COUNTER-PROBE OF THE CROSS-FIELD INVARIANTS.
//
// ── WHAT MUST STAND GREEN HERE BECAUSE IT WAS RED (measured 2026-09-09) ─────────────────────────────
// Four constructions passed `check:leistung-contract` with ZERO violations BEFORE this cut:
//
//   (a) `antrag.konditionierendesFeld` names a field that appears in NO step
//   (b) `antrag.konditionierendesFeld` names a field from `steps[1]` instead of `steps[0]`
//   (c) a step without a single field
//   (d) two steps with the same `id` and the same field names
//
// (b) is the measured break: three of four products of the same build path had an unusable citizen
// application, and the discriminator against the clean fourth was NOT the model (two ran on the same one)
// but exactly this declaration. The kit TYPE has always demanded it verbatim («MUSS in `steps[0]`»);
// nobody enforced it — the contract snapshot did not even carry the field.
//
// ── AND THE SECOND THING THIS FILE PINS (2026-09-11) ────────────────────────────────────────────────
// ⛔ Every invariant used to exist TWICE: as prose in `LEISTUNG_*_INVARIANTS` and as hand-written code in
// the checker, with nothing binding them. A rule could be added to either side alone and no assertion
// noticed. The record now CARRIES its `check`, and this file is what keeps that binding honest:
//
//   1. COVERAGE — every `id` in both lists has a mutation here. A new invariant without a counter-probe
//      turns this file red instead of shipping unchecked.
//   2. EXCLUSIVITY — each mutation names the EXACT set of ids it may trip. A check that reaches beyond
//      its own rule (or a rule that silently stops firing) breaks that set.
//   3. AGGREGATION — the exported checker must report exactly what the named records report. Hand-written
//      code smuggled past the list would show up as an extra text here.
//
// POSITIVE CONTROL FIRST: were the lists empty or the checks inert, every mutation assertion below would
// stand green without checking anything.
import { describe, expect, it } from "vitest";
import {
  LEISTUNG_APPLICATION_INVARIANTS,
  LEISTUNG_STATE_MACHINE_INVARIANTS,
  checkApplicationForm,
  checkStateMachine,
  type FormInvariant,
} from "./leistung-contract-form.js";

type Snapshot = Record<string, unknown>;
type Mutation = (snapshot: Snapshot) => void;

/** A formally flawless application — the reference point of every mutation. Pure FORM, no domain content. */
function goodApplication(): Snapshot {
  return {
    antrag: {
      konditionierendesFeld: "a.eins",
      steps: [
        {
          id: "s1",
          titel: "Erster",
          felder: [{ name: "a.eins", label: "Eins", typ: "select" }],
        },
        {
          id: "s2",
          titel: "Zweiter",
          felder: [{ name: "b.zwei", label: "Zwei", typ: "text" }],
        },
      ],
    },
  };
}

/**
 * A formally flawless state machine.
 *
 * It is deliberately RICHER than the minimum: `fertig` carries an outgoing transition (re-opening) and
 * `offen` reaches the end both directly and via `pruefung`. Only that makes the mutations below isolating
 * — on a two-state chain, dropping `terminal` from the last state ALSO creates a dead end, and the
 * counter-probe could no longer tell the two invariants apart.
 */
function goodStateMachine(): Snapshot {
  return {
    statusMachine: {
      initial: "offen",
      states: [
        { key: "offen" },
        { key: "pruefung" },
        { key: "fertig", terminal: true },
      ],
      transitions: [
        { from: "offen", to: "pruefung", rollen: ["sb"] },
        { from: "pruefung", to: "fertig", rollen: ["sb"] },
        { from: "offen", to: "fertig", rollen: ["sb"] },
        { from: "fertig", to: "offen", rollen: ["sb"] },
      ],
    },
  };
}

function steps(snapshot: Snapshot): Record<string, unknown>[] {
  return (snapshot["antrag"] as { steps: Record<string, unknown>[] }).steps;
}

function fields(
  snapshot: Snapshot,
  stepIndex: number,
): Record<string, unknown>[] {
  return steps(snapshot)[stepIndex]!["felder"] as Record<string, unknown>[];
}

function machine(snapshot: Snapshot): {
  initial: string;
  states: Record<string, unknown>[];
  transitions: Record<string, unknown>[];
} {
  return snapshot["statusMachine"] as {
    initial: string;
    states: Record<string, unknown>[];
    transitions: Record<string, unknown>[];
  };
}

/** The ids whose own `check` fires on this snapshot. */
function trippedIds(
  invariants: readonly FormInvariant[],
  snapshot: unknown,
): string[] {
  return invariants
    .filter((invariant) => invariant.check(snapshot).length > 0)
    .map((invariant) => invariant.id);
}

/** One counter-probe: a mutation of the good snapshot and the EXACT ids it may trip. */
interface CounterProbe {
  readonly id: string;
  readonly mutate: Mutation;
  /** Defaults to `[id]` — only a derived cascade may name more, and then with a reason. */
  readonly alsoTrips?: readonly string[];
}

const APPLICATION_PROBES: readonly CounterProbe[] = [
  { id: "schritt-id-vorhanden", mutate: (s) => void (steps(s)[1]!["id"] = "") },
  {
    id: "schritt-id-eindeutig",
    mutate: (s) => void (steps(s)[1]!["id"] = "s1"),
  },
  {
    id: "schritt-titel-vorhanden",
    mutate: (s) => void (steps(s)[1]!["titel"] = ""),
  },
  {
    id: "schritt-hat-felder",
    mutate: (s) => void (steps(s)[1]!["felder"] = []),
  },
  {
    id: "feld-name-vorhanden",
    mutate: (s) => void (fields(s, 1)[0]!["name"] = ""),
  },
  {
    id: "feld-name-eindeutig",
    mutate: (s) => void (fields(s, 1)[0]!["name"] = "a.eins"),
  },
  {
    id: "feld-label-vorhanden",
    mutate: (s) => void (fields(s, 1)[0]!["label"] = ""),
  },
  {
    id: "feld-typ-vorhanden",
    mutate: (s) => void (fields(s, 1)[0]!["typ"] = ""),
  },
  {
    // THE MEASURED BREAK: the conditioning field is only collected in the SECOND step.
    id: "konditionierendes-feld-in-schritt-eins",
    mutate: (s) =>
      void ((s["antrag"] as Record<string, unknown>)["konditionierendesFeld"] =
        "b.zwei"),
  },
];

const STATE_MACHINE_PROBES: readonly CounterProbe[] = [
  {
    id: "initial-existiert",
    mutate: (s) => void (machine(s).initial = "weg"),
    // THE ONE DERIVED CASCADE IN THIS FILE, and it is a property of the algorithm, not a leak: reachability
    // is seeded FROM the initial state, so an initial that points nowhere makes every state unreachable.
    // It is named here instead of being tolerated — a cascade nobody wrote down is how a broken check hides.
    alsoTrips: ["keine-unerreichbarkeit"],
  },
  {
    id: "endzustand-existiert",
    mutate: (s) => void delete machine(s).states[2]!["terminal"],
  },
  {
    id: "uebergang-kennt-zustaende",
    mutate: (s) => void (machine(s).transitions[2]!["to"] = "weg"),
  },
  {
    id: "uebergang-traegt-rollen",
    mutate: (s) => void (machine(s).transitions[0]!["rollen"] = []),
  },
  {
    id: "keine-sackgasse",
    mutate: (s) => {
      machine(s).states.push({ key: "haengt" });
      machine(s).transitions.push({
        from: "offen",
        to: "haengt",
        rollen: ["sb"],
      });
    },
  },
  {
    id: "keine-unerreichbarkeit",
    mutate: (s) =>
      void machine(s).states.push({ key: "insel", terminal: true }),
  },
];

/** Builds the four assertions that hold for EVERY counter-probe, for both lists at once. */
function describeProbes(
  what: string,
  invariants: readonly FormInvariant[],
  probes: readonly CounterProbe[],
  good: () => Snapshot,
  runAll: (snapshot: unknown) => string[],
  minimumRules: number,
) {
  describe(`${what} — the record IS the check`, () => {
    it("POSITIVE CONTROL: the list is non-empty, its ids are unique, and a good snapshot is flawless", () => {
      expect(invariants.length).toBeGreaterThanOrEqual(minimumRules);
      expect(new Set(invariants.map((invariant) => invariant.id)).size).toBe(
        invariants.length,
      );
      expect(runAll(good())).toEqual([]);
      expect(trippedIds(invariants, good())).toEqual([]);
    });

    it("COVERAGE: every declared invariant has a counter-probe — a new rule without one is red here", () => {
      expect([...probes].map((probe) => probe.id).sort()).toEqual(
        invariants.map((invariant) => invariant.id).sort(),
      );
    });

    it.each(probes.map((probe) => [probe.id, probe] as const))(
      "%s: the mutation trips exactly its own rule, and the checker reports exactly that rule",
      (id, probe) => {
        const expected = [id, ...(probe.alsoTrips ?? [])];
        const snapshot = good();
        probe.mutate(snapshot);

        // EXCLUSIVITY — no other rule may fire, and this one must.
        expect(trippedIds(invariants, snapshot).sort()).toEqual(
          [...expected].sort(),
        );

        // AGGREGATION — the exported checker is the list and nothing besides. Hand-written code smuggled
        // past the records would appear here as a text no record produced.
        expect(runAll(snapshot)).toEqual(
          invariants
            .filter((invariant) => expected.includes(invariant.id))
            .flatMap((invariant) => invariant.check(snapshot)),
        );
        expect(runAll(snapshot).length).toBeGreaterThan(0);
      },
    );
  });
}

describeProbes(
  "checkApplicationForm",
  LEISTUNG_APPLICATION_INVARIANTS,
  APPLICATION_PROBES,
  goodApplication,
  checkApplicationForm,
  9,
);

describeProbes(
  "checkStateMachine",
  LEISTUNG_STATE_MACHINE_INVARIANTS,
  STATE_MACHINE_PROBES,
  goodStateMachine,
  checkStateMachine,
  6,
);

// ── THE TEXTS THEMSELVES ────────────────────────────────────────────────────────────────────────────
// The assertions above pin WHICH rule fires. These pin WHAT the person reading the gate output is told —
// a violation without a location is not findable in a list of twelve steps.
describe("checkApplicationForm — the violation names the place", () => {
  it("(b) THE MEASURED BREAK: a conditioning field from steps[1] falls, and says where it should stand", () => {
    const snapshot = goodApplication();
    (snapshot["antrag"] as Record<string, unknown>)["konditionierendesFeld"] =
      "b.zwei";
    const violations = checkApplicationForm(snapshot);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("antrag.steps[0].felder");
  });

  it("(a) a conditioning field that exists nowhere falls", () => {
    const snapshot = goodApplication();
    (snapshot["antrag"] as Record<string, unknown>)["konditionierendesFeld"] =
      "gibt.es.nicht";
    expect(checkApplicationForm(snapshot)).toHaveLength(1);
  });

  it("an application WITHOUT a conditioning field stays flawless (the rule is additive)", () => {
    const snapshot = goodApplication();
    delete (snapshot["antrag"] as Record<string, unknown>)[
      "konditionierendesFeld"
    ];
    expect(checkApplicationForm(snapshot)).toEqual([]);
  });

  it("(c) a step without fields falls", () => {
    const snapshot = goodApplication();
    steps(snapshot)[1]!["felder"] = [];
    expect(checkApplicationForm(snapshot).join(" ")).toContain(
      "felder ist leer",
    );
  });

  it("(d) a duplicate step id AND a duplicate field name fall one by one", () => {
    const snapshot = goodApplication();
    steps(snapshot)[1]!["id"] = "s1";
    fields(snapshot, 1)[0]!["name"] = "a.eins";
    const violations = checkApplicationForm(snapshot);
    expect(violations.some((v) => v.includes('"s1" ist doppelt'))).toBe(true);
    expect(
      violations.some((v) => v.includes('"a.eins" kommt zweimal vor')),
    ).toBe(true);
  });

  // The title violation additionally names the step id when there is one.
  it.each([
    ["id", "antrag.steps[1].id fehlt/leer."],
    ["titel", "antrag.steps[1].titel fehlt/leer"],
  ])("a step without %s names its place", (property, text) => {
    const snapshot = goodApplication();
    steps(snapshot)[1]![property] = "";
    expect(checkApplicationForm(snapshot).join(" ")).toContain(text);
  });

  it.each(["name", "label", "typ"])(
    "a field without %s names its place",
    (property) => {
      const snapshot = goodApplication();
      fields(snapshot, 1)[0]![property] = "";
      expect(checkApplicationForm(snapshot).join(" ")).toContain(
        `felder[0].${property}`,
      );
    },
  );

  it("WITHOUT antrag.steps the check stays silent — the duty form already reports that", () => {
    expect(checkApplicationForm({})).toEqual([]);
    expect(checkApplicationForm({ antrag: { steps: [] } })).toEqual([]);
  });
});

describe("checkStateMachine — the move out of the checker lost nothing", () => {
  it.each([
    [
      "initial pointing nowhere",
      "initial-existiert",
      "ist kein definierter Zustand",
    ],
    ["no final state", "endzustand-existiert", "keinen Endzustand"],
    [
      "transition without roles",
      "uebergang-traegt-rollen",
      "trägt keine Rollen",
    ],
    ["dead end", "keine-sackgasse", "Sackgasse"],
    ["unreachable state", "keine-unerreichbarkeit", "nicht erreichbar"],
  ])("%s keeps its wording", (_name, id, text) => {
    const probe = STATE_MACHINE_PROBES.find((entry) => entry.id === id)!;
    const snapshot = goodStateMachine();
    probe.mutate(snapshot);
    expect(checkStateMachine(snapshot).join(" ")).toContain(text);
  });

  it("WITHOUT statusMachine.states the check stays silent", () => {
    expect(checkStateMachine({})).toEqual([]);
  });
});
