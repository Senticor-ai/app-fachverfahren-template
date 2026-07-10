// fachverfahren-kit/components/KiSidecar — das ASSISTIVE KI-Sidecar (Phase 6): holt GENAU EINEN transparenten
// Vorschlag über den vendor-neutralen `KiAssistPort` und rendert ihn im `KiAssistPanel`. Der Mensch entscheidet
// (HITL) — Annehmen ruft `onUebernahme`, Verwerfen blendet den Vorschlag aus. KI ist NIE autonom und NIE eines der
// zwei Augen einer Vier-Augen-Entscheidung (EU-AI-Act Art. 50 · DSGVO Art. 22). Vendor-neutral: in PROD dockt ein
// echter LLM/Broker an denselben `KiAssistPort` an, ohne diese Komponente zu ändern.
import { useEffect, useState, type ReactElement } from "react";

import type {
  KiAssistEingabe,
  KiAssistErgebnis,
  KiAssistPort,
} from "../lib/ai-assist.js";
import { KiAssistPanel, type KiRisikoklasse } from "./KiAssistPanel.js";
import { cn } from "../lib/utils.js";

export interface KiSidecarProps {
  /** Der vendor-neutrale Assistenz-Port (Stub im DEV, echter Broker/LLM in PROD). */
  kiAssist: KiAssistPort;
  /** Die Eingabe/der Kontext, zu dem ein Vorschlag erzeugt wird (DATEN aus dem Verfahren). */
  eingabe: KiAssistEingabe;
  /** Name der unterstützten Funktion (Überschrift + SR-Ansage). */
  funktionsName: string;
  /** Risiko-Einstufung (Standard: begrenzt). */
  risikoklasse?: KiRisikoklasse;
  /** HITL: der Mensch ÜBERNIMMT den Vorschlag — der Aufrufer wendet ihn an (mit KI-Herkunft im Audit). */
  onUebernahme: (ergebnis: KiAssistErgebnis) => void;
  className?: string;
}

type Zustand =
  | { status: "laedt" }
  | { status: "fehler" }
  | { status: "verworfen" }
  | { status: "bereit"; ergebnis: KiAssistErgebnis };

export function KiSidecar({
  kiAssist,
  eingabe,
  funktionsName,
  risikoklasse = "begrenzt",
  onUebernahme,
  className,
}: KiSidecarProps): ReactElement {
  const [zustand, setZustand] = useState<Zustand>({ status: "laedt" });
  // Serialisierter Schlüssel als stabiler Effekt-Trigger: ein Wechsel der Eingabe (z. B. anderer Vorgang) fordert
  // einen neuen Vorschlag an.
  const key = JSON.stringify(eingabe);

  useEffect(() => {
    let abgebrochen = false;
    setZustand({ status: "laedt" });
    kiAssist
      .schlageVor(eingabe)
      .then((ergebnis) => {
        if (!abgebrochen) setZustand({ status: "bereit", ergebnis });
      })
      .catch(() => {
        if (!abgebrochen) setZustand({ status: "fehler" });
      });
    return () => {
      abgebrochen = true;
    };
    // Trigger sind `kiAssist` (referenz-stabil) + `key` (serialisierte Eingabe) — ein Eingabe-Wechsel fordert neu an.
  }, [kiAssist, key]);

  return (
    <aside
      aria-label={`KI-Assistenz: ${funktionsName}`}
      className={cn("flex flex-col gap-2", className)}
    >
      {zustand.status === "laedt" ? (
        <p className="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          KI-Vorschlag wird erstellt …
        </p>
      ) : zustand.status === "fehler" ? (
        <p className="rounded-md border border-status-warn/30 bg-status-warn-soft px-4 py-3 text-sm text-foreground">
          KI-Assistenz nicht verfügbar — die Entscheidung liegt unverändert bei
          Ihnen.
        </p>
      ) : zustand.status === "verworfen" ? (
        <p className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          KI-Vorschlag verworfen.
        </p>
      ) : (
        <KiAssistPanel
          funktionsName={funktionsName}
          risikoklasse={risikoklasse}
          vorschlag={{
            wert: zustand.ergebnis.wert,
            quelle: zustand.ergebnis.quelle,
            konfidenz: zustand.ergebnis.konfidenz,
            begruendung: zustand.ergebnis.begruendung,
          }}
          onAnnehmen={() => onUebernahme(zustand.ergebnis)}
          onVerwerfen={() => setZustand({ status: "verworfen" })}
        />
      )}
    </aside>
  );
}
