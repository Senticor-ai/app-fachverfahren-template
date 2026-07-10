// fachverfahren-kit/components/TriageInbox — die verfahrensÜBERGREIFENDE Triage-Inbox (Phase 4).
//
// Zeigt offene Eingänge (VOR der Annahme als fachlicher Vorgang) über ALLE Verfahren als zugängliche Liste; je
// Eingang: Annehmen (→ erzeugt Vorgang + Aufgabe) oder Triagieren ohne Annahme (Ablehnen / Dublette / Zurückstellen).
// Alles kommt als DATEN über Props — kein Domänen-Literal in der Komponente. Barrierefrei (BITV/WCAG 2.2 AA):
// semantische Liste, <time dateTime>, beschriftete Aktionen, sichtbarer Fokus-Ring, reduced-motion.
import { useId, useState, type ReactElement } from "react";
import { Inbox, Check, X, Copy, Clock } from "lucide-react";

import type { InboxItem, TriageStatus } from "../types.js";
import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";

/** Triage-Aktionen OHNE Annahme (accepted ist die eigene, atomare Annahme-Aktion). */
export type TriageAktion = Exclude<TriageStatus, "accepted" | "pending">;

export interface TriageInboxProps {
  eingaenge: InboxItem[];
  /** Menschenlesbarer Verfahrensname je `procedureId` (DATEN). Fehlt einer, wird die rohe Id gezeigt. */
  verfahrenLabel?: (procedureId: string) => string;
  /** Anzeigetext je Quelle (DATEN). */
  quelleLabel?: Partial<Record<InboxItem["quelle"], string>>;
  /** Annehmen → erzeugt im richtigen Verfahren einen Vorgang + Aufgabe. */
  onAnnehmen: (inboxId: string) => void;
  /** Triagieren ohne Annahme (Ablehnen / Dublette / Zurückstellen). */
  onTriage: (inboxId: string, status: TriageAktion) => void;
  className?: string;
}

/** Quelle → Badge-Ton (rein visuell). */
function quelleTon(quelle: InboxItem["quelle"]): "info" | "neu" | "warn" {
  if (quelle === "register") return "info";
  if (quelle === "email") return "warn";
  return "neu";
}

export function TriageInbox({
  eingaenge,
  verfahrenLabel,
  quelleLabel,
  onAnnehmen,
  onTriage,
  className,
}: TriageInboxProps): ReactElement {
  const ueberschriftId = useId();
  // WCAG 2.2 §4.1.3: nach einer Aktion verschwindet die Zeile (der Store entfernt den Eingang), der Fokus fiele auf
  // <body> und nichts würde angesagt. Diese polite-Live-Region kündigt das Ergebnis an.
  const [ansage, setAnsage] = useState("");
  const annehmen = (e: InboxItem) => {
    setAnsage(`Eingang „${e.betreff ?? e.id}" angenommen — Vorgang angelegt.`);
    onAnnehmen(e.id);
  };
  const triagieren = (e: InboxItem, status: TriageAktion, was: string) => {
    setAnsage(`Eingang „${e.betreff ?? e.id}" ${was}.`);
    onTriage(e.id, status);
  };

  return (
    <section
      aria-labelledby={ueberschriftId}
      className={cn("flex flex-col gap-3", className)}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {ansage}
      </p>
      <h2
        id={ueberschriftId}
        className="flex items-center gap-2 text-base font-semibold text-foreground"
      >
        <Inbox aria-hidden="true" className="h-5 w-5" />
        Eingang (verfahrensübergreifend)
        <span className="text-muted-foreground">({eingaenge.length})</span>
      </h2>

      {eingaenge.length === 0 ? (
        <p className="rounded-md border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Keine offenen Eingänge — alles triagiert.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {eingaenge.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={quelleTon(e.quelle)}>
                    {quelleLabel?.[e.quelle] ?? e.quelle}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">
                    {e.betreff ?? e.id}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {verfahrenLabel?.(e.procedureId) ?? e.procedureId}
                  </span>
                  <time dateTime={e.eingangIso} className="tabular-nums">
                    {e.eingangIso.slice(0, 16).replace("T", " ")}
                  </time>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => annehmen(e)}
                  aria-label={`Eingang „${e.betreff ?? e.id}" annehmen (Vorgang anlegen)`}
                >
                  <Check aria-hidden="true" className="h-4 w-4" />
                  Annehmen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    triagieren(e, "duplicate", "als Dublette markiert")
                  }
                  aria-label={`Eingang „${e.betreff ?? e.id}" als Dublette markieren`}
                >
                  <Copy aria-hidden="true" className="h-4 w-4" />
                  Dublette
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => triagieren(e, "snoozed", "zurückgestellt")}
                  aria-label={`Eingang „${e.betreff ?? e.id}" zurückstellen`}
                >
                  <Clock aria-hidden="true" className="h-4 w-4" />
                  Zurückstellen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => triagieren(e, "declined", "abgelehnt")}
                  aria-label={`Eingang „${e.betreff ?? e.id}" ablehnen`}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  Ablehnen
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
