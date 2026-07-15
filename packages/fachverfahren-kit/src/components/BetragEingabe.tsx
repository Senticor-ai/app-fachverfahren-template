// fachverfahren-kit/components/BetragEingabe — barrierefreies WÄHRUNGS-Eingabefeld (de-DE).
//
// Schließt die EINGABE-Seite zu `formatBetrag` (Ausgabe): der/die Bürger:in tippt einen Betrag in gewohnter
// deutscher Schreibweise („1.234,56"), beim Verlassen des Feldes (Blur) parst `parseBetrag` ihn zur kanonischen
// Zahl in Euro (NICHT Cent) und meldet sie über `onWert` nach oben. Ist die Eingabe ungültig, erscheint die
// Feldfehler-Meldung (FormMessage, gleiche Größe wie das Label, Signal über Farbe + Icon + Text, role="alert");
// ist sie gültig, zeigt eine dezente Vorschau den formatierten Betrag. Vollständig token-getrieben (light/dark/
// high-contrast), Ziel-/Fokusgrößen über die Kit-Primitives (Input/FormLabel). Kein Netz, keine Domänen-Literale.
import * as React from "react";

import { formatBetrag } from "../format.js";
import { parseBetrag } from "../lib/eingabe.js";
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from "../ui/form-field.js";
import { Input } from "../ui/input.js";

/** Anzeige-Symbol je ISO-4217-Code (Fallback: der Code selbst). Deckt die von `formatBetrag` unterstützten ab. */
const WAEHRUNG_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
};
/** Sprech-Name je Code für die Screenreader-Ansage (Fallback: der Code selbst). */
const WAEHRUNG_NAME: Record<string, string> = {
  EUR: "Euro",
  USD: "US-Dollar",
  GBP: "Britische Pfund",
  CHF: "Schweizer Franken",
};

/** Eine Zahl als bearbeitbarer de-DE-Text (ohne Währung) für die Anzeige im Feld — z. B. 1234.56 → „1.234,56". */
function zahlAlsText(n: number): string {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}

export interface BetragEingabeProps {
  /** Feldpfad/-name — wird zur id des Controls (für Anker aus einer Fehlerzusammenfassung: `#name`). */
  name: string;
  /** Bürger-Beschriftung (einfache Sprache). */
  label: string;
  /** Kanonischer Wert in der Haupteinheit (Euro), oder `null`, wenn nichts/Ungültiges vorliegt. */
  wert: number | null;
  /** Meldet den geparsten Wert beim Blur (Zahl in Euro oder `null` bei ungültiger/leerer Eingabe). */
  onWert: (wert: number | null) => void;
  /** ISO-4217-Währungscode (Default „EUR"). */
  waehrung?: string;
  /** Pflichtangabe (Sternchen + aria-required + Pflicht-Meldung bei leerem Feld). */
  pflicht?: boolean;
  /** Optionaler Hilfetext unter dem Feld. */
  hilfetext?: string;
  /** Von außen vorgegebener Fehler (z. B. aus `validiereAlle` nach dem Absenden) — hat Vorrang und zeigt sofort. */
  fehler?: string;
}

/**
 * Währungs-Eingabefeld: tippt frei (de-DE), parst beim Blur via `parseBetrag`, zeigt Fehler ODER die formatierte
 * Vorschau. Der `wert` (Zahl|null) ist die kanonische Wahrheit von außen; der Text im Feld ist lokaler Zustand,
 * damit die Eingabe während des Tippens nicht umformatiert wird. Eine externe Änderung von `wert` (z. B. eine
 * KI-Übernahme) wird übernommen.
 */
export function BetragEingabe({
  name,
  label,
  wert,
  onWert,
  waehrung,
  pflicht = false,
  hilfetext,
  fehler,
}: BetragEingabeProps) {
  const code = waehrung ?? "EUR";
  const symbol = WAEHRUNG_SYMBOL[code] ?? code;
  const waehrungName = WAEHRUNG_NAME[code] ?? code;

  const [text, setText] = React.useState<string>(() =>
    wert === null ? "" : zahlAlsText(wert),
  );
  const [beruehrt, setBeruehrt] = React.useState(false);

  // Externe Änderung von `wert` übernehmen, wenn sie vom aktuell getippten Text abweicht (kein Clobbern beim Tippen,
  // da `wert` erst beim Blur über `onWert` aktualisiert wird — dann stimmt der geparste Text bereits überein). Die
  // Abhängigkeit ist bewusst NUR `wert`: der Effekt reagiert allein auf externe Wert-Setzungen, nicht auf Tippen.
  const letzterWert = React.useRef(wert);
  React.useEffect(() => {
    if (wert !== letzterWert.current) {
      letzterWert.current = wert;
      if (wert !== parseBetrag(text)) {
        setText(wert === null ? "" : zahlAlsText(wert));
      }
    }
  }, [wert, text]);

  const geparst = parseBetrag(text);
  const leer = text.trim() === "";
  // Lokaler Fehler (erst nach dem ersten Blur sichtbar); ein externer `fehler` hat Vorrang und zeigt sofort.
  const lokalerFehler = leer
    ? pflicht
      ? "Pflichtfeld."
      : null
    : geparst === null
      ? // 3.3.3 — die Meldung nennt einen KONKRETEN Korrekturvorschlag (de-DE-Format), nicht nur „ungültig".
        "Bitte einen gültigen Betrag eingeben, z. B. 1.234,56."
      : null;
  const sichtbarerFehler = fehler ?? (beruehrt ? lokalerFehler : null);
  const invalid = sichtbarerFehler != null;

  return (
    <FormField id={name} invalid={invalid}>
      <FormLabel required={pflicht}>
        {label}
        {/* Die Währung wird über den zugänglichen Namen angesagt; sichtbar trägt sie das Suffix im Feld. */}
        <span className="sr-only"> (Angabe in {waehrungName})</span>
      </FormLabel>

      <div className="relative">
        <FormControl>
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              setBeruehrt(true);
              onWert(parseBetrag(text));
            }}
            aria-required={pflicht || undefined}
            className="pr-9"
          />
        </FormControl>
        {/* Sichtbares Währungs-Suffix (dekorativ — die Bedeutung trägt der zugängliche Name oben). */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
        >
          {symbol}
        </span>
      </div>

      {hilfetext ? <FormDescription>{hilfetext}</FormDescription> : null}

      {!invalid && geparst !== null ? (
        <p className="fv-enter text-sm text-muted-foreground">
          {formatBetrag(geparst, code)}
        </p>
      ) : null}

      <FormMessage>{sichtbarerFehler ?? undefined}</FormMessage>
    </FormField>
  );
}
