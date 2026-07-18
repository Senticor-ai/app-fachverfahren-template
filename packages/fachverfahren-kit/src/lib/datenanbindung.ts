// fachverfahren-kit/lib/datenanbindung — reine KONSUMENTEN der generischen, sicheren Datenanbindungs-Naht
// (`config.datenanbindung`). Verallgemeinert das verstreute `register`/`registerRefs`/`fimRefs`/`nachweise` zu EINER
// zweckgebundenen, sicherheits-klassifizierten Sicht (art: register|intern|extern). Rein/defensiv/netzfrei — UI, BFF und
// das Build-Gate lesen DASSELBE hier. Spiegelt das Muster von `effektiveNachweise` (lib/interpreter.ts).
import type { Datenanbindung, LeistungConfig } from "../types.js";

const ARTEN = ["register", "intern", "extern"] as const;
export type DatenanbindungArt = (typeof ARTEN)[number];

/** Die EFFEKTIVEN Datenanbindungen (defensiv: fehlt/kein Array → []; Einträge ohne `quelle` verworfen). */
export function datenanbindungen(
  config: Pick<LeistungConfig, "datenanbindung">,
): Datenanbindung[] {
  const list = config?.datenanbindung;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (d): d is Datenanbindung =>
      !!d && typeof d.quelle === "string" && d.quelle.trim().length > 0,
  );
}

/** Nach `art` gruppiert — die drei Ausprägungen der sicheren Datenanbindung (Register · interne Systeme · externe
 *  Dienste). Immer alle drei Schlüssel (leere Liste, wenn keine Anbindung dieser Art). */
export function datenanbindungenByArt(
  config: Pick<LeistungConfig, "datenanbindung">,
): Record<DatenanbindungArt, Datenanbindung[]> {
  const out: Record<DatenanbindungArt, Datenanbindung[]> = {
    register: [],
    intern: [],
    extern: [],
  };
  for (const d of datenanbindungen(config)) {
    if ((ARTEN as readonly string[]).includes(d.art)) out[d.art].push(d);
  }
  return out;
}

/** Ein Mangel an einer Datenanbindung. */
export interface DatenanbindungMangel {
  quelle: string;
  feld: "zweck" | "verbindungsklasse";
  text: string;
}

/** Verdikt der Datenanbindungs-Prüfung. */
export interface DatenanbindungVerdikt {
  ok: boolean;
  mangel: DatenanbindungMangel[];
}

/**
 * verifyDatenanbindung — DSGVO/BSI-Mindestprüfung je Anbindung (rein, defensiv):
 *   • `zweck` ist PFLICHT (Zweckbindung, Art. 5 Abs. 1 lit. b DSGVO) — leer/fehlend = Mangel.
 *   • `verbindungsklasse` (BSI TR-03190) ist PFLICHT für art=register|extern (die Anbindung überschreitet eine
 *     Vertrauensgrenze); für art=intern optional.
 * Fehlt `config.datenanbindung` ganz → keine Anbindung → ok (KEIN Falsch-Block über bestehende Configs). UI und
 * Build-Gate lesen dasselbe Verdikt.
 */
export function verifyDatenanbindung(
  config: Pick<LeistungConfig, "datenanbindung">,
): DatenanbindungVerdikt {
  const mangel: DatenanbindungMangel[] = [];
  for (const d of datenanbindungen(config)) {
    if (typeof d.zweck !== "string" || !d.zweck.trim()) {
      mangel.push({
        quelle: d.quelle,
        feld: "zweck",
        text: `Datenanbindung „${d.quelle}": zweck ist Pflicht (Zweckbindung, Art. 5 DSGVO).`,
      });
    }
    if (
      (d.art === "register" || d.art === "extern") &&
      d.verbindungsklasse == null
    ) {
      mangel.push({
        quelle: d.quelle,
        feld: "verbindungsklasse",
        text: `Datenanbindung „${d.quelle}" (${d.art}): verbindungsklasse (BSI TR-03190) ist Pflicht — die Anbindung überschreitet eine Vertrauensgrenze.`,
      });
    }
  }
  return { ok: mangel.length === 0, mangel };
}
