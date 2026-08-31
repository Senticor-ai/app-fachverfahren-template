// DIE EINE Dossier-Naht dieser App — das Fall-/Dossier-Verfahren als DATEN. Das server-seitige Gegenstück
// zu src/leistung.config.ts (der Antrag-Naht): so wie die Antrag-UX allein aus `LeistungConfig` rendert,
// treibt EINE `ProcedureVersion` die Fall-Zustandsmaschine (allowedStates/allowedTransitions + Rechtsgrundlagen +
// Vier-Augen), die der reine `transitionCase`-Reducer ausführt. Kein verfahrens-spezifischer Server-Code sonst.
//
// DEFAULT: ein NEUTRALES, verfahrens-UNSPEZIFISCHES „Musterverfahren", NUR damit die Vorlage eigenständig läuft
// (pnpm dev, APP_STORE_MODE=memory) und den vollen Dossier-Flow zeigt (Akte · Ziele/Schritte · Übergänge ·
// Vier-Augen · Verlauf). Es sind bewusst KEINE echten Fachdaten: Zustände, Rechtsgrundlagen und Fristen eines
// realen Verfahrens stehen NICHT hier — sie kommen aus dem FACHKONZEPT (bzw. der FIM/KGSt-BPMN).
//
// GENERIERT: ein generierender Build (Agent / chos-code governed build / gtc-builder) ÜBERSCHREIBT GENAU DIESE
// DATEI mit der aus dem Fachkonzept (BPMN → `bpmnToProcedureVersion`) abgeleiteten `ProcedureVersion` des
// jeweiligen Verfahrens. Dieselbe App, dieselben Bausteine, anderes Verfahren — ohne dass eine weitere Datei der
// App sich ändert. Das ist die EINE Naht zwischen Generierung und laufender Fall-/Dossier-App.
//
// Ein vollständiges reales Beispiel (Integrationsmanagement mit §§ AufenthG/FlüAG) liegt als AGENT-VORLAGE in der
// dossier-fallmanagement-Skill + docs/examples/integrationsberatung/ — es gehört NICHT in diese neutrale Vorlage.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  builtInPermissions,
  statusMachineToProcedureVersion,
} from "@senticor/public-sector-sdk";
import type {
  ProcedureVersion,
  StatusMachineSource,
  StatusMachineTransitionSource,
} from "@senticor/public-sector-sdk";

/** Feinere RBAC lebt in der Governance-/BFF-Schicht; die Übergänge tragen die Schreib-Permission
 *  case.decision.prepare (wie die aus BPMN abgeleiteten Übergänge). */
const PREPARE = builtInPermissions.casePrepareDecision.permission;

/**
 * Das Dossier-Verfahren (Zustandsmaschine + Rechtsgrundlagen als DATEN) — DER EINE Austausch-Punkt.
 * Neutrales Musterverfahren: eingegangen → in-bearbeitung ⇄ pausiert → abgeschlossen ⇄ wiederaufnehmen,
 * mit Vier-Augen-Abschluss (der Abschluss schließt den Fall: `closesCase`). Ein reales Verfahren führt seine
 * echten Zustände/Rechtsgrundlagen; die Generierung überschreibt genau dieses Objekt.
 */
export const dossierProcedure: ProcedureVersion = {
  procedureId: "musterverfahren",
  version: "1.0.0",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  // Platzhalter-Rechtsgrundlage — ein reales Verfahren trägt hier seine echten §§ (nie erfunden).
  legalBasisIds: ["muster-satzung-1"],
  allowedStates: ["eingegangen", "in-bearbeitung", "pausiert", "abgeschlossen"],
  allowedTransitions: [
    {
      from: "eingegangen",
      to: "in-bearbeitung",
      action: "annehmen",
      requiredPermission: PREPARE,
    },
    {
      from: "in-bearbeitung",
      to: "pausiert",
      action: "pausieren",
      requiredPermission: PREPARE,
    },
    {
      from: "pausiert",
      to: "in-bearbeitung",
      action: "fortsetzen",
      requiredPermission: PREPARE,
    },
    {
      from: "in-bearbeitung",
      to: "abgeschlossen",
      action: "abschließen",
      requiredPermission: PREPARE,
      requiresFourEyes: true,
      closesCase: true,
    },
    {
      from: "abgeschlossen",
      to: "in-bearbeitung",
      action: "wiederaufnehmen",
      requiredPermission: PREPARE,
    },
  ],
};

/**
 * Das ANTRAGS-Verfahren als server-seitige `ProcedureVersion` — das server-importierbare Gegenstück zur
 * Antrags-Zustandsmaschine in src/leistung.config.ts.
 *
 * WARUM DUPLIZIERT (und wie gegen Drift gesichert): leistung.config.ts ist Client-Wahrheit und liegt
 * ausserhalb des Server-rootDir (server/ vs. src/) — der Server KANN sie nicht importieren. Damit ein
 * eingereichter Antrag zur server-persistierten Akte werden kann (POST /api/buerger/antraege), braucht der
 * Server dieselbe Zustandsmaschine hier. Die untenstehende Quelle SPIEGELT leistung.config.statusMachine;
 * das Gate `check:antrag-procedure` verifiziert die Übereinstimmung, indem es aus BEIDEN ableitet und
 * vergleicht (Präzedenz: check:bpmn-example gegen die BPMN). Weicht eine Kopie ab, schlägt das Gate an.
 *
 * `procedureId` MUSS `leistung.config.id` entsprechen — der Client sendet ihn beim Einreichen.
 */
const MUSTER_ANTRAG: StatusMachineSource = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  requiredPermission: PREPARE,
  // Verwaltungsakt-Fachlichkeit — SPIEGEL von leistung.config.zustellung (der Server kann leistung.config
  // nicht importieren, rootDir-Mauer). Das Drift-Gate check:antrag-procedure sichert die Deckung.
  verwaltungsakt: {
    rechtsbehelf: {
      art: "widerspruch",
      fristWert: 1,
      fristEinheit: "monat",
      stelle: "der erlassenden Behörde",
      norm: "§ 70 Abs. 1 VwGO",
      sitz: "Rathausplatz 1, 12345 Musterstadt",
      form: "schriftlich, elektronisch oder zur Niederschrift",
    },
    fiktionTage: 4,
    fiktionNorm: "§ 41 Abs. 2 VwVfG",
  },
  // PFLICHTANGABEN DES VERWALTUNGSAKTS als DATEN-Bindung (Phase 5, W5). Der Renderer kann nur zeigen, was
  // der eingefrorene VA TRÄGT; hier steht, WOHER er es beim Erlass nimmt. Ohne diese Bindung nennt der
  // Bescheid keinen Inhaltsadressaten (§ 119 Abs. 1 AO — Nichtigkeitsrisiko) und kein Leistungsgebot
  // (§ 254 Abs. 1 AO — nicht vollstreckbar). Ein reales Verfahren ersetzt die Pfade durch seine Felder.
  verwaltungsaktInhalt: {
    adressatNamePfad: ["antragsteller.vorname", "antragsteller.nachname"],
    adressatAnschriftPfad: ["antragsteller.plz", "antragsteller.ort"],
    // Der Zahlbetrag ist der festgesetzte Tenor-Betrag; Fälligkeiten trägt dieses Demo-Verfahren nicht
    // (Sofortfälligkeit). Ein Verfahren mit Raten deklariert `faelligkeitenPfad` auf eine Liste
    // { datum, betrag } — MIT Jahreszahl, sonst ist die Fälligkeit unbestimmt.
    leistungsgebot: {
      betragPfad: "berechnung.betrag",
      waehrung: "EUR",
      zahlungsempfaenger: "Stadtkasse Musterstadt",
    },
    // § 119 Abs. 3 Satz 2 AO: Namenswiedergabe ODER ausdrücklicher Automations-Vermerk. Die Vorlage erlässt
    // maschinell — also der Vermerk, nicht ein erfundener Name.
    unterschrift: {
      maschinell: true,
      vermerk:
        "Dieser Bescheid wurde maschinell erstellt und ist ohne Unterschrift gültig.",
    },
    // RECHEN-HOHEIT: der Betrag im Bescheid wird gegen den Tarif des Verfahrens NACHGERECHNET, bevor er
    // eingefroren wird. Vorher trug der Tenor die im Browser des Antragstellers gerechnete Zahl, und
    // `tenorHerkunft` sagte das auch ehrlich — nur änderte die Ehrlichkeit nichts daran, dass die Behörde
    // einen Betrag festsetzte, den sie nicht selbst ermittelt hatte. Kein eigener Tarif hier: der
    // autoritative Satz steht bereits an `stelltForderung` und wird von dort gelesen (EINE Quelle).
    tenorNachrechnung: {
      diskriminator: "anliegen.kategorie",
      betragPfad: "berechnung.betrag",
    },
  },
  states: [
    { key: "eingegangen" },
    { key: "in_pruefung" },
    { key: "review_noetig" },
    // Wiederaufnehmbar-geschlossen (nicht terminal) — der Widerspruch öffnet den Fall wieder (ADR-0006).
    { key: "festgesetzt" },
    { key: "abgelehnt", terminal: true },
    { key: "widerspruch_in_pruefung" },
    { key: "abgeholfen", terminal: true },
    { key: "widerspruch_zurueckgewiesen", terminal: true },
    { key: "rueckforderung_festgesetzt" },
    { key: "erstattet", terminal: true },
    { key: "niedergeschlagen", terminal: true },
  ],
  transitions: [
    { from: "eingegangen", to: "in_pruefung", label: "In Prüfung nehmen" },
    { from: "in_pruefung", to: "review_noetig", label: "Zur Zweitprüfung" },
    {
      from: "in_pruefung",
      to: "festgesetzt",
      label: "Festsetzen",
      vierAugen: true,
      erlaesstBescheid: true,
      closesCase: true,
    },
    {
      from: "review_noetig",
      to: "festgesetzt",
      label: "Festsetzen (Zweitfreigabe)",
      vierAugen: true,
      erlaesstBescheid: true,
      closesCase: true,
    },
    { from: "in_pruefung", to: "abgelehnt", label: "Ablehnen" },
    // Widerspruchs-Verfahren (ADR-0006) — Spiegel von leistung.config, Drift-Gate check:antrag-procedure.
    {
      from: "festgesetzt",
      to: "widerspruch_in_pruefung",
      label: "Widerspruch bearbeiten",
    },
    {
      from: "widerspruch_in_pruefung",
      to: "abgeholfen",
      label: "Abhilfe",
      vierAugen: true,
    },
    {
      from: "widerspruch_in_pruefung",
      to: "widerspruch_zurueckgewiesen",
      label: "Widerspruch zurückweisen",
      vierAugen: true,
      // Widerspruchsbescheid = Verwaltungsakt mit EIGENEM Klage-Regime (ADR-0006 §3), Spiegel von leistung.config.
      erlaesstBescheid: true,
      verwaltungsakt: {
        rechtsbehelf: {
          art: "klage",
          fristWert: 1,
          fristEinheit: "monat",
          stelle: "dem zuständigen Verwaltungsgericht",
          norm: "§ 74 Abs. 1 VwGO",
          sitz: "Gerichtsstraße 1, 12345 Musterstadt",
          form: "schriftlich, in elektronischer Form oder zur Niederschrift des Urkundsbeamten der Geschäftsstelle",
        },
        fiktionTage: 4,
        fiktionNorm: "§ 41 Abs. 2 VwVfG",
      },
    },
    // Rückforderungs-Verfahren (ADR-0007) — Spiegel von leistung.config; stelltForderung MUSS deckungsgleich sein.
    {
      from: "festgesetzt",
      to: "rueckforderung_festgesetzt",
      label: "Rückforderung festsetzen",
      vierAugen: true,
      erlaesstBescheid: true,
      stelltForderung: {
        tarif: {
          positionen: [
            { kategorie: "standard", betragCent: 5000, label: "Standard" },
            { kategorie: "express", betragCent: 9000, label: "Express" },
            {
              kategorie: "gebuehrenfrei",
              betragCent: 0,
              label: "Gebührenfrei",
            },
          ],
          defaultCent: 0,
        },
        diskriminator: "anliegen.kategorie",
        zahlungsfristTage: 30,
      },
    },
    {
      from: "rueckforderung_festgesetzt",
      to: "erstattet",
      label: "Erstattung bestätigen",
      vierAugen: true,
    },
    {
      from: "rueckforderung_festgesetzt",
      to: "niedergeschlagen",
      label: "Forderung niederschlagen",
      vierAugen: true,
    },
  ],
};

// ── DIE EINE ANTRAGS-WAHRHEIT: DER EMITTIERTE LEISTUNGS-VERTRAG ──────────────────────────────────────────
// Der Server kann `src/leistung.config.ts` nicht importieren (rootDir-Mauer). Er kann aber ihren
// EMITTIERTEN Vertrag lesen: `apps/<app>/leistung.contract.json` liegt IM App-Verzeichnis und trägt `id`
// + die vollständige `statusMachine` (inkl. terminal/vierAugen/erlaesstBescheid/closesCase).
//
// WARUM DAS ZWINGEND IST (live gemessen): eine GENERIERTE App bekommt eine eigene `leistung.config.id`
// (z. B. "grundsteuer"), während diese Server-Datei die Muster-Kopie behielt ("musterantrag"). Der Client
// sendet `leistungConfig.id` — der Server kannte sie nicht und antwortete auf JEDEN Antrag mit 422
// „Dieser Antrag kann derzeit nicht angenommen werden". Der Bürgerpfad endete damit vor dem Amt.
// Mit dieser Ableitung ist der Drift STRUKTURELL unmöglich, nicht nur durch ein Gate bemerkt.
//
// FAIL-SAFE, nicht fail-open: fehlt/bricht der Vertrag, gilt unverändert die committete Muster-Maschine.
// Server-seitige Metadaten (version/effectiveFrom/Permission) bleiben Server-Sache — sie stehen nicht im
// Client-Vertrag und werden aus MUSTER_ANTRAG übernommen.
//
// DAS VA-REGIME IST SEIT W1 KEINE SERVER-SACHE MEHR (adversariales Fachaudit, Befund S1): welcher Rechtsbehelf
// gegen den Bescheid statthaft ist, ist eine FACHLICHE Aussage des Verfahrens, keine Server-Konfiguration. Sie
// stand in `leistung.config.zustellung`, reiste aber nicht im Vertrag mit — also erbte JEDES generierte
// Verfahren still das Muster-Regime der Vorlage (Widerspruch/§ 68 ff. VwGO/§ 41 Abs. 2 VwVfG). Für ein
// AO-Steuerverfahren ist das die falsche Verfahrensschiene; eine unrichtige Belehrung verlängert die
// Rechtsbehelfsfrist auf EIN JAHR (§ 356 Abs. 2 AO). Der Vertrag trägt `zustellung` jetzt (contract-snapshot),
// und diese Ableitung KONSUMIERT sie — EINE Wahrheit, transportiert.
const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Nur die vom Server gelesene Teilform des Vertrags-`zustellung`-Blocks (strukturell, ohne Kit-Import). */
interface VertragsZustellung {
  fiktionTage?: unknown;
  fiktionNorm?: unknown;
  rechtsbehelf?: {
    art?: unknown;
    fristWert?: unknown;
    fristEinheit?: unknown;
    stelle?: unknown;
    norm?: unknown;
    sitz?: unknown;
    form?: unknown;
  };
}

/**
 * Leitet das VA-Regime aus dem VERTRAG ab (nicht aus der Server-Kopie). Gibt `undefined` zurück, wenn der
 * Vertrag kein — oder ein strukturell unbrauchbares — Regime trägt: dann erlässt dieses Verfahren nach
 * Server-Sicht keinen förmlichen Bescheid, und der Erlass-Übergang wird fail-closed verweigert (cases.ts)
 * statt still mit dem Muster-Regime der Vorlage eingefroren.
 *
 * `sitz`/`form` reisen mit, WENN der Vertrag sie trägt — sie sind Pflicht-Slots der Belehrung
 * (§ 356 Abs. 1, § 357 Abs. 1 AO), aber im Typ optional, damit Bestands-Verfahren nicht bei der Ableitung
 * brechen. Die Vollständigkeit erzwingt der ERLASS (fail-closed), nicht diese reine Projektion.
 */
function verwaltungsaktAusVertrag(
  z: VertragsZustellung | undefined,
): NonNullable<StatusMachineSource["verwaltungsakt"]> | undefined {
  const rb = z?.rechtsbehelf;
  if (!rb) return undefined;
  const s = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : undefined;
  const art = s(rb.art);
  const fristEinheit = s(rb.fristEinheit);
  const stelle = s(rb.stelle);
  const norm = s(rb.norm);
  const fristWert =
    typeof rb.fristWert === "number" && Number.isFinite(rb.fristWert)
      ? rb.fristWert
      : undefined;
  if (art !== "widerspruch" && art !== "einspruch" && art !== "klage")
    return undefined;
  if (
    fristEinheit !== "monat" &&
    fristEinheit !== "woche" &&
    fristEinheit !== "tag"
  )
    return undefined;
  if (fristWert === undefined || !stelle || !norm) return undefined;
  const sitz = s(rb.sitz);
  const form = s(rb.form);
  return {
    rechtsbehelf: {
      art,
      fristWert,
      fristEinheit,
      stelle,
      norm,
      ...(sitz ? { sitz } : {}),
      ...(form ? { form } : {}),
    },
    fiktionTage:
      typeof z?.fiktionTage === "number" && Number.isFinite(z.fiktionTage)
        ? z.fiktionTage
        : 4,
    // KEIN VwVfG-Default mehr im AO-Fall: fehlt die Fiktionsnorm im Vertrag, bleibt sie LEER — der Erlass
    // scheitert dann fail-closed, statt eine Norm der FREMDEN Schiene in den Bescheid zu schreiben.
    fiktionNorm: s(z?.fiktionNorm) ?? "",
  };
}

interface VertragsStatusMaschine {
  states?: { key?: unknown; terminal?: unknown }[];
  transitions?: {
    from?: unknown;
    to?: unknown;
    label?: unknown;
    vierAugen?: unknown;
    erlaesstBescheid?: unknown;
    closesCase?: unknown;
    /** Eigenes VA-Regime bzw. Sollstellung NUR für diesen Übergang — reist 1:1 mit (sonst ginge
     *  die Rechtsbehelfs-Belehrung des Widerspruchsbescheids bzw. die Forderung still verloren). */
    verwaltungsakt?: unknown;
    stelltForderung?: unknown;
    guard?: unknown;
  }[];
}

/** DIE PFLICHTANGABEN DES VERWALTUNGSAKTS AUS DEM VERTRAG — und, wo er schweigt, LIEBER KEINE.
 *
 * ── GEMESSEN 2026-08-31 an zwei fertig gebauten Verfahren ────────────────────────────────────────────────
 * `antragQuelleAusVertrag` spreizt `...basisOhneRegime` und erbte damit `verwaltungsaktInhalt` WOERTLICH aus
 * `MUSTER_ANTRAG` — samt der Demo-Datenpfade (`antragsteller.vorname`, die es im erzeugten Verfahren nicht
 * gibt) und samt `zahlungsempfaenger: "Stadtkasse Musterstadt"`. Der Bescheid der Gemeinde Musterhausen
 * forderte also zur Zahlung an die Kasse einer FREMDEN Kommune, und der Inhaltsadressat blieb leer, weil die
 * geerbten Pfade auf Felder zeigen, die dieses Verfahren nicht fuehrt (§ 119 Abs. 1 AO · § 254 Abs. 1 AO).
 *
 * Das ist exakt die Klasse, die diese Datei fuer `verwaltungsakt` bereits geloest hat, mit ihrer eigenen
 * Begruendung: «lieber gar kein Bescheid (fail-closed am Erlass) als ein Bescheid mit der Belehrung eines
 * fremden Verfahrens». Fuer die Pflichtangaben gilt dasselbe Wort fuer Wort.
 *
 * ABGELEITET WIRD NUR, WAS DER VERTRAG WIRKLICH SAGT:
 *   `zahlungsempfaenger`  aus `kommune` — die erlassende Behoerde IST die Kasse; das ist keine Vermutung.
 *   alles Uebrige         nur, wenn der Vertrag es unter `verwaltungsaktInhalt` DEKLARIERT.
 * Schweigt er, wird der Block ENTFERNT statt geerbt. Ein leeres Feld ist ein sichtbarer Mangel; ein Feld mit
 * dem Wert eines fremden Verfahrens ist eine stille Falschaussage. */
function verwaltungsaktInhaltAusVertrag(roh: {
  kommune?: unknown;
  verwaltungsaktInhalt?: unknown;
}): StatusMachineSource["verwaltungsaktInhalt"] | undefined {
  const deklariert =
    roh.verwaltungsaktInhalt && typeof roh.verwaltungsaktInhalt === "object"
      ? (roh.verwaltungsaktInhalt as NonNullable<
          StatusMachineSource["verwaltungsaktInhalt"]
        >)
      : undefined;
  const kommune =
    typeof roh.kommune === "string" && roh.kommune.trim()
      ? roh.kommune.trim()
      : undefined;
  if (!deklariert && !kommune) return undefined;
  const basis =
    deklariert ??
    ({} as NonNullable<StatusMachineSource["verwaltungsaktInhalt"]>);
  // Der Zahlungsempfaenger folgt der erlassenden Behoerde, es sei denn der Vertrag nennt ausdruecklich einen
  // anderen (Kassenzeichen einer gemeinsamen Kasse) — deklariert schlaegt abgeleitet.
  const lg = basis.leistungsgebot;
  const leistungsgebot =
    lg && typeof lg === "object"
      ? {
          ...lg,
          ...(lg.zahlungsempfaenger || !kommune
            ? {}
            : { zahlungsempfaenger: kommune }),
        }
      : undefined;
  const raus = {
    ...basis,
    ...(leistungsgebot ? { leistungsgebot } : {}),
  };
  return Object.keys(raus).length > 0 ? raus : undefined;
}

function antragQuelleAusVertrag(): StatusMachineSource | null {
  try {
    const roh = JSON.parse(
      fs.readFileSync(path.join(APP_DIR, "leistung.contract.json"), "utf8"),
    ) as {
      id?: unknown;
      kommune?: unknown;
      verwaltungsaktInhalt?: unknown;
      rechtsgrundlagen?: { norm?: unknown }[];
      statusMachine?: VertragsStatusMaschine;
      zustellung?: VertragsZustellung;
    };
    const id = typeof roh.id === "string" ? roh.id.trim() : "";
    const sm = roh.statusMachine;
    if (!id || !Array.isArray(sm?.states) || !Array.isArray(sm.transitions)) {
      return null;
    }
    const states = sm.states
      .filter((z) => typeof z.key === "string" && z.key.length > 0)
      .map((z) => ({
        key: String(z.key),
        ...(z.terminal === true ? { terminal: true as const } : {}),
      }));
    const transitions = sm.transitions
      .filter(
        (u) =>
          typeof u.from === "string" &&
          typeof u.to === "string" &&
          typeof u.label === "string",
      )
      .map((u) => ({
        from: String(u.from),
        to: String(u.to),
        label: String(u.label),
        ...(u.vierAugen === true ? { vierAugen: true as const } : {}),
        ...(u.erlaesstBescheid === true
          ? { erlaesstBescheid: true as const }
          : {}),
        ...(u.closesCase === true ? { closesCase: true as const } : {}),
        ...(u.verwaltungsakt
          ? {
              verwaltungsakt: u.verwaltungsakt as NonNullable<
                StatusMachineTransitionSource["verwaltungsakt"]
              >,
            }
          : {}),
        ...(u.stelltForderung
          ? {
              stelltForderung: u.stelltForderung as NonNullable<
                StatusMachineTransitionSource["stelltForderung"]
              >,
            }
          : {}),
        ...(u.guard
          ? {
              guard: u.guard as NonNullable<
                StatusMachineTransitionSource["guard"]
              >,
            }
          : {}),
      }));
    if (states.length === 0 || transitions.length === 0) return null;
    const legalBasisIds = (roh.rechtsgrundlagen ?? [])
      .map((r) => (typeof r.norm === "string" ? r.norm : ""))
      .filter((n) => n.length > 0);
    // W1 — DAS REGIME KOMMT AUS DEM VERTRAG, nicht aus MUSTER_ANTRAG. Trägt der Vertrag KEIN (brauchbares)
    // Regime, wird `verwaltungsakt` bewusst ENTFERNT statt geerbt: lieber gar kein Bescheid (fail-closed am
    // Erlass) als ein Bescheid mit der Belehrung eines fremden Verfahrens.
    const verwaltungsakt = verwaltungsaktAusVertrag(roh.zustellung);
    const verwaltungsaktInhalt = verwaltungsaktInhaltAusVertrag(roh);
    // DIE PFLICHTANGABEN WERDEN EBENSO WENIG GEERBT WIE DAS REGIME — s. `verwaltungsaktInhaltAusVertrag`.
    const {
      verwaltungsakt: _musterRegime,
      verwaltungsaktInhalt: _musterInhalt,
      ...basisOhneRegime
    } = MUSTER_ANTRAG;
    return {
      ...basisOhneRegime,
      procedureId: id,
      ...(legalBasisIds.length > 0 ? { legalBasisIds } : {}),
      ...(verwaltungsakt ? { verwaltungsakt } : {}),
      ...(verwaltungsaktInhalt ? { verwaltungsaktInhalt } : {}),
      states,
      transitions,
    };
  } catch {
    return null; // kein Vertrag lesbar → committete Muster-Maschine (unverändertes Verhalten)
  }
}

export const antragProcedure: ProcedureVersion =
  statusMachineToProcedureVersion(antragQuelleAusVertrag() ?? MUSTER_ANTRAG);

/** Ein Ziel des Demo-Dossiers: Titel, optionale Frist/Kategorie/Status + Checklisten-Schritte. */
export interface DossierDemoZiel {
  id: string;
  titel: string;
  faelligAm?: string;
  kategorie?: string;
  status?: string;
  schritte: { id: string; titel: string; erledigt: boolean }[];
}

/** Die synthetischen Inhalte des Preview-Demo-Dossiers (nur In-Memory/DEV). Keine echten Personen/PII. */
export interface DossierDemo {
  caseId: string;
  subjectId: string;
  /** Startzustand des Demo-Falls — muss in `dossierProcedure.allowedStates` liegen. */
  initialState: string;
  openedAt: string;
  openedSummary: string;
  ziele: DossierDemoZiel[];
  termine: { id: string; titel: string; faelligAm: string }[];
}

/**
 * Neutrales Demo-Dossier für die Preview (APP_STORE_MODE=memory). Der Fall startet in „in-bearbeitung", damit
 * ein:e Prüfer:in die Übergänge — inkl. des Vier-Augen-Abschlusses — an der laufenden Akte ausprobieren kann.
 * Alles synthetisch. Wird von der Generierung zusammen mit `dossierProcedure` überschrieben (oder weggelassen).
 */
export const dossierDemo: DossierDemo = {
  caseId: "case.demo-0001",
  subjectId: "subject.1",
  initialState: "in-bearbeitung",
  openedAt: "2026-06-01T08:00:00.000Z",
  openedSummary: "Muster-Fall FALL-2026-0001 eröffnet (musterverfahren)",
  ziele: [
    {
      id: "ziel.1",
      titel: "Erstes Ziel bearbeiten",
      faelligAm: "2026-09-30T00:00:00.000Z",
      kategorie: "muster-handlungsfeld-a",
      status: "laufend",
      schritte: [
        { id: "s.1", titel: "Erster Schritt", erledigt: true },
        { id: "s.2", titel: "Zweiter Schritt", erledigt: true },
        { id: "s.3", titel: "Dritter Schritt", erledigt: false },
        { id: "s.4", titel: "Vierter Schritt", erledigt: false },
      ],
    },
    {
      id: "ziel.2",
      titel: "Zweites Ziel bearbeiten",
      kategorie: "muster-handlungsfeld-b",
      status: "neu",
      schritte: [{ id: "s.5", titel: "Erster Schritt", erledigt: false }],
    },
  ],
  termine: [
    {
      id: "t.1",
      titel: "Gesprächstermin",
      faelligAm: "2026-07-20T10:00:00.000Z",
    },
    {
      id: "t.2",
      titel: "Nachweis vorlegen",
      faelligAm: "2026-07-05T00:00:00.000Z",
    },
  ],
};
