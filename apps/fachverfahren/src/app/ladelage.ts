// ladelage — FOUR STATES, NOT TWO. A failed load is not an empty result.
//
// ── THE MEASUREMENT THAT CAUSED THIS FILE (2026-08-31) ───────────────────────────────────────────────────────
// An adversarial review of two independently built procedures confirmed the SAME construction in five pages of
// this template, identically in both applications:
//
//   buerger-bescheid.tsx     .catch(() => undefined)  ->  "Für diesen Antrag liegt noch kein Bescheid vor."
//   nachweis-sektion.tsx     .catch(() => undefined)  ->  "Noch keine Nachweise hochgeladen"
//   amt-verfahren-wiki.tsx   .catch(() => undefined)  ->  "Noch kein Wissen hinterlegt"
//   buerger-antrag.tsx       .catch(() => undefined)  ->  "Antrag nicht gefunden."
//   buerger-postfach.tsx     error branch WITHOUT a control -> "Bitte erneut versuchen."
//
// In each case the layer underneath had already made the distinction correctly — `ladeBescheid` maps 404 to
// `null` and RETHROWS everything else. The page threw that distinction away. What the citizen then reads is not
// a missing error message but a FALSE STATEMENT OF FACT: that no notice, no evidence, no application exists.
// On the notice page that costs an appeal deadline; in the case wiki it silently removes AI drafts from review.
//
// "Not asked yet" and "asked, got nothing" and "asked, could not find out" are three states with three
// remedies. Conflating any two of them is this house's leading defect class.
//
// ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────────────────────────────────────
// Not a data-fetching library and not a cache. It is the smallest thing that keeps the three answers apart and
// hands the surface a retry, so that a named remedy always has a control behind it.
import { useCallback, useEffect, useState } from "react";

/** The state of one load. `geladen` carries whatever the loader returned — including `null`, which is an
 *  ANSWER ("the server says there is none"), never the same thing as a failure. */
export type Ladelage<T> =
  | { art: "laedt" }
  | { art: "geladen"; wert: T }
  | { art: "fehler"; grund: string; status: number | null };

/** Pulls an HTTP status out of an unknown rejection when the client layer carries one (`CaseRequestError` and
 *  its siblings all expose `.status`). Never guesses: no status is `null`, and `null` is rendered as "unknown",
 *  not as a plausible number. */
export function statusVon(fehler: unknown): number | null {
  const s = (fehler as { status?: unknown } | null)?.status;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

/** The reason, as text. Empty messages become a named fallback rather than an empty line — a refusal without a
 *  reason is a dead end with text. */
export function grundVon(fehler: unknown): string {
  const m = (fehler as { message?: unknown } | null)?.message;
  return typeof m === "string" && m.trim() ? m : "Unbekannte Ursache.";
}

/**
 * Runs `laden` and keeps the three answers apart. Returns the state plus `erneut()`, which re-runs the SAME
 * loader — a second fetch path would be a second truth about how this view is read.
 *
 * `laden` must be stable (wrap it in `useCallback` at the call site); `erneut` bumps an internal counter that
 * the effect depends on.
 */
export function useLadelage<T>(laden: () => Promise<T>): {
  lage: Ladelage<T>;
  erneut: () => void;
} {
  const [lage, setLage] = useState<Ladelage<T>>({ art: "laedt" });
  const [versuch, setVersuch] = useState(0);

  useEffect(() => {
    let abgebrochen = false;
    setLage({ art: "laedt" });
    laden()
      .then((wert) => {
        if (!abgebrochen) setLage({ art: "geladen", wert });
      })
      .catch((fehler: unknown) => {
        if (abgebrochen) return;
        setLage({
          art: "fehler",
          grund: grundVon(fehler),
          status: statusVon(fehler),
        });
      });
    return () => {
      abgebrochen = true;
    };
  }, [laden, versuch]);

  const erneut = useCallback(() => setVersuch((n) => n + 1), []);
  return { lage, erneut };
}
