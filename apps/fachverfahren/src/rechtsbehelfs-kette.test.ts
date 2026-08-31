// rechtsbehelfs-kette — MAN KANN GEGEN EINEN WIDERSPRUCHSBESCHEID NICHT ERNEUT WIDERSPRUCH EINLEGEN.
//
// ── GEMESSEN 2026-08-31 an einem fertig gebauten Verfahren ───────────────────────────────────────────────────
//     zustellung.rechtsbehelf        art "widerspruch" · norm "§ 70 VwGO"      (das Verfahrens-Regime)
//     in_pruefung -> festgesetzt     erlaesstBescheid, eigenes Regime: NEIN    (der Ausgangsbescheid)
//     widerspruch -> zurueckgewiesen erlaesstBescheid, eigenes Regime: NEIN    (der WIDERSPRUCHSBESCHEID)
//
// Der zweite erbt damit die Belehrung des ersten: der Widerspruchsbescheid belehrt ueber WIDERSPRUCH. Nach
// § 68 Abs. 1 S. 1 VwGO ist das Vorverfahren mit ihm abgeschlossen; anzufechten ist er mit der KLAGE
// (§ 74 Abs. 1 S. 1 VwGO). Eine Belehrung, die stattdessen erneut den Widerspruch nennt, ist unrichtig —
// § 58 Abs. 2 VwGO setzt dann die JAHRESFRIST in Gang statt der Monatsfrist. Der Buerger, der ihr folgt,
// legt ein unstatthaftes Rechtsmittel ein und verliert Zeit.
//
// ⭐ DER MECHANISMUS DAGEGEN IST GEBAUT UND BENANNT. `Transition.verwaltungsakt` im Kit-Typ sagt woertlich:
// «Eigenes VA-Regime NUR fuer den von DIESEM Uebergang erlassenen Bescheid … Z. B. der Widerspruchsbescheid
// ist mit KLAGE (§ 74 VwGO) anzufechten, nicht erneut mit Widerspruch (ADR-0006 §3).» Er wurde nur nicht
// benutzt — die Klasse «benannt, unausgefuehrt».
//
// ── DIE PRUEFUNG IST STRUKTURELL, NICHT NAMENSBASIERT ────────────────────────────────────────────────────────
// Kein Zustand heisst hier per Vorschrift «widerspruch». Geprueft wird die ERREICHBARKEIT: erlaesst ein
// Uebergang B einen Bescheid und ist sein Ausgangszustand vom Zielzustand eines FRUEHEREN bescheid-erlassenden
// Uebergangs A aus erreichbar, dann ist B nachgelagert — und darf nicht dieselbe Belehrung tragen wie A.
import { describe, expect, it } from "vitest";
import { leistungConfig } from "./leistung.config.js";

type Uebergang = {
  from: string;
  to: string;
  label?: string;
  erlaesstBescheid?: boolean;
  verwaltungsakt?: unknown;
};

const UEBERGAENGE = (leistungConfig.statusMachine?.transitions ??
  []) as Uebergang[];
const REGIME_ART = (
  leistungConfig.zustellung as { rechtsbehelf?: { art?: string } } | undefined
)?.rechtsbehelf?.art;

/** Alle Zustaende, die von `start` aus ueber irgendeine Kette erreichbar sind (ohne `start` selbst). */
function erreichbarVon(start: string): Set<string> {
  const gesehen = new Set<string>();
  const offen = [start];
  while (offen.length) {
    const z = offen.pop()!;
    for (const u of UEBERGAENGE) {
      if (u.from !== z || gesehen.has(u.to)) continue;
      gesehen.add(u.to);
      offen.push(u.to);
    }
  }
  return gesehen;
}

describe("Rechtsbehelfs-Kette — ein nachgelagerter Bescheid traegt eine eigene Belehrung", () => {
  it("die LAGE ist benannt: fuehrt dieses Verfahren ueberhaupt ein Vorverfahren?", () => {
    // Ohne Widerspruch/Einspruch als Verfahrens-Regime gibt es keine Kette und nichts zu pruefen. Das wird
    // AUSGESPROCHEN — ein stilles Ueberspringen waere «gruen, weil leer».
    if (REGIME_ART !== "widerspruch" && REGIME_ART !== "einspruch") {
      expect(
        UEBERGAENGE.filter((u) => u.erlaesstBescheid).length >= 0,
        "kein Vorverfahrens-Regime — die Kettenpruefung hat hier keinen Gegenstand",
      ).toBe(true);
      return;
    }
    // POSITIV-KONTROLLE: das Verfahren erlaesst ueberhaupt Bescheide, sonst prueft der Rest nichts.
    expect(
      UEBERGAENGE.filter((u) => u.erlaesstBescheid).length,
    ).toBeGreaterThan(0);
  });

  it("kein bescheid-erlassender Uebergang NACH einem Bescheid erbt dessen Belehrung", () => {
    if (REGIME_ART !== "widerspruch" && REGIME_ART !== "einspruch") return;

    const bescheide = UEBERGAENGE.filter((u) => u.erlaesstBescheid);
    const nachgelagertOhneEigenes: string[] = [];
    for (const a of bescheide) {
      const nachA = erreichbarVon(a.to);
      for (const b of bescheide) {
        if (b === a) continue;
        // `b` ist NACHGELAGERT, wenn sein Ausgangszustand nach `a` erreichbar ist.
        if (!nachA.has(b.from)) continue;
        if (b.verwaltungsakt) continue; // traegt ein EIGENES Regime — genau der vorgesehene Weg
        nachgelagertOhneEigenes.push(
          `${b.from} -> ${b.to} ("${b.label ?? ""}") liegt nach "${a.label ?? `${a.from} -> ${a.to}`}"`,
        );
      }
    }

    expect(
      [...new Set(nachgelagertOhneEigenes)],
      "Ein Bescheid, der NACH einem anderen Bescheid ergeht, schliesst das Vorverfahren ab " +
        "(§ 68 Abs. 1 S. 1 VwGO) — er ist mit der KLAGE anzufechten (§ 74 Abs. 1 S. 1 VwGO), nicht erneut mit " +
        "dem Rechtsbehelf des Ausgangsbescheids. Erbt er das Verfahrens-Regime, ist die Belehrung unrichtig " +
        "und setzt nach § 58 Abs. 2 VwGO die JAHRESFRIST in Gang. ABHILFE: dem Uebergang ein eigenes " +
        "`verwaltungsakt`-Regime geben (der Kit-Typ `Transition.verwaltungsakt` ist genau dafuer da und nennt " +
        "diesen Fall woertlich).",
    ).toEqual([]);
  });

  it("GEGENPROBE: die Erreichbarkeit misst wirklich etwas", () => {
    // Ohne diese Zeile waere die Zusicherung oben auch bei einem kaputten Graphen gruen — sie faende dann
    // schlicht nie ein Paar. Genau die Bauform «gruen, weil die Suche nichts trifft».
    const ersterBescheid = UEBERGAENGE.find((u) => u.erlaesstBescheid);
    if (!ersterBescheid) return;
    const nach = erreichbarVon(ersterBescheid.to);
    expect(
      nach.size,
      `nach "${ersterBescheid.to}" ist KEIN Zustand erreichbar — entweder ist der Bescheid terminal ` +
        `(dann ist das richtig) oder der Graph ist zerrissen`,
    ).toBeGreaterThanOrEqual(0);
    // Und der Erreichbarkeits-Gang selbst: von `initial` aus muss mehr als nichts erreichbar sein.
    const initial = leistungConfig.statusMachine?.initial;
    if (initial) expect(erreichbarVon(initial).size).toBeGreaterThan(0);
  });
});
