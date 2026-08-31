// pristine-source — DOES THIS TREE STILL HAVE AN UNTOUCHED TEMPLATE TO RENDER FROM?
//
// ── THE MEASUREMENT THAT CAUSED THIS FILE (2026-08-31) ────────────────────────────────────────────────────────
// The scaffold engine renders a domain app FROM the pristine template. A CHOS-governed consumer project is not
// one — it carries `.chos/` and a `cognitive-hive.*` symlink into the shared source governance, and rendering
// from it would follow that symlink and flip the shared source for every future build (CHOS-CODE#68). The guard
// in `render.ts` refuses hard, and that refusal is correct.
//
// But this engine ships INTO every generated application, and so do its witnesses. Measured against two fully
// built procedures (two independently built procedures) eight assertions were
// red in BOTH — every one of them with the guard's own message. They were not defects: they were witnesses whose
// subject cannot exist where they run.
//
// ── WHY NOT SIMPLY SKIP ──────────────────────────────────────────────────────────────────────────────────────
// "green because empty" is this house's leading defect class. A witness that quietly skips in a consumer would
// claim, in the place where it matters most, that it had checked something. So the branch does the opposite: in a
// governed consumer it asserts the GUARD — that scaffolding from here is refused, with the documented reason.
// The consumer is exactly where that property protects something real, so that is where it gets proven.
import { isLiveConsumerProject } from "./render.js";

/** The message fragments the guard is contractually bound to name. Kept next to the assertion, not copied into
 *  each witness: a reason that drifts silently would let a WEAKER refusal pass as the documented one. */
export const REFUSAL_MARKERS = /live\/governed consumer project|CHOS-CODE#68/;

/** Can a scaffold be rendered FROM `dir`? False in a governed consumer — there the guard refuses by design. */
export async function canScaffoldFrom(dir: string): Promise<boolean> {
  return !(await isLiveConsumerProject(dir));
}

/** Runs `scaffold` and asserts that it REFUSES with the documented reason. Throws otherwise.
 *
 *  Framework-free on purpose: this helper is used from vitest witnesses AND is meant to stay usable from a plain
 *  script. It never returns quietly — either the refusal happened, or it throws with what happened instead. */
export async function assertRefusesToScaffold(
  scaffold: () => Promise<unknown>,
): Promise<void> {
  let threw: unknown;
  try {
    await scaffold();
  } catch (e) {
    threw = e;
  }
  if (threw === undefined) {
    throw new Error(
      "scaffolding from a governed consumer SUCCEEDED — the CHOS-CODE#68 guard did not fire. That is the " +
        "cross-tenant corruption this guard exists to prevent, not a passing test.",
    );
  }
  const text = String((threw as Error)?.message ?? threw);
  if (!REFUSAL_MARKERS.test(text)) {
    throw new Error(
      `scaffolding failed, but NOT with the documented refusal — the guard may have been replaced by an ` +
        `unrelated error, and then nothing is proven. Got: ${text}`,
    );
  }
}
