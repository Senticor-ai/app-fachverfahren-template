// fachverfahren-kit/components/VertretungPanel — Vollmacht/Vertretung erfassen oder anzeigen.
//
// Bildet eine Bevollmächtigung als DATEN ab (bevollmächtigte Person/Stelle, Umfang der Vollmacht, Zeitraum).
// GENERISCH: keine Domänen-Literale, keine feste Vollmachts-Art — Inhalte kommen ausschließlich über Props.
// Die Komponente VALIDIERT fachlich nicht selbst (das ist Sache des Verfahrens); sie zeigt nur vom Aufrufer
// gelieferte Feldfehler an und ergänzt einen rein rechnerischen, deterministischen Hinweis, wenn das Enddatum
// vor dem Beginn liegt.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): jedes Feld über ui/form-field korrekt verdrahtet (Label↔Control,
// aria-describedby, aria-invalid), Fehler über FormMessage (role="alert", mehrkanalig via fv-text-error),
// Pflichtfelder mit aria-required + sichtbarer Kennzeichnung, Controls >= 40px hoch (Kit-Primitive), Nur-Lese-
// Ansicht als semantische Definitionsliste. Kein Netz, kein Date.now (Zeitraum-Vergleich rein lexikografisch
// über ISO-Datumsstrings).
import * as React from "react";
import { UserCheck } from "lucide-react";

import { cn } from "../lib/utils.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card.js";
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from "../ui/form-field.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";

/** Eine Bevollmächtigung/Vertretung als DATEN. */
export interface Vertretung {
  /** Name der bevollmächtigten Person oder Stelle. */
  vertreterName: string;
  /** Umfang/Reichweite der Vollmacht (Freitext). */
  umfang: string;
  /** Beginn der Vollmacht als ISO-Datum ("YYYY-MM-DD"), optional. */
  gueltigVonIso?: string;
  /** Ende der Vollmacht als ISO-Datum ("YYYY-MM-DD"), optional (leer = unbefristet). */
  gueltigBisIso?: string;
}

export interface VertretungPanelProps {
  /** Bestehende/initiale Angaben (Teilangaben erlaubt). */
  vertretung?: Partial<Vertretung> | undefined;
  /** Wird bei jeder Änderung mit dem vollständigen Datensatz aufgerufen. Fehlt er, ist das Panel nur-lesend. */
  onChange?: ((vertretung: Vertretung) => void) | undefined;
  /** Nur-Lese-Ansicht erzwingen (zeigt die Angaben ohne Formular). */
  readOnly?: boolean;
  /** Vom Aufrufer gelieferte Feldfehler (Feldschlüssel → Meldung) — DATEN-getriebene Validierung. */
  fehler?: Partial<Record<keyof Vertretung, string>> | undefined;
  /** Überschrift. Default „Vollmacht / Vertretung". */
  titel?: string;
  /** Beschreibung unter der Überschrift. */
  beschreibung?: string;
  className?: string;
}

const LEER: Vertretung = { vertreterName: "", umfang: "" };

/** Formatiert ein ISO-Datum ("YYYY-MM-DD") für die Nur-Lese-Anzeige. Ungültiges/leeres → Fallback-Text. */
function formatDatum(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Erfasst oder zeigt eine Bevollmächtigung. Ohne `onChange` (oder mit `readOnly`) rein anzeigend.
 *
 * @example
 * <VertretungPanel
 *   vertretung={{ vertreterName: "", umfang: "" }}
 *   onChange={(v) => setVertretung(v)}
 *   fehler={{ vertreterName: "Bitte angeben." }}
 * />
 */
export function VertretungPanel({
  vertretung,
  onChange,
  readOnly = false,
  fehler,
  titel = "Vollmacht / Vertretung",
  beschreibung = "Bevollmächtigte Person oder Stelle, Umfang der Vollmacht und Zeitraum.",
  className,
}: VertretungPanelProps): React.JSX.Element {
  // Entwurf lokal halten (einmalig aus den Props geimpft) und Änderungen nach oben spiegeln.
  const [entwurf, setEntwurf] = React.useState<Vertretung>(() => ({
    ...LEER,
    ...vertretung,
  }));

  const nurLesen = readOnly || !onChange;

  const setzeFeld = React.useCallback(
    <K extends keyof Vertretung>(feld: K, wert: Vertretung[K]) => {
      setEntwurf((vorher) => {
        const naechste = { ...vorher, [feld]: wert };
        onChange?.(naechste);
        return naechste;
      });
    },
    [onChange],
  );

  // Rein rechnerischer Hinweis: ISO-Datumsstrings vergleichen sich lexikografisch = chronologisch.
  const zeitraumUngueltig =
    !!entwurf.gueltigVonIso &&
    !!entwurf.gueltigBisIso &&
    entwurf.gueltigBisIso < entwurf.gueltigVonIso;

  const bisFehler =
    fehler?.gueltigBisIso ??
    (zeitraumUngueltig
      ? "Das Enddatum liegt vor dem Beginn der Vollmacht."
      : undefined);

  if (nurLesen) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
            {titel}
          </CardTitle>
          <CardDescription>{beschreibung}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Bevollmächtigte:r</dt>
            <dd className="font-medium text-foreground">
              {entwurf.vertreterName || "—"}
            </dd>
            <dt className="text-muted-foreground">Umfang</dt>
            <dd className="whitespace-pre-line font-medium text-foreground">
              {entwurf.umfang || "—"}
            </dd>
            <dt className="text-muted-foreground">Gültig ab</dt>
            <dd className="font-medium text-foreground">
              {entwurf.gueltigVonIso ? (
                <time dateTime={entwurf.gueltigVonIso}>
                  {formatDatum(entwurf.gueltigVonIso)}
                </time>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted-foreground">Gültig bis</dt>
            <dd className="font-medium text-foreground">
              {entwurf.gueltigBisIso ? (
                <time dateTime={entwurf.gueltigBisIso}>
                  {formatDatum(entwurf.gueltigBisIso)}
                </time>
              ) : (
                "unbefristet"
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          {titel}
        </CardTitle>
        <CardDescription>{beschreibung}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField invalid={!!fehler?.vertreterName}>
          <FormLabel required>Bevollmächtigte Person oder Stelle</FormLabel>
          <FormControl>
            <Input
              value={entwurf.vertreterName}
              onChange={(e) => setzeFeld("vertreterName", e.target.value)}
              aria-required="true"
              autoComplete="name"
            />
          </FormControl>
          <FormMessage>{fehler?.vertreterName}</FormMessage>
        </FormField>

        <FormField invalid={!!fehler?.umfang}>
          <FormLabel required>Umfang der Vollmacht</FormLabel>
          <FormControl>
            <Textarea
              value={entwurf.umfang}
              onChange={(e) => setzeFeld("umfang", e.target.value)}
              aria-required="true"
              rows={3}
            />
          </FormControl>
          <FormDescription>
            Beschreiben Sie, wofür die Vollmacht gilt (z. B. für welche
            Handlungen und in welchem Verfahren).
          </FormDescription>
          <FormMessage>{fehler?.umfang}</FormMessage>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField invalid={!!fehler?.gueltigVonIso}>
            <FormLabel>Gültig ab</FormLabel>
            <FormControl>
              <Input
                type="date"
                value={entwurf.gueltigVonIso ?? ""}
                onChange={(e) =>
                  setzeFeld("gueltigVonIso", e.target.value || undefined)
                }
              />
            </FormControl>
            <FormMessage>{fehler?.gueltigVonIso}</FormMessage>
          </FormField>

          <FormField invalid={!!bisFehler}>
            <FormLabel>Gültig bis</FormLabel>
            <FormControl>
              <Input
                type="date"
                value={entwurf.gueltigBisIso ?? ""}
                onChange={(e) =>
                  setzeFeld("gueltigBisIso", e.target.value || undefined)
                }
              />
            </FormControl>
            <FormDescription>
              Leer lassen für eine unbefristete Vollmacht.
            </FormDescription>
            <FormMessage>{bisFehler}</FormMessage>
          </FormField>
        </div>
      </CardContent>
    </Card>
  );
}
