// fachverfahren-kit/components/GebuehrenAnzeige — read-only Gebühren-Aufstellung aus einer `Berechnung`.
//
// Zeigt die Positionen einer Berechnung + die Summe, jeder Betrag über die BESTEHENDE `formatBetrag` (format.ts)
// einheitlich formatiert (de-DE, Währung/Einheit aus der `Berechnung`). NICHT verwechseln mit `EPaymentPanel` (das
// die tatsächliche BEZAHLUNG abwickelt) — dies ist reine Anzeige, ohne Aktion. GENERISCH, dep-frei
// (React + Bestands-Primitive Table/Callout + format.ts + Token-Klassen), keine Domänen-Literale.
//
// Barrierefreiheit (WCAG 2.2 AA / BITV 2.0):
//  - echte Datentabelle mit Spaltenüberschriften (`scope="col"`), Zeilen-Kopf (`scope="row"`) und einer <caption>,
//  - Beträge rechtsbündig mit `tabular-nums` (Ziffern richten sich aus — bessere Lesbarkeit/Vergleichbarkeit),
//  - der vorläufige Charakter wird NIE nur über Farbe getragen: ein Callout mit Icon + Text weist ihn aus.
import { useId } from "react";

import type { Berechnung } from "../types.js";
import { formatBetrag } from "../format.js";
import { cn } from "../lib/utils.js";
import { Callout } from "./Callout.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table.js";

export interface GebuehrenAnzeigeProps {
  /** Die anzuzeigende Berechnung (aus `vorgang.berechnung`). */
  berechnung: Berechnung;
  /** Optionale Überschrift (Default: `berechnung.label`). */
  titel?: string;
  className?: string;
}

/**
 * Rendert eine `Berechnung` als Gebühren-Aufstellung. Liegen Positionen vor, bilden sie die Zeilen und die Summe steht
 * im Tabellen-Fuß; ohne Positionen zeigt eine einzelne Zeile den Gesamtbetrag. Bei `status: "provisional"` weist ein
 * Callout den vorläufigen Charakter aus.
 */
export function GebuehrenAnzeige({
  berechnung,
  titel,
  className,
}: GebuehrenAnzeigeProps) {
  const titelId = useId();
  const { einheit, positionen, betrag, status } = berechnung;
  const hatPositionen = !!positionen && positionen.length > 0;
  const zeilen =
    positionen && positionen.length > 0
      ? positionen
      : [{ label: berechnung.label, betrag }];
  const vorlaeufig = status === "provisional";
  const ueberschrift = titel ?? berechnung.label;

  return (
    <section
      className={cn("space-y-3", className)}
      aria-labelledby={titelId}
    >
      <h3 id={titelId} className="text-base font-semibold text-foreground">
        {ueberschrift}
      </h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableCaption className="px-3">
            Gebühren-Aufstellung{vorlaeufig ? " (vorläufig)" : ""}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Position</TableHead>
              <TableHead scope="col" className="text-right">
                Betrag
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zeilen.map((p, i) => (
              <TableRow key={`${p.label}-${i}`}>
                <th
                  scope="row"
                  className="p-2 text-left align-middle font-normal text-foreground"
                >
                  {p.label}
                </th>
                <TableCell className="text-right align-middle tabular-nums text-foreground">
                  {formatBetrag(p.betrag, einheit)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {hatPositionen && (
            <TableFooter>
              <TableRow>
                <th
                  scope="row"
                  className="p-2 text-left align-middle font-semibold text-foreground"
                >
                  Summe
                </th>
                <TableCell className="text-right align-middle font-semibold tabular-nums text-foreground">
                  {formatBetrag(betrag, einheit)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {vorlaeufig && (
        <Callout tone="info" title="Vorläufige Berechnung">
          Die Angaben sind noch nicht vollständig — der endgültige Betrag kann
          abweichen.
        </Callout>
      )}
    </section>
  );
}
