// fachverfahren-kit/components/VergleichsAnsicht — generischer Zwei-Spalten-Vergleich (z. B. Antrag vs. Registerdaten).
//
// Stellt zwei Datensätze Merkmal für Merkmal gegenüber und markiert Abweichungen. GENERISCH: die Merkmale/Werte
// kommen ausschließlich aus den Props (kein Domänen-Literal). Die Zuordnung erfolgt über `feld` — fehlt ein Merkmal
// auf einer Seite, gilt es als Abweichung („fehlt"). Rein präsentierend, dependency-frei (React + Token-Klassen +
// Bestands-Primitive Table/Badge).
//
// Barrierefreiheit (WCAG 2.2 AA / BITV 2.0):
//  - echte Datentabelle mit Spaltenüberschriften (`scope="col"`) und Zeilen-Kopf (`scope="row"`),
//  - eine <caption> fasst das Ergebnis zusammen (Anzahl der Abweichungen) — auch für Screenreader,
//  - der Status wird NIE nur über Farbe getragen: jedes Feld trägt Icon PLUS Text („Abweichung"/„Übereinstimmung"),
//  - Signal-Farben ausschließlich über die status-Tokens (light/dark/high-contrast automatisch korrekt).
import { useId } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table.js";

/** Ein vergleichbarer Wert — skalar, damit die Gegenüberstellung deterministisch ist. */
export type VergleichsWert = string | number | boolean | null | undefined;

/** Ein Merkmal einer Seite: `feld` ist der Abgleich-Schlüssel, `label` die Anzeige, `wert` der (skalare) Inhalt. */
export interface VergleichsEintrag {
  feld: string;
  label: string;
  wert: VergleichsWert;
}

/** Eine Spalte des Vergleichs (z. B. „Antrag" oder „Melderegister") mit ihren Merkmalen. */
export interface VergleichsSpalte {
  label: string;
  eintraege: VergleichsEintrag[];
}

export interface VergleichsAnsichtProps {
  /** Linke Spalte (z. B. die Antragsangaben). */
  links: VergleichsSpalte;
  /** Rechte Spalte (z. B. die Registerdaten). */
  rechts: VergleichsSpalte;
  /** Optionale Überschrift über der Tabelle. */
  titel?: string;
  className?: string;
}

/** Normalisiert einen Wert für den Vergleich (leer → "", Boolean → ja/nein, sonst getrimmt). */
function normWert(w: VergleichsWert): string {
  if (w === null || w === undefined) return "";
  if (typeof w === "boolean") return w ? "ja" : "nein";
  return String(w).trim();
}

/** Wert für die Anzeige (leer → „—", Boolean → „Ja"/„Nein"). */
function anzeige(w: VergleichsWert): string {
  if (
    w === null ||
    w === undefined ||
    (typeof w === "string" && w.trim() === "")
  )
    return "—";
  if (typeof w === "boolean") return w ? "Ja" : "Nein";
  return String(w);
}

/**
 * Zwei-Spalten-Diff. Bildet die Vereinigung aller Merkmale (Reihenfolge: links zuerst, dann nur rechts vorhandene)
 * und vergleicht je Merkmal die normalisierten Werte. Abweichungen (inkl. „nur auf einer Seite vorhanden") werden
 * mehrkanalig markiert (Icon + Text + Ton).
 */
export function VergleichsAnsicht({
  links,
  rechts,
  titel,
  className,
}: VergleichsAnsichtProps) {
  const titelId = useId();
  const lMap = new Map(links.eintraege.map((e) => [e.feld, e.wert] as const));
  const rMap = new Map(rechts.eintraege.map((e) => [e.feld, e.wert] as const));

  // Vereinigung der Merkmale in stabiler Reihenfolge; Label bevorzugt aus der linken Spalte.
  const merkmale: { feld: string; label: string }[] = [];
  const gesehen = new Set<string>();
  for (const e of [...links.eintraege, ...rechts.eintraege]) {
    if (gesehen.has(e.feld)) continue;
    gesehen.add(e.feld);
    merkmale.push({ feld: e.feld, label: e.label });
  }

  const zeilen = merkmale.map((m) => {
    const hatLinks = lMap.has(m.feld);
    const hatRechts = rMap.has(m.feld);
    const lWert = lMap.get(m.feld);
    const rWert = rMap.get(m.feld);
    const abweichung =
      !hatLinks || !hatRechts || normWert(lWert) !== normWert(rWert);
    return { ...m, lWert, rWert, abweichung };
  });

  const abwZahl = zeilen.filter((z) => z.abweichung).length;
  const zusammenfassung =
    zeilen.length === 0
      ? "Keine Merkmale zum Vergleich."
      : abwZahl === 0
        ? `Alle ${zeilen.length} Merkmale stimmen überein.`
        : `${abwZahl} von ${zeilen.length} Merkmalen weichen ab.`;

  return (
    <section
      className={cn("space-y-3", className)}
      aria-labelledby={titel ? titelId : undefined}
      aria-label={titel ? undefined : "Datenvergleich"}
    >
      {titel && (
        <h3 id={titelId} className="text-base font-semibold text-foreground">
          {titel}
        </h3>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableCaption className="px-3">{zusammenfassung}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Merkmal</TableHead>
              <TableHead scope="col">{links.label}</TableHead>
              <TableHead scope="col">{rechts.label}</TableHead>
              <TableHead scope="col">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zeilen.map((z) => (
              <TableRow key={z.feld}>
                <th
                  scope="row"
                  className="p-2 text-left align-middle font-medium text-foreground"
                >
                  {z.label}
                </th>
                <TableCell className="align-middle text-foreground">
                  {anzeige(z.lWert)}
                </TableCell>
                <TableCell
                  className={cn(
                    "align-middle text-foreground",
                    z.abweichung && "font-medium",
                  )}
                >
                  {anzeige(z.rWert)}
                </TableCell>
                <TableCell className="align-middle">
                  {z.abweichung ? (
                    <Badge tone="warn">
                      <AlertTriangle
                        className="h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      Abweichung
                    </Badge>
                  ) : (
                    <Badge tone="ok">
                      <CheckCircle2
                        className="h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      Übereinstimmung
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
