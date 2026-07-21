// forderung — das REINE Sollstellungs-/Forderungs-Modell für die Rückforderung/Erstattung (Issue #62,
// ADR-0007 §2). Der offene Restbetrag ist eine ABLEITUNG aus append-only Ereignissen (Sollstellung −
// Σ Zahlungen), KEINE gespeicherte, driftende Zweitwahrheit — dasselbe Prinzip wie die N-Augen-Zählung (#56)
// und die restbetrag-freie Bescheid-Herkunft (#60). Rein, deterministisch, order-unabhängig; Beträge als
// GANZZAHLIGE Cent (kein Float-Geld). Der SDK-Kern kennt keinen Store: er nimmt eine minimale Ereignis-Liste.

/** Die Ereignis-Arten des Forderungs-Lebenszyklus (append-only im Fall-Audit). */
export const FORDERUNG_GESTELLT = "forderung.gestellt";
export const FORDERUNG_ZAHLUNG_EINGEGANGEN = "forderung.zahlung.eingegangen";
export const FORDERUNG_GEMAHNT = "forderung.gemahnt";
export const FORDERUNG_ERLEDIGT = "forderung.erledigt";
export const FORDERUNG_NIEDERGESCHLAGEN = "forderung.niedergeschlagen";
export const FORDERUNG_GESTUNDET = "forderung.gestundet";

/** Ein Forderungs-Ereignis (nur die für die Ableitung nötigen Felder — bewusst store-unabhängig). */
export interface ForderungEreignis {
  art: string;
  /** Betrag in GANZZAHLIGEN Cent: bei `gestellt` die Soll-Höhe, bei `zahlung.eingegangen` der Eingang. */
  betragCent?: number;
  /** Fälligkeit (ISO): bei `gestellt` die ursprüngliche, bei `gestundet` die verlängerte. */
  faelligIso?: string;
  occurredAt: string;
}

export type ForderungStatus =
  | "keine"
  | "offen"
  | "teilweise-bezahlt"
  | "erledigt"
  | "niedergeschlagen"
  | "gestundet";

export interface ForderungStand {
  status: ForderungStatus;
  /** Summe aller Sollstellungen (inkl. Nachforderungen), Cent. */
  sollCent: number;
  /** Summe aller Zahlungseingänge, Cent. */
  gezahltCent: number;
  /** Offener Restbetrag = max(0, soll − gezahlt), Cent. */
  offenCent: number;
  /** Maßgebliche Fälligkeit: die verlängerte (Stundung) sonst die ursprüngliche; undefined ohne Sollstellung. */
  faelligIso?: string;
  /** Anzahl der Mahnungen (Mahnstufe). */
  mahnstufe: number;
}

/** Nur ganzzahlige, endliche, nicht-negative Cent-Beträge zählen — fremd-/partiell-erzeugte Ereignisse
 *  dürfen die Summe nicht verfälschen (defensiv, wie die Store-Naht-Guards). */
function centOf(e: ForderungEreignis): number {
  const c = e.betragCent;
  return typeof c === "number" && Number.isFinite(c) && c > 0
    ? Math.floor(c)
    : 0;
}

/**
 * Leitet den Forderungsstand aus den Ereignissen ab — order-unabhängig, rein. Statuslogik (Vorrang):
 * keine Sollstellung → „keine"; niedergeschlagen → „niedergeschlagen"; voll bezahlt oder `erledigt` → „erledigt";
 * gestundet (und noch offen) → „gestundet"; teilweise bezahlt → „teilweise-bezahlt"; sonst „offen".
 */
export function berechneForderungsstand(
  ereignisse: readonly ForderungEreignis[],
): ForderungStand {
  const gestellt = ereignisse.filter((e) => e.art === FORDERUNG_GESTELLT);
  const sollCent = gestellt.reduce((s, e) => s + centOf(e), 0);
  const gezahltCent = ereignisse
    .filter((e) => e.art === FORDERUNG_ZAHLUNG_EINGEGANGEN)
    .reduce((s, e) => s + centOf(e), 0);
  const offenCent = Math.max(0, sollCent - gezahltCent);
  const mahnstufe = ereignisse.filter(
    (e) => e.art === FORDERUNG_GEMAHNT,
  ).length;

  // Maßgebliche Fälligkeit: jüngste Stundung, sonst jüngste Sollstellung (chronologisch über occurredAt).
  const juengste = (art: string): string | undefined =>
    ereignisse
      .filter((e) => e.art === art && typeof e.faelligIso === "string")
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .at(-1)?.faelligIso;
  const faelligIso =
    juengste(FORDERUNG_GESTUNDET) ?? juengste(FORDERUNG_GESTELLT);

  const hatNiedergeschlagen = ereignisse.some(
    (e) => e.art === FORDERUNG_NIEDERGESCHLAGEN,
  );
  const hatErledigt = ereignisse.some((e) => e.art === FORDERUNG_ERLEDIGT);
  const hatGestundet = ereignisse.some((e) => e.art === FORDERUNG_GESTUNDET);

  let status: ForderungStatus;
  if (gestellt.length === 0) status = "keine";
  else if (hatNiedergeschlagen) status = "niedergeschlagen";
  else if (offenCent === 0 || hatErledigt) status = "erledigt";
  else if (hatGestundet) status = "gestundet";
  else if (gezahltCent > 0) status = "teilweise-bezahlt";
  else status = "offen";

  return {
    status,
    sollCent,
    gezahltCent,
    offenCent,
    ...(faelligIso !== undefined ? { faelligIso } : {}),
    mahnstufe,
  };
}

/**
 * Ist die Forderung zum Zeitpunkt `nowIso` MAHNBAR (überfällig + offen)? Verbindet den Forderungsstand mit
 * dem zeitgetriebenen Fristen-Scanner (#58): eine offene, fällige, nicht gestundete/niedergeschlagene/erledigte
 * Forderung, deren Fälligkeit erreicht ist, kann eine Mahnung auslösen. Injizierte Zeit (kein Date.now).
 */
export function istForderungMahnbar(
  stand: ForderungStand,
  nowIso: string,
): boolean {
  if (stand.status !== "offen" && stand.status !== "teilweise-bezahlt")
    return false;
  if (stand.offenCent <= 0) return false;
  if (stand.faelligIso === undefined) return false;
  return stand.faelligIso <= nowIso;
}
