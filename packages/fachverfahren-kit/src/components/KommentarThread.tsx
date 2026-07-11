// fachverfahren-kit/components/KommentarThread — interne Vermerke einer Aufgabe (APPEND-ONLY, wie das Audit).
//
// Surface: nur Sachbearbeitung (rollen-gated). Zeigt die Vermerke als semantische, append-only Liste mit
// Zeitstempel (<time>) + Autor-Kürzel — bewusst KEINE Edit-/Lösch-Affordanz (Vermerke sind kein frei änderbarer
// Text). Ein optionaler Composer (nur wenn `schreibenErlaubt`) legt einen neuen Vermerk an. CONFIG-/DATEN-getrieben:
// kein Domänen-Literal, alle Inhalte kommen aus den Props. Barrierefrei (BITV 2.0/WCAG 2.2 AA): <ol>/<li> + <time>,
// beschriftetes Textfeld, Live-Region meldet das Anlegen, sichtbarer Fokus-Ring, `prefers-reduced-motion` respektiert.
import { useId, useState, type FormEvent, type ReactElement } from "react";
import { MessageSquare } from "lucide-react";

import type { AufgabeKommentar } from "../types.js";
import { cn } from "../lib/utils.js";
import { MarkdownView } from "./MarkdownView.js";
import { MarkdownEditor } from "./MarkdownEditor.js";

export interface KommentarThreadProps {
  kommentare: AufgabeKommentar[];
  /** Nur wenn `true`, wird der Composer gezeigt (Bürgerrollen bekommen das Recht nie). */
  schreibenErlaubt?: boolean;
  /** Legt einen neuen Vermerk an (der Aufrufer ruft die API + aktualisiert `kommentare`). */
  onVermerk?: (text: string) => void;
  className?: string;
}

function tsText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tsMachine(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString();
}

export function KommentarThread({
  kommentare,
  schreibenErlaubt = false,
  onVermerk,
  className,
}: KommentarThreadProps): ReactElement {
  const [text, setText] = useState("");
  const ueberschriftId = useId();
  const statusId = useId();
  const chronologisch = [...kommentare].sort((a, b) =>
    a.erstelltIso < b.erstelltIso ? -1 : 1,
  );

  function absenden(event: FormEvent) {
    event.preventDefault();
    const wert = text.trim();
    if (!wert) return;
    onVermerk?.(wert);
    setText("");
  }

  return (
    <section
      aria-labelledby={ueberschriftId}
      className={cn("flex flex-col gap-3", className)}
    >
      <h3
        id={ueberschriftId}
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <MessageSquare aria-hidden="true" className="h-4 w-4" />
        Interne Vermerke
        <span className="text-muted-foreground">({chronologisch.length})</span>
      </h3>

      {chronologisch.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Vermerke zu dieser Aufgabe.
        </p>
      ) : (
        <ol className="relative ms-2 border-s border-border ps-6">
          {chronologisch.map((k) => (
            <li key={k.id} className="relative pb-4 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute -start-[1.6875rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary"
              />
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <time
                    dateTime={tsMachine(k.erstelltIso)}
                    className="font-mono text-xs tabular-nums text-muted-foreground"
                  >
                    {tsText(k.erstelltIso)}
                  </time>
                  <span
                    className="font-mono text-xs text-muted-foreground"
                    title="Handelnde Person (pseudonyme Kennung)"
                  >
                    {k.autorAkteurId}
                  </span>
                </div>
                {/* Vermerke rendern als Markdown (GFM: Fett/Listen/Links/Code) — reicher als reiner Klartext.
                    Klartext-Vermerke rendern unverändert; append-only bleibt (keine Edit-Affordanz). */}
                <MarkdownView compact>{k.text}</MarkdownView>
              </div>
            </li>
          ))}
        </ol>
      )}

      {schreibenErlaubt && (
        <form onSubmit={absenden} className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            Neuen Vermerk anlegen
          </span>
          {/* Reicher Composer: Markdown-Toolbar + umschaltbare Vorschau. Das Eingabefeld ist über `ariaLabel`
              kontextspezifisch beschriftet (nicht generisch), append-only-Semantik unverändert. */}
          <MarkdownEditor
            value={text}
            onChange={setText}
            preview="tab"
            ariaLabel="Neuen Vermerk anlegen (Markdown)"
            placeholder="Interne Einschätzung — nur für die Sachbearbeitung sichtbar. Markdown wird unterstützt."
          />
          <span className="sr-only">
            Interner Vermerk, wird der Aufgabe dauerhaft hinzugefügt
            (append-only, nicht editierbar). Markdown (GFM) wird unterstützt.
          </span>
          <div className="flex items-center justify-between gap-2">
            <span id={statusId} aria-live="polite" className="sr-only">
              {chronologisch.length} Vermerke
            </span>
            <button
              type="submit"
              disabled={text.trim().length === 0}
              className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
            >
              Vermerk anlegen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
