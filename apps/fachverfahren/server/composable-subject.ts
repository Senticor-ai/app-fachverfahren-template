// composable-subject — A WITNESS TAKES ITS SUBJECT FROM THE REGISTRY, NEVER FROM A COPIED NAME.
//
// ── THE MEASUREMENT THAT CAUSED THIS FILE (2026-08-31) ────────────────────────────────────────────────────────
// This template is green: 162 test files, 1355 assertions, 0 failures. In EVERY application generated from it the
// same witnesses were red — measured against two independent, fully built procedures:
//
//   procedure A (fee assessment)         24 red
//   procedure B (cost reimbursement)     24 red
//   IDENTICAL in both                    23
//
// So 23 of 24 are not domain defects but ONE construction: the witnesses anchor on the names of this template's
// demo composables (`musterverfahren`, `musterantrag`). `composables.config.ts` states about itself, verbatim,
// that "die generierte Wahrheit ERSETZT die Muster (kein Vermischen)" — the witness therefore contradicted the
// documented intent of the very file it tests. A generated procedure SHOULD NOT mount a demo
// "Musterverfahren"; that it no longer has one is correct generation.
//
// The cost was not cosmetic: anyone opening a generated application and running `pnpm test` saw 24 red witnesses.
// The ONE real domain defect among them (a wrongly computed position) was buried in twenty-three false ones.
//
// ── THE RULE THAT FOLLOWS ────────────────────────────────────────────────────────────────────────────────────
// A witness resolves its subject AT RUNTIME FROM THE SOURCE — it asks the registry for a PROPERTY instead of
// copying a name. This is a HARDENING, not a relaxation: the rebound assertion holds in this template AND in
// every generated procedure; before, it held only here.
//
// And it never stays silent: if no subject matches, the selection THROWS with a named reason. A witness that
// went green because it found nothing would be this house's leading defect class — green because empty.
import {
  istEnabled,
  istRechtsnah,
  type AgenticComposable,
  type ComposableRegistry,
  type SpineAufgabe,
} from "@senticor/public-sector-sdk";

/** Picks a composable with the required property from the LIVE registry. Throws with a reason when none matches —
 *  "no subject" is a statement, never a silent pass. `purpose` names what the witness meant to check; without that
 *  sentence a failure here is not diagnosable. */
export function composableWith(
  reg: ComposableRegistry,
  predicate: (c: AgenticComposable) => boolean,
  purpose: string,
): AgenticComposable {
  const hits = reg.list().filter(predicate);
  if (!hits.length) {
    throw new Error(
      `no composable in the registry satisfies "${purpose}" — checked ${reg.list().length} mounted place(s): ` +
        `${
          reg
            .list()
            .map((c) => `${c.id}(${c.status})`)
            .join(", ") || "(none)"
        }`,
    );
  }
  // Deterministic: same registry -> same subject. A witness that checks a different composable depending on
  // iteration order is a different witness on every other run.
  return [...hits].sort((a, b) => a.id.localeCompare(b.id))[0]!;
}

/** A composable with a law-adjacent spine — the subject for any assertion about governance, autonomy level and
 *  review obligation. */
export function withLawAdjacentSpine(
  reg: ComposableRegistry,
  purpose: string,
): AgenticComposable {
  return composableWith(
    reg,
    (c) => !!c.spine && istRechtsnah(c.spine),
    purpose,
  );
}

/** A composable that DECLARES the named task — the subject for "it performs it". */
export function withTask(
  reg: ComposableRegistry,
  task: SpineAufgabe,
  purpose: string,
): AgenticComposable {
  return composableWith(
    reg,
    (c) => !!c.spine?.aufgaben?.includes(task),
    purpose,
  );
}

/** A composable with a spine that does NOT declare the named task — the subject for "it rejects an undeclared
 *  task". Without this selection the witness checked the rejection against a name only this template knows. */
export function withoutTask(
  reg: ComposableRegistry,
  task: SpineAufgabe,
  purpose: string,
): AgenticComposable {
  return composableWith(
    reg,
    (c) => !!c.spine && !c.spine.aufgaben?.includes(task),
    purpose,
  );
}

/** The enabled set is exactly the productively usable one (`certified`/`active`) — the PROPERTY behind the list
 *  that used to be copied out as a fixed array of names. */
export function enabledEqualsProductive(reg: ComposableRegistry): boolean {
  const enabled = new Set(reg.listEnabled().map((c) => `${c.id}:${c.version}`));
  return reg
    .list()
    .every((c) => enabled.has(`${c.id}:${c.version}`) === istEnabled(c));
}
