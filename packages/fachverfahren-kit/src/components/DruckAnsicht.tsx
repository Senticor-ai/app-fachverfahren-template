// fachverfahren-kit/components/DruckAnsicht — druckfreundliche Zusammenfassung mit Drucken-Aktion.
//
// Nutzt die bestehende Druck-Basis der styles.css: die Klasse `.no-print` blendet Bedien-Elemente im Ausdruck
// aus (@media print), und der Druck setzt Body auf schwarz/weiß. Der Inhalt wird semantisch als <article> mit
// Überschrift, optionalem Untertitel und Fußzeile gerendert. Die Drucken-Aktion ruft `window.print` NUR auf,
// wenn es vorhanden ist (SSR-sicher), oder einen injizierten `onDrucken`-Handler.
//
// GENERISCH + DEP-LEICHT: keine Domänen-Literale; Titel/Inhalt/Fußzeile kommen ausschließlich über Props.
// KEIN Netz. BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): semantische Struktur (section→article→header/footer),
// die Zusammenfassung ist per aria-labelledby mit ihrem Titel verknüpft, echter <button> (>= 40px) für das
// Drucken, dekoratives Icon (aria-hidden), Ansage über die zentrale StatusRegion, motion-reduce respektiert.
import * as React from "react";
import { Printer } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { useStatusRegion } from "./StatusRegion.js";

export interface DruckAnsichtProps {
  /** Titel des Druckstücks (als Überschrift). */
  titel: string;
  /** Optionaler Untertitel / Metazeile unter dem Titel. */
  untertitel?: React.ReactNode;
  /** Der druckbare Inhalt. */
  children: React.ReactNode;
  /** Optionale Fußzeile (z. B. Stand/Aktenzeichen) — nur Anzeige, generisch. */
  fusszeile?: React.ReactNode;
  /** Beschriftung des Drucken-Buttons. Default „Drucken". */
  druckLabel?: string;
  /** Eigener Druck-Handler (Vorrang vor window.print) — z. B. für einen PDF-Export. */
  onDrucken?: (() => void) | undefined;
  /** Zusätzliche Bedien-Elemente neben dem Drucken-Button (werden im Ausdruck ausgeblendet). */
  aktionen?: React.ReactNode;
  className?: string;
}

/**
 * Druckfreundliche Zusammenfassung. Die Bedienleiste ist mit `.no-print` markiert und verschwindet im Ausdruck;
 * der Inhalt bleibt als sauberes Dokument erhalten.
 *
 * @example
 * <DruckAnsicht titel="Zusammenfassung des Antrags" fusszeile="Stand: …">
 *   <DescriptionList items={…} />
 * </DruckAnsicht>
 */
export function DruckAnsicht({
  titel,
  untertitel,
  children,
  fusszeile,
  druckLabel = "Drucken",
  onDrucken,
  aktionen,
  className,
}: DruckAnsichtProps): React.JSX.Element {
  const { announce } = useStatusRegion();
  const reactId = React.useId();
  const titelId = `${reactId}-titel`;

  const drucken = React.useCallback(() => {
    if (onDrucken) {
      onDrucken();
      return;
    }
    // SSR-sicher: nur drucken, wenn ein Fenster mit print-Funktion existiert.
    if (typeof window !== "undefined" && typeof window.print === "function") {
      announce("Druckdialog wird geöffnet.", "polite");
      window.print();
    }
  }, [onDrucken, announce]);

  return (
    <section className={cn("space-y-4", className)}>
      {/* Bedienleiste — im Ausdruck ausgeblendet (.no-print). */}
      <div className="no-print flex flex-wrap items-center justify-end gap-2">
        {aktionen}
        <Button type="button" variant="outline" onClick={drucken}>
          <Printer aria-hidden="true" />
          {druckLabel}
        </Button>
      </div>

      <article
        aria-labelledby={titelId}
        className="rounded-lg border border-border bg-background p-6 text-foreground"
      >
        <header className="border-b border-border pb-4">
          <h2 id={titelId} className="text-xl font-semibold text-foreground">
            {titel}
          </h2>
          {untertitel && (
            <p className="mt-1 text-sm text-muted-foreground">{untertitel}</p>
          )}
        </header>

        <div className="pt-4">{children}</div>

        {fusszeile && (
          <footer className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
            {fusszeile}
          </footer>
        )}
      </article>
    </section>
  );
}
