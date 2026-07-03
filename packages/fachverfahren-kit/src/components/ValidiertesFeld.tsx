// fachverfahren-kit/components/ValidiertesFeld — dünner, generischer Wrapper für ein DATEN-validiertes Textfeld.
//
// Nimmt eine `EingabeRegel` (als DATEN) + einen Wert und prüft ihn beim Verlassen des Feldes (Blur) über den
// reinen `validiereFeld` — für Text, Zahl, IBAN und Datum. Der Fehler wird barrierefrei über das Feld-Fundament
// (FormField/FormLabel/FormControl/FormMessage) angezeigt: Label↔Control korrekt verdrahtet, aria-invalid,
// role="alert", Signal über Farbe + Icon + Text (nie über die Feldgröße). Bewusst schlank: die fachliche
// Entscheidung liegt in `lib/eingabe`, hier ist nur die a11y-Verdrahtung. Kein Netz, keine Domänen-Literale.
import * as React from "react";

import { validiereFeld, type EingabeRegel } from "../lib/eingabe.js";
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from "../ui/form-field.js";
import { Input } from "../ui/input.js";

export interface ValidiertesFeldProps {
  /** Feldpfad/-name — wird zur id des Controls (für Anker aus einer Fehlerzusammenfassung: `#name`). */
  name: string;
  /** Bürger-Beschriftung (einfache Sprache). */
  label: string;
  /** Die Validierungs-Regel als DATEN (typ/pflicht/min/max/laenge/muster/eigeneMeldung). */
  regel: EingabeRegel;
  /** Aktueller Textwert (kontrolliert). */
  wert: string;
  /** Meldet jede Änderung des Textwerts nach oben. */
  onWert: (wert: string) => void;
  /** Optionaler Hilfetext unter dem Feld. */
  hilfetext?: string;
}

/** Passende Tastatur-/Eingabehilfe je Regeltyp (Dezimal-Tastatur für Betrag/Zahl, sonst Standard-Text). */
function inputModeFuer(typ: EingabeRegel["typ"]): "decimal" | "text" {
  return typ === "betrag" || typ === "zahl" ? "decimal" : "text";
}

/**
 * Ein Textfeld, das seinen Wert gegen eine `EingabeRegel` prüft. Der Fehler erscheint nach dem ersten Blur und
 * aktualisiert sich danach live beim Tippen (Standard-Muster „validate on blur, dann live"). Eine leere, nicht
 * pflichtige Eingabe ist gültig.
 */
export function ValidiertesFeld({
  name,
  label,
  regel,
  wert,
  onWert,
  hilfetext,
}: ValidiertesFeldProps) {
  const [beruehrt, setBeruehrt] = React.useState(false);

  const pruefung = validiereFeld(regel, wert);
  const fehler = beruehrt && !pruefung.ok ? pruefung.fehler : undefined;
  const invalid = fehler !== undefined;

  return (
    <FormField id={name} invalid={invalid}>
      <FormLabel required={regel.pflicht ?? false}>{label}</FormLabel>
      <FormControl>
        <Input
          inputMode={inputModeFuer(regel.typ)}
          value={wert}
          onChange={(e) => onWert(e.target.value)}
          onBlur={() => setBeruehrt(true)}
          aria-required={regel.pflicht || undefined}
        />
      </FormControl>
      {hilfetext ? <FormDescription>{hilfetext}</FormDescription> : null}
      <FormMessage>{fehler}</FormMessage>
    </FormField>
  );
}
