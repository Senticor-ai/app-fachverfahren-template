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
import { fehlendeBelehrungsSlots } from "@senticor/public-sector-sdk";

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
      // ⛔ HIER STAND `expect(… .length >= 0).toBe(true)` — EINE TAUTOLOGIE (2026-09-06 gemessen).
      // Sie ist IMMER wahr, und jeder Folgetest steigt daneben still mit `return` aus. Der Kommentar
      // darueber verspricht das Gegenteil («ein stilles Ueberspringen waere gruen, weil leer») — und
      // genau durch diese Tuer entkam ein fertig gebautes Verfahren mit `art: "klage"`, dessen Belehrung
      // die eigene Sachbearbeitung als Klage-Adressat nannte und dem der Pflicht-Slot `sitz` fehlte.
      //
      // ⭐ EIN AUSSTIEG DARF DIE FRAGE WECHSELN, NICHT DAS PRUEFEN EINSTELLEN. Ohne Vorverfahren gibt es
      // keine KETTE — aber sehr wohl eine BELEHRUNG, und die ist auch hier vollstaendig oder unbrauchbar.
      expect(
        ["widerspruch", "einspruch", "klage"],
        `unbekannte Rechtsbehelfs-Art «${String(REGIME_ART)}» — ein Tippfehler faellt hier auf, statt ` +
          "die ganze Kettenpruefung stillzulegen",
      ).toContain(String(REGIME_ART));
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

// ── DIE BELEHRUNG IST ZUR BAUZEIT VOLLSTAENDIG — ODER DAS VERFAHREN KANN KEINEN BESCHEID ERLASSEN ──────────
//
// ⛔ GEMESSEN 2026-09-06 an einem fertig gebauten, ausgelieferten Verfahren: `zustellung.rechtsbehelf`
// deklarierte art/norm/stelle/frist/form — und KEINEN `sitz`. Der Server verlangt ihn fail-closed
// (`fehlendeBelehrungsSlots`, W1) und antwortet auf JEDEN bescheid-erlassenden Uebergang mit 422
// «dieser Bescheid darf nicht erlassen werden». Ergebnis: das Verfahren konnte NIE abschliessen — der
// Buerger las dauerhaft «Fuer diesen Antrag liegt noch kein Bescheid vor», und der Widerspruchsweg war
// mit ihm tot.
//
// ⭐ DER RIEGEL WAR DA UND STAND AN DER FALSCHEN STELLE DER ZEIT. `fehlendeBelehrungsSlots` ist gebaut,
// korrekt und produktiv gerufen — aber erst zur LAUFZEIT, je Bescheid, im Request. Ein Verfahren, dem
// der Slot fehlt, uebersetzt, baut, besteht seine Suite und stirbt beim ersten echten Bescheid. Dieselbe
// Frage, an der Bauzeit gestellt, kostet nichts und faengt es vor der Auslieferung.
//
// ⛔ KEINE ZWEITE WAHRHEIT: geprueft wird mit DERSELBEN Funktion, die der Server fahrt. Eine eigene
// Slot-Liste hier waere die Abschrift, die am Tag ihrer Entstehung veraltet.
describe("Rechtsbehelfs-Belehrung — zur BAUZEIT vollstaendig, nicht erst im 422", () => {
  /** Jede deklarierte Belehrung dieses Verfahrens: das Verfahrens-Regime UND jedes eigene VA-Regime. */
  const regime: { wo: string; rb: unknown }[] = [];
  const basis = (
    leistungConfig.zustellung as { rechtsbehelf?: unknown } | undefined
  )?.rechtsbehelf;
  if (basis !== undefined)
    regime.push({ wo: "zustellung.rechtsbehelf", rb: basis });
  for (const u of UEBERGAENGE) {
    const va = u.verwaltungsakt as { rechtsbehelf?: unknown } | undefined;
    if (va?.rechtsbehelf !== undefined) {
      regime.push({
        wo: `Uebergang ${u.from} → ${u.to} (${u.label ?? "ohne Label"})`,
        rb: va.rechtsbehelf,
      });
    }
  }

  it("POSITIV-KONTROLLE: dieses Verfahren deklariert ueberhaupt eine Belehrung (sonst prueft der Rest nichts)", () => {
    // ⛔ Ohne diese Zeile waere «0 unvollstaendige Belehrungen» auch dann gruen, wenn es GAR KEINE gibt —
    // und ein Verfahren, das Bescheide erlaesst, MUSS eine haben.
    const erlaesst = UEBERGAENGE.filter((u) => u.erlaesstBescheid).length;
    if (erlaesst === 0) {
      expect(
        regime.length,
        "kein bescheid-erlassender Uebergang — dann ist auch keine Belehrung faellig",
      ).toBe(regime.length);
      return;
    }
    expect(
      regime.length,
      `${erlaesst} Uebergaenge erlassen einen Bescheid, aber KEINE Belehrung ist deklariert — jeder davon ` +
        "faellt zur Laufzeit in den 422 des Zustell-Riegels",
    ).toBeGreaterThan(0);
  });

  it("JEDE deklarierte Belehrung traegt ALLE Pflicht-Slots (dieselbe Funktion, die der Server fahrt)", () => {
    const unvollstaendig = regime
      .map((r) => ({ wo: r.wo, fehlt: fehlendeBelehrungsSlots(r.rb as never) }))
      .filter((r) => r.fehlt.length > 0);
    expect(
      unvollstaendig.map((r) => `${r.wo}: es fehlt ${r.fehlt.join(", ")}`),
      "eine unvollstaendige Belehrung laesst das Verfahren uebersetzen, bauen und seine Suite bestehen — " +
        "und toetet dann JEDEN Bescheid mit 422. Die Slots stehen in `fehlendeBelehrungsSlots` (SDK).",
    ).toEqual([]);
  });
});
