// fachverfahren-kit/components/StreamingText — rendert wachsenden (gestreamten) Text barrierefrei.
//
// Ein Token-Strom, der Zeichen fuer Zeichen ankommt, darf NICHT ueber aria-live vorgelesen werden (das
// uebertoent den Screenreader mit Bruchstuecken). Stattdessen: `aria-busy` waehrend des Streamens signalisiert
// „arbeitet", und beim Uebergang streaming → fertig wird GENAU EINMAL dezent abgesagt (ueber die zentrale
// StatusRegion). Rein praesentierend, generisch — der Text kommt ausschliesslich als prop.
import * as React from "react";

import { cn } from "../lib/utils.js";
import { useStatusRegion } from "./StatusRegion.js";

export interface StreamingTextProps {
  /** Der (wachsende) Text, der dargestellt wird. */
  text: string;
  /** True, solange weitere Token erwartet werden (zeigt Cursor + setzt aria-busy). */
  streaming?: boolean;
  /** Dezente Ansage nach Abschluss des Stroms (Default generisch). */
  abschlussAnsage?: string;
  className?: string;
}

/** Zeigt gestreamten Text; aria-busy statt aria-live, eine Abschluss-Ansage am Ende. */
export function StreamingText({
  text,
  streaming = false,
  abschlussAnsage,
  className,
}: StreamingTextProps) {
  const { announce } = useStatusRegion();
  const warStreaming = React.useRef(false);

  React.useEffect(() => {
    // Genau EINE hoefliche Ansage beim Uebergang streaming → fertig — kein Vorlesen des Token-Stroms.
    if (warStreaming.current && !streaming) {
      announce(abschlussAnsage ?? "Antwort vollständig.", "polite");
    }
    warStreaming.current = streaming;
  }, [streaming, announce, abschlussAnsage]);

  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground",
        className,
      )}
      aria-busy={streaming || undefined}
    >
      {text}
      {streaming ? (
        // Dezenter Schreib-Cursor (dekorativ). Puls schaltet unter prefers-reduced-motion still.
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] rounded-full bg-current align-baseline animate-pulse motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}
