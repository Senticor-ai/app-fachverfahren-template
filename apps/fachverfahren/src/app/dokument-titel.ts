// dokument-titel — THE BROWSER TAB NAMES THE SERVICE, NOT THE TEMPLATE.
//
// ── THE MEASUREMENT (2026-08-31) ─────────────────────────────────────────────────────────────────────────────
// Every route of two independently built procedures carried the same tab title — `Fachverfahren - Referenz-App`
// from the unchanged template — and `document.title` was never assigned anywhere. WCAG 2.2 success criterion
// 2.4.2 "Page Titled" (level A, binding under BITV 2.0) requires a title that describes topic or purpose.
// People who orient themselves by switching windows or tabs, and screen-reader users who hear the title first,
// got the template's name on the citizen form, on the notice and in the supervisory view alike.
//
// DERIVED, NEVER WRITTEN DOWN: the name comes from the service configuration — the one seam that carries the
// procedure's identity. A generated application therefore names itself correctly without anyone editing HTML,
// and a template that is not yet a procedure honestly keeps saying so.
import { useEffect } from "react";
import type { LeistungConfig } from "@senticor/fachverfahren-kit";

/** `"<page> — <service> · <authority>"`, with every part omitted that the configuration does not carry.
 *  Exported separately from the hook so the composition can be asserted without a DOM. */
export function dokumentTitel(
  config: Pick<LeistungConfig, "label" | "kommune">,
  seite?: string,
): string {
  const teile = [
    seite?.trim() || null,
    config.label?.trim() || null,
    config.kommune?.trim() || null,
  ].filter((t): t is string => !!t);
  // Page and service are separated by an em dash, service and authority by a middle dot — the reading order a
  // tab strip needs: the most specific part first, because that is the part that is still visible when the
  // tab is narrow.
  return teile.length <= 1
    ? (teile[0] ?? "Fachverfahren")
    : `${teile[0]} — ${teile.slice(1).join(" · ")}`;
}

/** Sets `document.title` for as long as the calling view is mounted. */
export function useDokumentTitel(
  config: Pick<LeistungConfig, "label" | "kommune">,
  seite?: string,
): void {
  useEffect(() => {
    document.title = dokumentTitel(config, seite);
  }, [config.label, config.kommune, seite]);
}
