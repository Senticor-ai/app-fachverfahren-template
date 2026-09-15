// fachverfahren-kit/leistung-contract-form — DIE EINE Quelle der PFLICHT-FORM des Leistungs-Vertrags.
//
// ── WARUM DIESE DATEI EXISTIERT (gemessen 2026-09-01, Lauf `beweis-0901b`) ────────────────────────────
// Die Phase `build` verbrauchte ihr komplettes Rundenbudget (12 Runden) mit 26 Lesungen und NULL
// Schreibungen; 16 dieser Lesungen galten EINER Datei: `packages/fachverfahren-kit/src/types.ts`
// (943 Zeilen / 57.029 Bytes). Ein Agent blätterte 57 KB in 7.500-Zeichen-Scheiben durch, um zu
// erfahren, welche acht Felder eine `LeistungConfig` PFLICHTMÄSSIG trägt. Der Pflicht-Kern stand
// bereits als Code in `scripts/check-leistung-contract.mts` — nur nicht in maschinenlesbarer Form.
//
// ── WARUM NICHT ZWEI STELLEN ─────────────────────────────────────────────────────────────────────────
// Ein danebengelegtes JSON-Schema wäre eine ZWEITE Wahrheit: es könnte eine Pflicht behaupten, die der
// Prüfer nicht erzwingt (oder umgekehrt), und niemand merkte es. Deshalb steht die Pflichtmenge HIER
// EINMAL als Daten, und BEIDE Seiten leiten sich daraus ab:
//   • `scripts/check-leistung-contract.mts` FÜHRT sie aus (`pruefeForm`) — der Prüfer bleibt die Wahrheit;
//   • `scripts/emit-leistung-schema.mts` PROJIZIERT sie (`zuJsonSchema`) nach
//     `schemas/leistung-config.schema.json`.
// Drift ist damit strukturell unmöglich statt nur bemerkbar.
//
// ── GRENZE DER PROJEKTION (bewusst) ──────────────────────────────────────────────────────────────────
// Hier steht NUR, was JSON-Schema ausdrücken kann: Anwesenheit, Typ, Mindestlänge. Die graph-wertigen
// Zusicherungen der StatusMachine (Initialzustand existiert · mind. ein Endzustand · keine Sackgasse ·
// keine Unerreichbarkeit · Rollen je Übergang) und die Zweckbindungs-Prüfung der Datenanbindung bleiben
// im Prüfer — ein JSON-Schema kann sie nicht tragen. Das Schema ist damit SCHWÄCHER als der Prüfer,
// niemals stärker: es behauptet keine Pflicht, die der Prüfer nicht erzwingt.

/** Der JSON-Schema-Typ eines Pflichtfeldes. Mehr Formen braucht der Pflicht-Kern nicht. */
export type FormArt = "string" | "array";

/** EINE Pflicht des Vertrags — ausführbar (Prüfer) und projizierbar (JSON-Schema). */
export interface FormPflicht {
  /** Punkt-Pfad im Contract-Snapshot, z. B. `antrag.steps` oder `register.suchfelder`. */
  readonly pfad: string;
  readonly art: FormArt;
  /** Nur bei `art: "array"` — Mindestanzahl Einträge (JSON-Schema `minItems`). */
  readonly minItems?: number;
  /** Der Verstoßtext, den `check:leistung-contract` ausgibt. Wortgleich zum Stand vor dieser Datei. */
  readonly verstoss: string;
  /** Warum die Pflicht besteht — wandert als `description` ins JSON-Schema. */
  readonly grund: string;
}

/**
 * DIE PFLICHT-FORM. Acht Felder — jedes davon erzwingt `check:leistung-contract` seit jeher; die Texte
 * sind unverändert übernommen, damit diese Datei nichts verschärft und nichts aufweicht.
 */
export const LEISTUNG_CONTRACT_FORM: readonly FormPflicht[] = [
  {
    pfad: "id",
    art: "string",
    verstoss: "contract.id fehlt/leer.",
    grund:
      "Slug der Leistung — die Adresse des Verfahrens im Repo und in der Route.",
  },
  {
    pfad: "label",
    art: "string",
    verstoss: "contract.label fehlt/leer.",
    grund: "Anzeigename der Leistung (Bürger-Oberfläche und Bescheid-Kopf).",
  },
  {
    pfad: "kommune",
    art: "string",
    verstoss: "contract.kommune fehlt/leer.",
    grund:
      "Die erlassende Behörde — ohne sie hat der Verwaltungsakt keinen Urheber.",
  },
  {
    pfad: "rechtsgrundlagen",
    art: "array",
    minItems: 1,
    verstoss:
      "contract.rechtsgrundlagen muss mind. 1 Norm enthalten (Geerdet-Prinzip).",
    grund:
      "Geerdet-Prinzip: mind. eine Norm { norm, titel, satzung? }. Kein Verfahren ohne Rechtsgrundlage.",
  },
  {
    pfad: "antrag.steps",
    art: "array",
    minItems: 1,
    verstoss: "contract.antrag.steps muss mind. 1 Schritt enthalten.",
    grund:
      "Der Antragsassistent braucht mind. einen Schritt (StepDef mit id, titel, felder[]).",
  },
  {
    pfad: "statusMachine.states",
    art: "array",
    minItems: 1,
    verstoss: "contract.statusMachine.states muss mind. 1 Zustand enthalten.",
    grund:
      "Zustände { key, label, terminal? } der Bearbeitung. Der Prüfer fordert darüber hinaus: initial existiert, mind. ein terminaler Zustand, keine Sackgasse, keine Unerreichbarkeit, Rollen je Übergang.",
  },
  {
    pfad: "detailSektionen",
    art: "array",
    minItems: 1,
    verstoss:
      "contract.detailSektionen muss mind. 1 Sektion enthalten (SB-Detailsicht).",
    grund:
      "Die Sachbearbeiter-Detailsicht braucht mind. eine Sektion — sonst sieht die Fachkraft den Vorgang nicht.",
  },
  {
    pfad: "register.suchfelder",
    art: "array",
    minItems: 1,
    verstoss:
      "contract.register.suchfelder muss mind. 1 Once-Only-Suchfeld enthalten.",
    grund:
      "Once-Only: mind. ein Suchfeld, über das ein bestehender Vorgang gefunden wird, statt neu erfragt zu werden.",
  },
] as const;

/** Liest einen Punkt-Pfad aus einem Objekt. `undefined`, sobald ein Glied fehlt. */
function lies(wurzel: unknown, pfad: string): unknown {
  let aktuell: unknown = wurzel;
  for (const glied of pfad.split(".")) {
    if (aktuell === null || typeof aktuell !== "object") return undefined;
    aktuell = (aktuell as Record<string, unknown>)[glied];
  }
  return aktuell;
}

/**
 * FÜHRT die Pflicht-Form gegen einen Contract-Snapshot aus und liefert die Verstoßtexte (leer = in Ordnung).
 * Rein / seiteneffektfrei. `check:leistung-contract` ruft genau das auf — es gibt keine zweite Prüfstelle.
 */
export function pruefeForm(snapshot: unknown): string[] {
  const verstoesse: string[] = [];
  for (const pflicht of LEISTUNG_CONTRACT_FORM) {
    const wert = lies(snapshot, pflicht.pfad);
    if (pflicht.art === "string") {
      if (typeof wert !== "string" || wert.length === 0)
        verstoesse.push(pflicht.verstoss);
    } else {
      const min = pflicht.minItems ?? 0;
      if (!Array.isArray(wert) || wert.length < min)
        verstoesse.push(pflicht.verstoss);
    }
  }
  return verstoesse;
}

// ── THE APPLICATION INVARIANTS — cross-field, therefore NOT in the schema ───────────────────────────
//
// ── THE MEASUREMENT THAT FORCED THEM (2026-09-09) ───────────────────────────────────────────────────
// Four products of the same build path, three of them with an unusable citizen application. The
// discriminator was NOT the model (two ran on the same one): the three broken ones set
// `antrag.konditionierendesFeld`, the clean one did not. The type says so verbatim — «MUSS in `steps[0]`
// (dem `rolle: "kontext"`-Schritt) liegen» (types.ts) — and that sentence stood in THREE places in the
// repo: the type declaration, one Storybook story, nowhere else. ZERO checkers. The build agent had
// DECLARED progressive disclosure and never filled the step list it refers to.
//
// It was not even checkABLE: the contract snapshot did not carry the field at all (contract-snapshot.ts
// listed `antrag` as `{ steps, einleitung? }`). A gate can enforce nothing that the projection withholds
// from it — the same class as the `additionalProperties: false` seam that silently drops what is not
// declared. That is why the field travels with the snapshot since the same cut.
//
// ── WHY HERE AND NOT IN THE SCHEMA ─────────────────────────────────────────────────────────────────
// Every one of these rules relates TWO places of the contract to each other (a field name against the
// field list of the first step, a step id against all the others). JSON Schema cannot carry that. They
// therefore sit at the same boundary as the state-machine graph rules: EXECUTED by the checker, not
// projected. The schema thus stays unchanged WEAKER than the checker, never stronger.
//
// ── AND THE RECORD IS THE CHECK (2026-09-11) ───────────────────────────────────────────────────────
// ⛔ In its first shape every invariant existed TWICE: as prose in the list below and as hand-written
// code in a checker further down — nothing bound them. `seam shape` showed the prose, `seam check` ran
// the code, and a rule could be added to either side alone without a single assertion noticing. That is
// precisely the second truth the head of this file forbids. The invariant now CARRIES its `check`, and
// the two exported checkers are nothing but `LIST.flatMap((invariant) => invariant.check(snapshot))`:
// a rule that is not in the list does not run, and a rule in the list that nobody implemented cannot
// compile. The witness pins one mutation per `id`.
//
// GENERIC: no domain literal. This is exclusively about the FORM of the seam.

/** ONE cross-field invariant — NAMEABLE (the tool shows it to the agent) and EXECUTABLE (the checker runs it). */
export interface FormInvariant {
  /** Stable, machine-readable identifier — the tool names it, the agent can quote it. */
  readonly id: string;
  /** What MUST hold, in one sentence. This is the FORM a build agent needs BEFORE writing. */
  readonly rule: string;
  /** Why it exists — what breaks when it is violated. */
  readonly reason: string;
  /**
   * RUNS this one invariant against a contract snapshot and returns its violation texts (empty = holds).
   * Pure / side-effect free. It is the ONLY executable form of `rule`; there is no second one.
   */
  readonly check: (snapshot: unknown) => string[];
}

/** A step/field as far as the invariants need to know them (structural — the snapshot is `unknown`). */
type RawStep = { id?: unknown; titel?: unknown; felder?: unknown };
type RawField = { name?: unknown; label?: unknown; typ?: unknown };

const isBlank = (value: unknown): boolean =>
  typeof value !== "string" || value.trim().length === 0;

/**
 * The application steps, or `null` when there are none.
 *
 * `null` makes every invariant below SILENT: that the list is missing is already stated by the duty form
 * (`contract.antrag.steps muss mind. 1 Schritt enthalten`). Two reports about the same defect do not make
 * the finding truer, only longer.
 */
function applicationSteps(snapshot: unknown): RawStep[] | null {
  const steps = lies(snapshot, "antrag.steps");
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return steps.map((rawStep) => (rawStep ?? {}) as RawStep);
}

/** Every field of every step, each with the path at which a violation would be reported. */
function applicationFields(
  snapshot: unknown,
): { field: RawField; at: string }[] {
  const found: { field: RawField; at: string }[] = [];
  (applicationSteps(snapshot) ?? []).forEach((step, stepIndex) => {
    if (!Array.isArray(step.felder)) return;
    step.felder.forEach((rawField, fieldIndex) => {
      found.push({
        field: (rawField ?? {}) as RawField,
        at: `antrag.steps[${stepIndex}].felder[${fieldIndex}]`,
      });
    });
  });
  return found;
}

/** THE APPLICATION INVARIANTS. Every single one is paid for by a measured break. */
export const LEISTUNG_APPLICATION_INVARIANTS: readonly FormInvariant[] = [
  {
    id: "schritt-id-vorhanden",
    rule: "Jeder Schritt in `antrag.steps` traegt eine nicht-leere `id`.",
    reason:
      "Die Id ist die Adresse des Schritts im Assistenten und im Vertrag; ohne sie ist kein Schritt referenzierbar.",
    check: (snapshot) =>
      (applicationSteps(snapshot) ?? []).flatMap((step, index) =>
        isBlank(step.id) ? [`antrag.steps[${index}].id fehlt/leer.`] : [],
      ),
  },
  {
    id: "schritt-id-eindeutig",
    rule: "Die `id` jedes Schritts kommt in `antrag.steps` genau EINMAL vor.",
    reason:
      "Zwei Schritte mit derselben Id sind im Fluss nicht auseinanderzuhalten — der zweite verdeckt den ersten.",
    check: (snapshot) => {
      const violations: string[] = [];
      const seenIds = new Set<string>();
      (applicationSteps(snapshot) ?? []).forEach((step, index) => {
        if (isBlank(step.id)) return;
        const id = step.id as string;
        if (seenIds.has(id))
          violations.push(
            `antrag.steps[${index}].id "${id}" ist doppelt — jede Schritt-Id darf nur einmal vorkommen.`,
          );
        seenIds.add(id);
      });
      return violations;
    },
  },
  {
    id: "schritt-titel-vorhanden",
    rule: "Jeder Schritt traegt einen nicht-leeren `titel`.",
    reason:
      "Der Titel ist die einzige Ueberschrift, die die antragstellende Person sieht; ein leerer Schritt sieht aus wie ein Defekt.",
    check: (snapshot) =>
      (applicationSteps(snapshot) ?? []).flatMap((step, index) =>
        isBlank(step.titel)
          ? [
              `antrag.steps[${index}].titel fehlt/leer${isBlank(step.id) ? "" : ` (Schritt "${step.id as string}")`}.`,
            ]
          : [],
      ),
  },
  {
    id: "schritt-hat-felder",
    rule: "Jeder Schritt traegt mindestens EIN Feld in `felder`.",
    reason:
      "Ein Schritt ohne Felder rendert eine leere Seite mit einem Weiter-Knopf. Genau so sah der gemessene Bruch aus.",
    check: (snapshot) =>
      (applicationSteps(snapshot) ?? []).flatMap((step, index) =>
        Array.isArray(step.felder) && step.felder.length > 0
          ? []
          : [
              `antrag.steps[${index}].felder ist leer — ein Schritt ohne Felder rendert eine leere Seite.`,
            ],
      ),
  },
  {
    id: "feld-name-vorhanden",
    rule: "Jedes Feld traegt einen nicht-leeren `name` (der Pfad in die Antragsdaten).",
    reason:
      "Der Name IST der Datenpfad. Ohne ihn wird die Eingabe nirgends abgelegt und ist nach dem Absenden fort.",
    check: (snapshot) =>
      applicationFields(snapshot).flatMap(({ field, at }) =>
        isBlank(field.name) ? [`${at}.name fehlt/leer.`] : [],
      ),
  },
  {
    id: "feld-name-eindeutig",
    rule: "Jeder Feld-`name` kommt ueber ALLE Schritte hinweg genau EINMAL vor.",
    reason:
      "Zwei Felder mit demselben Namen schreiben denselben Datenpfad — die spaetere Eingabe loescht die fruehere still.",
    check: (snapshot) => {
      const violations: string[] = [];
      const firstSeenAt = new Map<string, string>();
      for (const { field, at } of applicationFields(snapshot)) {
        if (isBlank(field.name)) continue;
        const name = field.name as string;
        const earlier = firstSeenAt.get(name);
        if (earlier !== undefined)
          violations.push(
            `Feld-Name "${name}" kommt zweimal vor (${earlier} und ${at}) — beide schreiben denselben Datenpfad.`,
          );
        else firstSeenAt.set(name, at);
      }
      return violations;
    },
  },
  {
    id: "feld-label-vorhanden",
    rule: "Jedes Feld traegt ein nicht-leeres `label`.",
    reason:
      "Das Label ist die Beschriftung fuer die antragstellende Person und die Zugaenglichkeits-Beschriftung des Eingabefeldes.",
    check: (snapshot) =>
      applicationFields(snapshot).flatMap(({ field, at }) =>
        isBlank(field.label) ? [`${at}.label fehlt/leer.`] : [],
      ),
  },
  {
    id: "feld-typ-vorhanden",
    rule: "Jedes Feld traegt einen nicht-leeren `typ`.",
    reason:
      "Der Typ bestimmt Eingabeart und Validierung; ohne ihn kann der Assistent das Feld nicht rendern.",
    check: (snapshot) =>
      applicationFields(snapshot).flatMap(({ field, at }) =>
        isBlank(field.typ) ? [`${at}.typ fehlt/leer.`] : [],
      ),
  },
  {
    id: "konditionierendes-feld-in-schritt-eins",
    rule: "Ist `antrag.konditionierendesFeld` gesetzt, MUSS es der `name` eines Feldes in `antrag.steps[0].felder` sein.",
    reason:
      "Es ist der Feldpfad, der den ganzen Rest des Antrags konditioniert (progressive Offenlegung ueber `sichtbarWenn`). Zeigt er auf ein Feld, das im ERSTEN Schritt nicht erhoben wird, ist die Bedingung beim Rendern der Folgeschritte nie erfuellt — der Antrag bleibt leer. Das ist der gemessene Bruch von drei Erzeugnissen.",
    check: (snapshot) => {
      const steps = applicationSteps(snapshot);
      if (!steps) return [];
      const conditioningField = (
        lies(snapshot, "antrag") as
          { konditionierendesFeld?: unknown } | undefined
      )?.konditionierendesFeld;
      if (isBlank(conditioningField)) return [];
      const declared = conditioningField as string;
      const firstStepFields = steps[0]?.felder;
      const firstStepNames = Array.isArray(firstStepFields)
        ? firstStepFields
            .map((rawField) => (rawField as RawField)?.name)
            .filter((name): name is string => !isBlank(name))
        : [];
      if (firstStepNames.includes(declared)) return [];
      return [
        `antrag.konditionierendesFeld "${declared}" ist kein Feld in antrag.steps[0].felder ` +
          `(dort stehen: ${firstStepNames.length ? firstStepNames.map((name) => `"${name}"`).join(", ") : "keine Felder"}). ` +
          "Der konditionierende Feldpfad MUSS im ERSTEN Schritt erhoben werden — sonst ist die Bedingung " +
          "beim Rendern der Folgeschritte nie erfuellt und der Antrag bleibt leer.",
      ];
    },
  },
] as const;

/**
 * RUNS the application invariants against a contract snapshot and returns the violation texts
 * (empty = in order). Pure / side-effect free — the same build as `pruefeForm`.
 *
 * ⛔ NOTHING IS CHECKED HERE THAT IS NOT IN THE LIST. The body is the list; a rule reaches a build only
 * by standing in `LEISTUNG_APPLICATION_INVARIANTS` under its own `id`.
 *
 * If `antrag.steps` is missing entirely this check reports NOTHING: that the list is missing is already
 * stated by the duty form (`contract.antrag.steps muss mind. 1 Schritt enthalten`). Two reports about the
 * same defect do not make the finding truer, only longer.
 */
export function checkApplicationForm(snapshot: unknown): string[] {
  return LEISTUNG_APPLICATION_INVARIANTS.flatMap((invariant) =>
    invariant.check(snapshot),
  );
}

// ── THE STATE-MACHINE INVARIANTS — graph-valued, therefore likewise not in the schema ───────────────
// Until 2026-09-09 they stood as code INSIDE the checker (`scripts/check-leistung-contract.mts`) and were
// thus reachable by exactly ONE caller. A tool meant to check a seam BEFORE it is written would have had
// to copy them — the second truth this file exists to prevent. They therefore moved here: WORD-IDENTICAL,
// behaviour-identical, with the same one caller as before plus the tool. Since 2026-09-11 each one also
// CARRIES its check, for the same reason as the application invariants above.

/** A state machine as far as the invariants need to know it. */
type RawStateMachine = {
  initial?: unknown;
  states?: unknown;
  transitions?: unknown;
};
type RawState = { key?: unknown; terminal?: unknown };
type RawTransition = { from?: unknown; to?: unknown; rollen?: unknown };

/** The state machine in the shape the invariants read it, or `null` when there are no states. */
function stateMachineOf(snapshot: unknown): {
  initial: string | undefined;
  states: RawState[];
  stateKeys: Set<string>;
  transitions: RawTransition[];
} | null {
  const machine = lies(snapshot, "statusMachine") as
    RawStateMachine | undefined;
  const states = machine?.states;
  if (!machine || !Array.isArray(states) || states.length < 1) return null;
  return {
    initial: machine.initial as string | undefined,
    states: states as RawState[],
    stateKeys: new Set(
      (states as RawState[]).map((state) => state.key as string),
    ),
    transitions: (Array.isArray(machine.transitions)
      ? machine.transitions
      : []) as RawTransition[],
  };
}

/** THE STATE-MACHINE INVARIANTS as NAMEABLE data that RUN (the tool shows them, `checkStateMachine` runs them). */
export const LEISTUNG_STATE_MACHINE_INVARIANTS: readonly FormInvariant[] = [
  {
    id: "initial-existiert",
    rule: "`statusMachine.initial` ist der `key` eines definierten Zustands.",
    reason:
      "Der Einstiegszustand ist die erste Zeile jeder Fallakte; zeigt er ins Leere, hat kein Vorgang einen gueltigen Anfang.",
    check: (snapshot) => {
      const machine = stateMachineOf(snapshot);
      if (!machine) return [];
      return !machine.initial || !machine.stateKeys.has(machine.initial)
        ? [
            `contract.statusMachine.initial ("${machine.initial}") ist kein definierter Zustand.`,
          ]
        : [];
    },
  },
  {
    id: "endzustand-existiert",
    rule: "Mindestens ein Zustand traegt `terminal: true`.",
    reason:
      "Ohne Endzustand kann kein Verfahren abgeschlossen werden — die Akte bleibt dauerhaft offen.",
    check: (snapshot) => {
      const machine = stateMachineOf(snapshot);
      if (!machine) return [];
      return machine.states.filter((state) => state.terminal).length < 1
        ? ["contract.statusMachine hat keinen Endzustand (terminal: true)."]
        : [];
    },
  },
  {
    id: "uebergang-kennt-zustaende",
    rule: "Jeder Uebergang referenziert mit `from` und `to` definierte Zustaende.",
    reason:
      "Ein Uebergang auf einen unbekannten Zustand ist zur Laufzeit ein toter Knopf.",
    check: (snapshot) => {
      const machine = stateMachineOf(snapshot);
      if (!machine) return [];
      const violations: string[] = [];
      for (const transition of machine.transitions) {
        if (!machine.stateKeys.has(transition.from as string))
          violations.push(
            `Übergang referenziert unbekannten from-Zustand "${transition.from as string}".`,
          );
        if (!machine.stateKeys.has(transition.to as string))
          violations.push(
            `Übergang referenziert unbekannten to-Zustand "${transition.to as string}".`,
          );
      }
      return violations;
    },
  },
  {
    id: "uebergang-traegt-rollen",
    rule: "Jeder Uebergang traegt mindestens eine Rolle in `rollen[]`.",
    reason:
      "Die Rollen sind die Zugriffskontrolle des Uebergangs; ohne sie ist nicht bestimmt, WER handeln darf.",
    check: (snapshot) => {
      const machine = stateMachineOf(snapshot);
      if (!machine) return [];
      return machine.transitions.flatMap((transition) =>
        !Array.isArray(transition.rollen) || transition.rollen.length < 1
          ? [
              `Übergang ${transition.from as string}→${transition.to as string} trägt keine Rollen (rollen[]).`,
            ]
          : [],
      );
    },
  },
  {
    id: "keine-sackgasse",
    rule: "Jeder nicht-terminale Zustand hat mindestens einen ausgehenden Uebergang.",
    reason:
      "Ein nicht-terminaler Zustand ohne Ausgang haelt den Vorgang fest, ohne ihn abzuschliessen.",
    check: (snapshot) => {
      const machine = stateMachineOf(snapshot);
      if (!machine) return [];
      const hasOutgoing = new Set(
        machine.transitions.map((transition) => transition.from as string),
      );
      return machine.states.flatMap((state) =>
        !state.terminal && !hasOutgoing.has(state.key as string)
          ? [
              `Zustand "${state.key as string}" ist nicht terminal, hat aber keinen ausgehenden Übergang (Sackgasse).`,
            ]
          : [],
      );
    },
  },
  {
    id: "keine-unerreichbarkeit",
    rule: "Jeder Zustand ist vom Initialzustand aus erreichbar.",
    reason:
      "Ein unerreichbarer Zustand ist deklarierte, nie eintretende Verfahrenswirklichkeit.",
    check: (snapshot) => {
      const machine = stateMachineOf(snapshot);
      if (!machine) return [];
      const outgoing = new Map<string, string[]>();
      for (const transition of machine.transitions) {
        const from = transition.from as string;
        if (!outgoing.has(from)) outgoing.set(from, []);
        outgoing.get(from)!.push(transition.to as string);
      }
      const reached = new Set<string>([machine.initial as string]);
      const stack = [machine.initial as string];
      while (stack.length) {
        const current = stack.pop()!;
        for (const next of outgoing.get(current) ?? []) {
          if (!reached.has(next)) {
            reached.add(next);
            stack.push(next);
          }
        }
      }
      return machine.states.flatMap((state) =>
        !reached.has(state.key as string)
          ? [
              `Zustand "${state.key as string}" ist vom Initialzustand aus nicht erreichbar.`,
            ]
          : [],
      );
    },
  },
] as const;

/**
 * RUNS the state-machine invariants. Pure / side-effect free, and — like the application form — nothing
 * but the list: `LIST.flatMap((invariant) => invariant.check(snapshot))`.
 *
 * As before in the checker: WITHOUT states nothing happens — that the list is missing is already stated by
 * the duty form. The texts are word-identical to the state before the move; this file tightens nothing.
 */
export function checkStateMachine(snapshot: unknown): string[] {
  return LEISTUNG_STATE_MACHINE_INVARIANTS.flatMap((invariant) =>
    invariant.check(snapshot),
  );
}

/** Ein JSON-Schema-Knoten (nur die Formen, die diese Projektion erzeugt). */
export type SchemaKnoten = Record<string, unknown>;

function blatt(pflicht: FormPflicht): SchemaKnoten {
  return pflicht.art === "string"
    ? { type: "string", minLength: 1, description: pflicht.grund }
    : {
        type: "array",
        minItems: pflicht.minItems ?? 0,
        description: pflicht.grund,
      };
}

/**
 * PROJIZIERT die Pflicht-Form in ein JSON-Schema (Draft 2020-12). Deterministisch: die Reihenfolge ist
 * die von `LEISTUNG_CONTRACT_FORM`, es fließt kein Datum, kein Zufall, keine Umgebung ein.
 *
 * `additionalProperties: true` ist ABSICHT: der Vertrag trägt zahlreiche OPTIONALE Bausteine (tarif,
 * codelisten, registerRefs, fimRefs, fristenTypen, datenanbindung, zustellung, rechenproben, ki,
 * personas …), die der Prüfer NICHT erzwingt. Sie hier zu fordern hieße, eine Pflicht zu behaupten,
 * die die Wahrheit nicht kennt.
 */
export function zuJsonSchema(): SchemaKnoten {
  const properties: Record<string, SchemaKnoten> = {};
  const required: string[] = [];

  for (const pflicht of LEISTUNG_CONTRACT_FORM) {
    const glieder = pflicht.pfad.split(".");
    const kopf = glieder[0]!;
    if (!required.includes(kopf)) required.push(kopf);

    if (glieder.length === 1) {
      properties[kopf] = blatt(pflicht);
      continue;
    }
    if (glieder.length !== 2)
      throw new Error(
        `zuJsonSchema: Pfad "${pflicht.pfad}" ist tiefer als zwei Glieder — die Projektion deckt das nicht.`,
      );

    const kind = glieder[1]!;
    const eltern = (properties[kopf] ??= {
      type: "object",
      required: [] as string[],
      properties: {} as Record<string, SchemaKnoten>,
      additionalProperties: true,
    });
    (eltern["required"] as string[]).push(kind);
    (eltern["properties"] as Record<string, SchemaKnoten>)[kind] =
      blatt(pflicht);
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://senticor.local/schemas/leistung-config.schema.json",
    title: "LeistungConfig — Pflicht-Kern",
    description:
      "GENERIERT aus packages/fachverfahren-kit/src/leistung-contract-form.ts via `node --experimental-strip-types scripts/emit-leistung-schema.mts` — NICHT von Hand editieren. Der PRÜFER (scripts/check-leistung-contract.mts) bleibt die Wahrheit; dieses Schema ist seine JSON-ausdrückbare Teilmenge. Nicht abgebildet, weil JSON-Schema es nicht tragen kann: StatusMachine-Graph (initial existiert, mind. ein Endzustand, keine Sackgasse, keine Unerreichbarkeit, Rollen je Übergang), Frische des Snapshots und die Zweckbindung der Datenanbindung.",
    type: "object",
    required,
    properties,
    additionalProperties: true,
  };
}
