// tenor-nachrechnung — die Behörde rechnet den Bescheid-Betrag NACH, bevor sie ihn einfriert.
//
// GEMESSEN (2026-07-27): der Tenor des Verwaltungsakts wurde aus `case.data.berechnung` eingefroren — einer
// Zahl, die der BROWSER des Antragstellers gerechnet hat (`berechne` ist Client-TS). `tenorHerkunft` stand
// darum ehrlich, aber fest auf „client-berechnet". Zwanzig Zeilen weiter bestimmte `berechneTarif` die
// Sollstellung server-autoritativ. Zwei Zahlen desselben Falls, aus zwei Welten, und nichts verglich sie.
//
// WARUM DAS MEHR IST ALS EINE INKONSISTENZ. Ein Verwaltungsakt muss nachvollziehbar sein: dieselbe Eingabe,
// dieselbe Rechtsfolge, heute wie in drei Jahren im Widerspruchsverfahren. Eine im fremden Gerät gerechnete
// Zahl kann die Behörde nicht wiederholen und nicht verantworten — für sie ist ein fremder Browser dasselbe
// wie ein Sprachmodell: eine Quelle, die sie nicht besitzt. Der SHA-256 über den eingefrorenen VA ändert daran
// nichts; er belegt UNVERÄNDERLICHKEIT, nie RICHTIGKEIT. Ohne Nachrechnung konserviert er den Fehler.
//
// ── KEINE ZWEITE TARIF-KOPIE ────────────────────────────────────────────────────────────────────────────────
// Der Satz ist im Verfahren bereits deklariert: als `stelltForderung.tarif` an dem Übergang, der die
// Sollstellung stellt. Diese Nachrechnung LIEST ihn — sie bringt keinen eigenen mit. Das ist der Punkt: eine
// Nachrechnung gegen eine zweite Abschrift desselben Tarifs würde nur prüfen, ob zwei Kopien noch gleich sind,
// und genau das ist der Defekt, den sie beheben soll.
//
// FAIL-CLOSED, aber nur wo es trägt: gibt es KEINEN Tarif, wird nicht nachgerechnet (das heutige Verhalten,
// unverändert). Gibt es MEHRERE, die einander widersprechen, wird NICHT geraten — dann ist unklar, welcher die
// Satzung ist, und eine geratene Rechtsgrundlage ist schlimmer als keine.
//
// GENERISCH: kein Abgaben-, Orts- oder Behördenliteral. Ganzzahlige kleinste Einheit (Cent), rein, deterministisch.
import { berechneTarif, type TarifTabelle } from "./tarif.js";

/**
 * THE DOMAIN CAPABILITY that CARRIES this procedure's rate — as a DECLARATION, not as an address.
 *
 * An agentic composable is the domain capability (calculating, subsuming, checking); the application is the
 * human surface. Where the authoritative rate does not sit in the procedure as a tariff table but in a
 * composable program, the procedure says so HERE — with the identifier of the composable and the identifier
 * of the structured program (`AgenticComposable.strukturiert[].id`; the claim travels, never the body).
 */
export interface TenorProgramRef {
  /** `AgenticComposable.id` of the office that answers for the rate. */
  composableId: string;
  /** Identifier of the structured capability at that office (e.g. a levy calculation). */
  programm: string;
}

/** The program's STRUCTURED answer, as far as the recalculation needs it. */
export interface TenorProgramResult {
  /** The amount the program determined, in the smallest unit (cents) — computed on the server or publisher side. */
  betragCent: number;
}

/** DATEN-Bindung der Nachrechnung: woher Kategorie und client-gerechneter Betrag in der Fallakte stehen. */
export interface TenorNachrechnungConfig {
  /** Punkt-Pfad auf die vom Antragsteller GEWÄHLTE Kategorie. Die Wahl ist zulässige Eingabe — die Höhe nicht. */
  diskriminator: string;
  /** Punkt-Pfad auf den client-gerechneten Betrag, der nachgeprüft wird (z. B. „berechnung.betrag"). */
  betragPfad: string;
  /** Umrechnung der natürlichen Einheit des Clients in die kleinste Einheit des Tarifs. Default 100 (EUR→Cent). */
  centJeEinheit?: number;
  /**
   * Dot path to the DISPLAY STATUS of the client-computed calculation (`"provisional" | "final"`).
   *
   * DEFAULT (no declaration): the sibling field `status` next to `betragPfad`. That is not a guess but the
   * shape of the ONE kit type `Berechnung`, which carries both fields side by side. Whoever stores the
   * amount under `berechnung.betrag` stores the status under `berechnung.status`.
   */
  statusPfad?: string;
  /**
   * THE CALCULATION AUTHORITY LIES WITH THE COMPOSABLE, not with the procedure.
   *
   * Set ⇒ the authoritative rate does NOT sit in the procedure as a tariff table but in the named domain
   * capability. The recalculation then expects that capability's structured result; if it does not come,
   * the Bescheid is NOT issued (fail-closed). There is deliberately NO fallback here to the client-computed
   * amount, and none to a local table: a procedure that hands over the authority must not quietly take it
   * back as soon as the office falls silent. Exactly this silent fallback is the state that the measurement
   * „RECHEN-HOHEIT AM FALSCHEN ORT" (calculation authority in the wrong place) describes.
   */
  programm?: TenorProgramRef;
}

/** Woher der autoritative Tarif kommt — oder warum er nicht feststeht. */
export type TarifQuelle =
  | { art: "eindeutig"; tarif: TarifTabelle }
  | { art: "keine" }
  | { art: "mehrdeutig"; anzahl: number };

/** Ein Verfahren, soweit diese Prüfung es kennen muss (strukturell getippt — kein Import-Zyklus). */
interface VerfahrenMitUebergaengen {
  allowedTransitions: readonly {
    stelltForderung?: { tarif?: TarifTabelle } | undefined;
  }[];
}

const kanon = (t: TarifTabelle): string =>
  JSON.stringify({
    p: [...t.positionen]
      .map((x) => [x.kategorie, x.betragCent])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    d: t.defaultCent ?? 0,
  });

/**
 * Der autoritative Tarif DIESES Verfahrens — aus den Übergängen gelesen, nicht aus einer Kopie.
 *
 * Mehrere INHALTSGLEICHE Deklarationen zählen als eine (dieselbe Satzung, mehrfach geschrieben ist unschön,
 * aber nicht mehrdeutig). Erst inhaltlich VERSCHIEDENE machen die Quelle mehrdeutig — dann steht nicht fest,
 * welcher Satz gilt, und es wird nicht geraten.
 */
export function tarifDesVerfahrens(
  verfahren: VerfahrenMitUebergaengen,
): TarifQuelle {
  const tarife = (verfahren?.allowedTransitions ?? [])
    .map((u) => u?.stelltForderung?.tarif)
    .filter((t): t is TarifTabelle => Boolean(t?.positionen));
  if (!tarife.length) return { art: "keine" };
  const verschieden = new Set(tarife.map(kanon));
  if (verschieden.size > 1)
    return { art: "mehrdeutig", anzahl: verschieden.size };
  return { art: "eindeutig", tarif: tarife[0]! };
}

export interface TenorUrteil {
  /** Wurde überhaupt nachgerechnet? `false` ⇒ heutiges Verhalten, Herkunft bleibt „client-berechnet". */
  nachgerechnet: boolean;
  /** AGAINST WHAT the amount was recalculated. `"composable"` means the domain capability answered for the
   *  rate, not a table in the procedure. `null` when no recalculation took place. */
  quelle: "tarif" | "composable" | null;
  /** Darf der Bescheid erlassen werden? Bei `false` nennt `grund` warum — fail-closed VOR dem Einfrieren. */
  ok: boolean;
  /** Der server-autoritative Betrag in kleinster Einheit. `null`, wenn nicht nachgerechnet. */
  betragCent: number | null;
  /** Der client-gelieferte Betrag in kleinster Einheit. `null`, wenn er nicht als Zahl vorlag. */
  clientCent: number | null;
  /** `clientCent - betragCent`. `null`, wenn nicht vergleichbar — eine fehlende Seite ist KEINE Gleichheit. */
  divergenz: number | null;
  /** War die gewählte Kategorie im Tarif hinterlegt? */
  kategorieBekannt: boolean;
  grund: string;
}

/**
 * THE PATH TO THE DISPLAY STATUS of the client-computed calculation.
 *
 * Without a declaration of its own, the SIBLING field `status` next to `betragPfad`: the kit type
 * `Berechnung` carries `betrag` and `status` side by side, so whoever stores the amount under
 * `berechnung.betrag` stores the status under `berechnung.status`. That is the shape of the type, not a
 * heuristic — and it heals existing procedures without a single config changing.
 */
export function statusPathOf(cfg: TenorNachrechnungConfig): string {
  if (cfg.statusPfad) return cfg.statusPfad;
  const segments = cfg.betragPfad.split(".");
  segments[segments.length - 1] = "status";
  return segments.join(".");
}

const nz = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Rechnet den Tenor nach und urteilt, ob der Bescheid erlassen werden darf.
 *
 * NICHT nachgerechnet wird ohne Konfiguration oder ohne eindeutigen Tarif — dann bleibt alles wie heute
 * (`ok: true`, `nachgerechnet: false`). Wo nachgerechnet WIRD, gilt fail-closed:
 *   * unbekannte Kategorie ⇒ kein Erlass. Der Tarif kennt den Fall nicht; `defaultCent` ist ein Auffangwert
 *     für die Sollstellung, keine Rechtsgrundlage für eine Festsetzung.
 *   * client-Betrag fehlt oder ist keine Zahl ⇒ kein Erlass. Nichts zu vergleichen ist keine Übereinstimmung.
 *   * Divergenz ⇒ kein Erlass. Der fremde Betrag wird ausdrücklich NICHT stillschweigend überschrieben: dass
 *     die beiden auseinanderlaufen, ist ein Befund über das Verfahren (welcher Satz stimmt?) und gehört einem
 *     Menschen, nicht einer stillen Korrektur.
 */
export function pruefeTenor(
  cfg: TenorNachrechnungConfig | undefined,
  quelle: TarifQuelle,
  werte: {
    kategorie: unknown;
    clientBetrag: unknown;
    /** The DISPLAY STATUS of the client-computed calculation, read under `statusPfad`. */
    clientStatus?: unknown;
    /** The structured result of the domain capability — only when `cfg.programm` names it. */
    programmErgebnis?: TenorProgramResult | undefined;
  },
): TenorUrteil {
  const aus = (grund: string): TenorUrteil => ({
    nachgerechnet: false,
    quelle: null,
    ok: true,
    betragCent: null,
    clientCent: null,
    divergenz: null,
    kategorieBekannt: false,
    grund,
  });
  if (!cfg)
    return aus(
      "keine Nachrechnung deklariert — der Tenor bleibt client-berechnet (unverändertes Verhalten)",
    );

  const rawFactor = nz(cfg.centJeEinheit) ?? 100;
  const rawAmount = nz(werte.clientBetrag);
  const rawClientCent =
    rawAmount === null ? null : Math.round(rawAmount * rawFactor);

  // ── A PREVIEW IS NOT A FESTSETZUNG ───────────────────────────────────────────────────────────────
  // `Berechnung.status` says `"provisional"` while inputs the calculation needs are MISSING — it is
  // explicitly a partial/preview result for the applicant. Until 2026-09-09 the server read this status
  // nowhere (0 hits in SDK, BFF and server) and could therefore freeze a preview value as the Tenor. A
  // frozen Verwaltungsakt over a preview value is substantively unlawful and yet EFFECTIVE — it takes
  // real money.
  // FAIL-CLOSED ONLY WHERE IT IS WARRANTED: blocking happens solely on an EXPLICIT `"provisional"`. A
  // missing status is what existing data looks like, and it stays untouched (no false blocker).
  if (werte.clientStatus === "provisional")
    return {
      nachgerechnet: false,
      quelle: null,
      ok: false,
      betragCent: null,
      clientCent: rawClientCent,
      divergenz: null,
      kategorieBekannt: false,
      grund:
        "die übermittelte Berechnung ist als VORSCHAU gekennzeichnet (status „provisional“) — ihr fehlen " +
        "nach eigener Aussage Eingaben. Ein Vorschauwert trägt keine Festsetzung; der Bescheid wird nicht " +
        "erlassen, bis die Berechnung „final“ ist.",
    };

  // ── THE DOMAIN CAPABILITY TAKES PRECEDENCE WHEN THE PROCEDURE DECLARES IT SO ─────────────────────
  // If the procedure declares a composable program to be the authoritative source, the amount is NOT
  // recalculated against a local table — and without that program's structured result, not at all. If
  // the office stays silent, the rate is undetermined; falling back to the client-computed amount would
  // be exactly the silent withdrawal of authority that this declaration rules out.
  if (cfg.programm) {
    const programResult = werte.programmErgebnis;
    if (!programResult || nz(programResult.betragCent) === null)
      return {
        nachgerechnet: false,
        quelle: null,
        ok: false,
        betragCent: null,
        clientCent: rawClientCent,
        divergenz: null,
        kategorieBekannt: false,
        grund:
          `das Verfahren erklärt das Programm »${cfg.programm.programm}« der Stelle ` +
          `»${cfg.programm.composableId}« zur autoritativen Quelle des Satzes; ein strukturiertes Ergebnis ` +
          "liegt nicht vor. Es wird weder geraten noch auf den im Browser gerechneten Betrag zurückgefallen — " +
          "der Bescheid wird nicht erlassen.",
      };
    if (rawClientCent === null)
      return {
        nachgerechnet: true,
        quelle: "composable",
        ok: false,
        betragCent: programResult.betragCent,
        clientCent: null,
        divergenz: null,
        kategorieBekannt: true,
        grund:
          `unter »${cfg.betragPfad}« steht kein Betrag als Zahl. Nichts zu vergleichen ist keine ` +
          `Übereinstimmung; das Programm »${cfg.programm.programm}« ergab ${programResult.betragCent} (kleinste Einheit).`,
      };
    const deviation = rawClientCent - programResult.betragCent;
    return {
      nachgerechnet: true,
      quelle: "composable",
      ok: deviation === 0,
      betragCent: programResult.betragCent,
      clientCent: rawClientCent,
      divergenz: deviation,
      kategorieBekannt: true,
      grund:
        deviation === 0
          ? `nachgerechnet gegen das Programm »${cfg.programm.programm}« der Stelle ` +
            `»${cfg.programm.composableId}«: ${programResult.betragCent} (kleinste Einheit), übereinstimmend`
          : `der übermittelte Betrag (${rawClientCent}) weicht vom Ergebnis des Programms ` +
            `»${cfg.programm.programm}« (${programResult.betragCent}) um ${deviation} ab. Der Bescheid wird nicht ` +
            "erlassen: das ist ein Befund über das Verfahren, keine stille Korrektur.",
    };
  }

  if (quelle.art === "keine")
    return aus(
      "kein Tarif im Verfahren deklariert — es gibt nichts, wogegen nachgerechnet werden könnte",
    );
  if (quelle.art === "mehrdeutig")
    return {
      nachgerechnet: false,
      quelle: null,
      ok: false,
      betragCent: null,
      clientCent: null,
      divergenz: null,
      kategorieBekannt: false,
      grund:
        `das Verfahren deklariert ${quelle.anzahl} einander widersprechende Tarife — welcher Satz gilt, steht ` +
        "nicht fest. Ein geratener Satz wäre eine erfundene Rechtsgrundlage; der Bescheid wird nicht erlassen.",
    };

  const faktor = nz(cfg.centJeEinheit) ?? 100;
  const kategorie =
    typeof werte.kategorie === "string" ? werte.kategorie.trim() : "";
  const roh = nz(werte.clientBetrag);
  const clientCent = roh === null ? null : Math.round(roh * faktor);
  const erg = berechneTarif(quelle.tarif, kategorie);

  if (!erg.bekannt)
    return {
      nachgerechnet: true,
      quelle: "tarif",
      ok: false,
      betragCent: null,
      clientCent,
      divergenz: null,
      kategorieBekannt: false,
      grund:
        `die Kategorie »${kategorie || "(leer)"}« ist im Tarif des Verfahrens nicht hinterlegt. Der Auffangwert ` +
        "trägt eine Sollstellung, aber keine Festsetzung — es fehlt die Grundlage für den Betrag.",
    };
  if (clientCent === null)
    return {
      nachgerechnet: true,
      quelle: "tarif",
      ok: false,
      betragCent: erg.betragCent,
      clientCent: null,
      divergenz: null,
      kategorieBekannt: true,
      grund:
        `unter »${cfg.betragPfad}« steht kein Betrag als Zahl. Nichts zu vergleichen ist keine Übereinstimmung; ` +
        `nachgerechnet ergäbe der Tarif ${erg.betragCent} (kleinste Einheit).`,
    };
  const divergenz = clientCent - erg.betragCent;
  if (divergenz !== 0)
    return {
      nachgerechnet: true,
      quelle: "tarif",
      ok: false,
      betragCent: erg.betragCent,
      clientCent,
      divergenz,
      kategorieBekannt: true,
      grund:
        `der übermittelte Betrag (${clientCent}) weicht vom nachgerechneten Satz (${erg.betragCent}) um ` +
        `${divergenz} ab. Der Bescheid wird nicht erlassen: entweder ist die Berechnung des Antragsformulars ` +
        "veraltet oder der hinterlegte Tarif — das ist zu klären, nicht still zu überschreiben.",
    };
  return {
    nachgerechnet: true,
    quelle: "tarif",
    ok: true,
    betragCent: erg.betragCent,
    clientCent,
    divergenz: 0,
    kategorieBekannt: true,
    grund: `nachgerechnet: Kategorie »${kategorie}« ergibt ${erg.betragCent} (kleinste Einheit), übereinstimmend`,
  };
}
