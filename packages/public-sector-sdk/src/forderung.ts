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

  // Maßgebliche Fälligkeit: das CHRONOLOGISCH JÜNGSTE fristsetzende Ereignis (Sollstellung, Stundung ODER
  // Mahnung) gewinnt. Kritisch fürs Mahnwesen: eine Mahnung setzt eine NEUE Frist → die Forderung ist erst
  // nach deren Ablauf wieder mahnbar (kein Dauer-Mahnen bei jedem Scan-Tick).
  const faelligIso = ereignisse
    .filter(
      (e) =>
        typeof e.faelligIso === "string" &&
        (e.art === FORDERUNG_GESTELLT ||
          e.art === FORDERUNG_GESTUNDET ||
          e.art === FORDERUNG_GEMAHNT),
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .at(-1)?.faelligIso;

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

/** Die Standard-Obergrenze der Mahnstufe: danach folgt Vollstreckung/Niederschlagung, kein Weiter-Mahnen. */
export const DEFAULT_MAX_MAHNSTUFE = 3;

/** Soll für diese Forderung eine (weitere) Mahnung ausgelöst werden? Mahnbar (überfällig + offen) UND die
 *  Mahnstufe hat die Obergrenze noch nicht erreicht. Rein/deterministisch (injizierte Zeit). */
export function planeMahnung(
  stand: ForderungStand,
  nowIso: string,
  maxMahnstufe: number = DEFAULT_MAX_MAHNSTUFE,
): boolean {
  return istForderungMahnbar(stand, nowIso) && stand.mahnstufe < maxMahnstufe;
}

/** Minimale Fall-Audit-Ereignis-Form für die Ableitung — store-unabhängig (Parität zu StatusMachineSource). */
export interface ForderungAuditQuelle {
  eventType: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
}

/** Ein Forderungs-Ereignis aus einer payload (art + betragCent/faelligIso) rekonstruieren — defensiv. */
function ausPayload(
  art: string,
  payload: Record<string, unknown> | undefined,
  occurredAt: string,
): ForderungEreignis {
  const betrag = payload?.["betragCent"];
  const faellig = payload?.["faelligIso"];
  return {
    art,
    ...(typeof betrag === "number" ? { betragCent: betrag } : {}),
    ...(typeof faellig === "string" ? { faelligIso: faellig } : {}),
    occurredAt,
  };
}

/**
 * Die READ-Brücke: extrahiert die Forderungs-Ereignisse aus dem append-only Fall-Audit und berechnet den
 * Forderungsstand. Zwei Formen (beide server-geschrieben): (a) EIGENSTÄNDIGE `forderung.*`-Ereignisse
 * (Zahlung/Mahnung, standalone) und (b) eine in eine andere Event-payload EINGEBETTETE Sollstellung
 * (`payload.forderung`, die ATOMAR mit dem Übergang schreibt — wie der eingefrorene VA). Der offene Restbetrag
 * bleibt eine reine Ableitung, nie eine gespeicherte Zweitwahrheit. So liest jede BFF-/UI-Fläche denselben Stand.
 */
export function forderungsstandAusAudit(
  events: readonly ForderungAuditQuelle[],
): ForderungStand {
  const ereignisse: ForderungEreignis[] = [];
  for (const e of events) {
    if (e.eventType.startsWith("forderung.")) {
      ereignisse.push(ausPayload(e.eventType, e.payload, e.occurredAt));
    }
    const eingebettet = e.payload?.["forderung"];
    if (eingebettet && typeof eingebettet === "object") {
      const f = eingebettet as Record<string, unknown>;
      if (typeof f["art"] === "string") {
        ereignisse.push(ausPayload(f["art"], f, e.occurredAt));
      }
    }
  }
  return berechneForderungsstand(ereignisse);
}
