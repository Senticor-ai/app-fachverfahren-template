// fachverfahren-kit/components/AssistentPanel — Chat-Panel fuer den KI-Assistenten (Verlauf + Composer).
//
// Bindet useAssistent (Verlauf + gestreamte Antwort) an eine barrierefreie Chat-Oberflaeche: Nachrichtenliste
// mit StreamingText je Assistenten-Antwort, AgentStatusIndicator im Kopf und eine sichtbare Art-50-Kennzeichnung
// („KI-generiert, bitte prüfen"). Der Composer ist ein NORMALER Textbereich (ui/textarea) — Spracheingabe wird
// spaeter additiv angedockt, hier bewusst NICHT eingebaut. Ohne `chatPort` rendert das Panel einen deaktivierten
// Zustand mit Hinweis. Generisch, kein Domaenen-Literal.
//
// A11y: die Nachrichtenliste ist bewusst OHNE role="log"/aria-live (kein Token-fuer-Token-Vorlesen); die
// Abschluss-Ansage kommt aus StreamingText. Der Composer ist ueber FormField/FormLabel/FormControl korrekt
// mit seinem Label verdrahtet; Buttons/Textarea des Kits erfuellen die 24px-Zielgroesse und den Fokus.
import * as React from "react";
import { Bot, Send, Sparkles } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Textarea } from "../ui/textarea.js";
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
} from "../ui/form-field.js";
import { Callout } from "./Callout.js";
import { StreamingText } from "./StreamingText.js";
import {
  AgentStatusIndicator,
  type AgentStatus,
} from "./AgentStatusIndicator.js";
import { useAssistent } from "../hooks/use-assistent.js";
import type { KiChatPort } from "../lib/ai-assist.js";

export interface AssistentPanelProps {
  /** Der Chat-PORT. Fehlt er, rendert das Panel einen deaktivierten Zustand mit Hinweis. */
  chatPort?: KiChatPort | undefined;
  /** Titel des Panels. */
  titel?: string;
  /** Platzhalter im Composer. */
  platzhalter?: string;
  /** Sichtbare Art-50-Kennzeichnung (Default „KI-generiert, bitte prüfen"). */
  kennzeichnung?: string;
  className?: string;
}

const STANDARD_KENNZEICHNUNG = "KI-generiert, bitte prüfen";

/** Chat-Panel: Nachrichtenliste + Composer, transparent gekennzeichnet, HITL-freundlich. */
export function AssistentPanel({
  chatPort,
  titel = "Assistent",
  platzhalter = "Nachricht eingeben …",
  kennzeichnung = STANDARD_KENNZEICHNUNG,
  className,
}: AssistentPanelProps) {
  const assistent = useAssistent(chatPort);
  const [entwurf, setEntwurf] = React.useState("");
  const aktiv = Boolean(chatPort);

  const status: AgentStatus =
    assistent.state.status === "error"
      ? "fehler"
      : assistent.laedt
        ? "denkt"
        : "idle";

  const kannSenden = aktiv && entwurf.trim().length > 0 && !assistent.laedt;

  async function absenden() {
    if (!kannSenden) return;
    const text = entwurf;
    setEntwurf("");
    await assistent.senden(text);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sendet, Umschalt+Enter fuegt eine neue Zeile ein (vertraute Chat-Konvention).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void absenden();
    }
  }

  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      aria-label={titel}
    >
      {/* Kopf: Titel + Agenten-Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bot
            className="h-4 w-4 shrink-0 text-status-info"
            aria-hidden="true"
          />
          {titel}
        </h3>
        <AgentStatusIndicator status={status} />
      </div>

      {/* Sichtbare Art-50-Kennzeichnung — dauerhaft, nicht nur pro Nachricht */}
      <p className="flex items-center gap-1.5 border-b border-border bg-status-info-soft/40 px-3 py-1.5 text-xs text-muted-foreground">
        <Sparkles
          className="h-3.5 w-3.5 shrink-0 text-status-info"
          aria-hidden="true"
        />
        {kennzeichnung}
      </p>

      {/* Nachrichtenliste — bewusst KEIN role="log"/aria-live (kein Token-für-Token-Vorlesen). */}
      <ul className="min-h-[8rem] flex-1 space-y-3 overflow-y-auto p-3">
        {assistent.nachrichten.map((n) => {
          const istAssistent = n.rolle === "assistent";
          return (
            <li
              key={n.id}
              className={cn(
                "flex",
                istAssistent ? "justify-start" : "justify-end",
              )}
            >
              <div
                className={cn(
                  "fv-enter max-w-[85%] rounded-lg px-3 py-2",
                  istAssistent
                    ? "bg-surface-2 text-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                <span className="sr-only">
                  {istAssistent ? "Assistent: " : "Sie: "}
                </span>
                {istAssistent ? (
                  <>
                    <StreamingText
                      text={n.text}
                      streaming={n.streamt ?? false}
                    />
                    {n.abschluss ? (
                      <p className="mt-1.5 border-t border-border/60 pt-1 text-xs text-muted-foreground">
                        {kennzeichnung} · {n.abschluss.quelle}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {n.text}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Composer — normaler Textbereich (Spracheingabe wird später additiv angedockt). */}
      <div className="border-t border-border p-3">
        {aktiv ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void absenden();
            }}
          >
            <FormField className="flex-1">
              <FormLabel className="sr-only">
                Nachricht an den Assistenten
              </FormLabel>
              <FormControl>
                <Textarea
                  value={entwurf}
                  onChange={(e) => setEntwurf(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={platzhalter}
                  rows={2}
                />
              </FormControl>
              <FormDescription className="sr-only">
                Enter sendet die Nachricht, Umschalt+Enter fügt eine neue Zeile
                ein.
              </FormDescription>
            </FormField>
            <Button
              type="submit"
              size="icon"
              disabled={!kannSenden}
              loading={assistent.laedt}
              aria-label="Senden"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <Callout tone="neutral" title="Kein Assistent verbunden">
            Es ist kein KI-Assistent angebunden. Sobald ein Assistent verfügbar
            ist, können Sie hier Fragen stellen.
          </Callout>
        )}
      </div>
    </section>
  );
}
