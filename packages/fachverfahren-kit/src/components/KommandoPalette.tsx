// components/KommandoPalette — die GENERISCHE Kommando-Palette (⌘K / Strg-K) der Sachbearbeitung.
//
// Schneller Tastatur-Einstieg in Aktionen des aktuellen Verfahrens (Vorgang öffnen, Status wechseln,
// Filter setzen …). VOLLSTÄNDIG dep-frei und domänen-frei: die konkreten Aktionen kommen ausschließlich
// über `props.aktionen` herein — kein Domänen-Literal, keine config/port-Kopplung. Der Aufrufer entscheidet,
// welche Kommandos das jeweilige Fachverfahren anbietet.
//
// Bedienung: ⌘K bzw. Strg-K öffnet, Such-Input filtert live, Pfeil-hoch/-runter wählt, Enter führt aus,
// Esc schließt. Barrierefrei (BITV 2.0 / WCAG 2.2 AA): role="dialog" + aria-modal, Listbox/Option mit
// aria-activedescendant, Fokus-Falle, Live-Region für die Trefferzahl, beschriftetes Such-Input,
// sichtbarer Fokus-/Auswahl-Ring, prefers-reduced-motion respektiert.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { CornerDownLeft, Search } from "lucide-react";

import { cn } from "../lib/utils.js";

// ── Vertrag ────────────────────────────────────────────────────────────────────────────────────
/** Eine einzelne, ausführbare Aktion der Palette — domänen-frei, vom Aufrufer geliefert. */
export interface KommandoAktion {
  /** Stabile, eindeutige Id (für aria-activedescendant + React-Key). */
  id: string;
  /** Sichtbares Label / Kommando-Name. */
  label: string;
  /** Optionaler Hinweis (Untertext, Kurzbeschreibung). */
  hinweis?: string;
  /** Wird beim Auslösen (Enter/Klick) gerufen. */
  run: () => void;
}

export interface KommandoPaletteProps {
  /** Die anbietbaren Kommandos — vollständig vom Aufrufer bestimmt (kein Domänen-Literal hier). */
  aktionen: KommandoAktion[];
  /** Optionaler Platzhalter für das Such-Input. */
  platzhalter?: string;
  /** Optionales Aria-Label des Dialogs (Default: „Kommando-Palette"). */
  ariaLabel?: string;
}

// ── Such-Filter (akzentschonend, dep-frei) ─────────────────────────────────────────────────────
/** Diakritika entfernen + lower-case, damit „Übergang" auch bei Eingabe „ubergang" matcht. */
function normalisieren(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Filtert die Aktionen anhand der Eingabe (Treffer in Label ODER Hinweis). Leere Eingabe → alle. */
function filtern(aktionen: KommandoAktion[], suche: string): KommandoAktion[] {
  const q = normalisieren(suche);
  if (q.length === 0) return aktionen;
  const terme = q.split(/\s+/).filter(Boolean);
  return aktionen.filter((a) => {
    const heuhaufen = normalisieren(`${a.label} ${a.hinweis ?? ""}`);
    return terme.every((t) => heuhaufen.includes(t));
  });
}

/**
 * Kommando-Palette — öffnet per ⌘K / Strg-K, filtert live, Pfeil-Tasten + Enter, Esc schließt.
 * Dep-frei (nur React + Tailwind + lucide-react), config-/domänen-frei (Aktionen kommen aus props).
 */
export function KommandoPalette({
  aktionen,
  platzhalter,
  ariaLabel,
}: KommandoPaletteProps): ReactElement {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const [aktivIdx, setAktivIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Element, das den Fokus vor dem Öffnen hatte — beim Schließen dorthin zurückgeben (a11y).
  const ausloeserRef = useRef<HTMLElement | null>(null);

  const baseId = useId();
  const dialogTitelId = `${baseId}-titel`;
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const liveId = `${baseId}-live`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const treffer = useMemo(() => filtern(aktionen, suche), [aktionen, suche]);

  // Aktiv-Index immer in gültigem Bereich halten (Liste schrumpft beim Tippen).
  useEffect(() => {
    setAktivIdx((i) => {
      if (treffer.length === 0) return 0;
      return Math.min(i, treffer.length - 1);
    });
  }, [treffer.length]);

  const schliessen = useCallback(() => {
    setOffen(false);
    setSuche("");
    setAktivIdx(0);
    // Fokus zurück an das auslösende Element (oder Body als Fallback).
    const ziel = ausloeserRef.current;
    ausloeserRef.current = null;
    if (ziel && typeof ziel.focus === "function") ziel.focus();
  }, []);

  const oeffnen = useCallback(() => {
    if (typeof document !== "undefined") {
      const aktiv = document.activeElement;
      ausloeserRef.current = aktiv instanceof HTMLElement ? aktiv : null;
    }
    setSuche("");
    setAktivIdx(0);
    setOffen(true);
  }, []);

  // ── Globaler ⌘K / Strg-K-Listener ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const istPalettenTaste =
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key === "k" || e.key === "K");
      if (istPalettenTaste) {
        e.preventDefault();
        // Toggle: erneutes ⌘K schließt die offene Palette wieder.
        setOffen((war) => {
          if (war) {
            // schliessen() inkl. Fokus-Rückgabe asynchron, damit setState konsistent bleibt.
            queueMicrotask(schliessen);
            return war;
          }
          queueMicrotask(oeffnen);
          return war;
        });
      }
    }
    if (typeof window === "undefined") return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [oeffnen, schliessen]);

  // ── Fokus ins Input legen, sobald geöffnet ────────────────────────────────────────────────────
  useEffect(() => {
    if (offen) inputRef.current?.focus();
  }, [offen]);

  // ── Aktive Option in den sichtbaren Bereich scrollen ──────────────────────────────────────────
  useEffect(() => {
    if (!offen) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `#${CSS.escape(optionId(aktivIdx))}`,
    );
    el?.scrollIntoView({ block: "nearest" });
    // optionId ist über baseId stabil; aktivIdx/offen treiben den Effekt.
  }, [aktivIdx, offen, treffer.length]);

  const ausfuehren = useCallback(
    (idx: number) => {
      const aktion = treffer[idx];
      if (!aktion) return;
      // Erst schließen (Fokus zurück), dann ausführen — der Callback darf neu fokussieren.
      schliessen();
      aktion.run();
    },
    [treffer, schliessen],
  );

  // ── Tastatur-Navigation im Dialog (Fokus liegt am Input) ──────────────────────────────────────
  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setAktivIdx((i) =>
            treffer.length === 0 ? 0 : (i + 1) % treffer.length,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setAktivIdx((i) =>
            treffer.length === 0
              ? 0
              : (i - 1 + treffer.length) % treffer.length,
          );
          break;
        case "Home":
          e.preventDefault();
          setAktivIdx(0);
          break;
        case "End":
          e.preventDefault();
          setAktivIdx(Math.max(0, treffer.length - 1));
          break;
        case "Enter":
          e.preventDefault();
          ausfuehren(aktivIdx);
          break;
        case "Escape":
          e.preventDefault();
          schliessen();
          break;
        case "Tab":
          // Fokus-Falle: nur das Input ist fokussierbar → Tab bleibt hier.
          e.preventDefault();
          break;
        default:
          break;
      }
    },
    [treffer.length, aktivIdx, ausfuehren, schliessen],
  );

  if (!offen) return <></>;

  const aktiveOptionId = treffer.length > 0 ? optionId(aktivIdx) : undefined;
  const trefferText =
    treffer.length === 0
      ? "Keine Treffer"
      : `${treffer.length} ${treffer.length === 1 ? "Treffer" : "Treffer"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-[12vh]"
      // Klick auf das Overlay (außerhalb des Panels) schließt.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) schliessen();
      }}
    >
      {/* Abdunkelung — dekorativ, kein Fokus-Stop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitelId}
        className={cn(
          "relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl",
          "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150",
        )}
      >
        <h2 id={dialogTitelId} className="sr-only">
          {ariaLabel ?? "Kommando-Palette"}
        </h2>

        {/* Such-Zeile */}
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-label={ariaLabel ?? "Kommando suchen"}
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={aktiveOptionId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={suche}
            placeholder={platzhalter ?? "Kommando suchen …"}
            onChange={(e) => {
              setSuche(e.target.value);
              setAktivIdx(0);
            }}
            onKeyDown={onInputKeyDown}
            className={cn(
              "h-12 w-full border-0 bg-transparent text-sm text-foreground outline-none",
              "placeholder:text-muted-foreground",
            )}
          />
          <kbd className="hidden shrink-0 select-none rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline-block">
            Esc
          </kbd>
        </div>

        {/* Treffer-Liste */}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Verfügbare Kommandos"
          className="max-h-[min(60vh,22rem)] overflow-y-auto p-1.5 [scrollbar-width:thin]"
        >
          {treffer.length === 0 ? (
            <li
              role="option"
              aria-selected="false"
              aria-disabled="true"
              className="px-3 py-6 text-center text-sm text-muted-foreground"
            >
              Keine passende Aktion gefunden.
            </li>
          ) : (
            treffer.map((aktion, i) => {
              const aktiv = i === aktivIdx;
              return (
                <li
                  key={aktion.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={aktiv}
                  // Maus-Hover hebt die Option hervor (Sync mit Tastatur-Auswahl).
                  onMouseMove={() => setAktivIdx(i)}
                  // mousedown statt click: Input behält Fokus, Auswahl bleibt deterministisch.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ausfuehren(i);
                  }}
                  className={cn(
                    "flex min-h-[2.5rem] cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    aktiv
                      ? "bg-accent/15 text-foreground ring-1 ring-inset ring-accent/50"
                      : "text-foreground",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {aktion.label}
                    </span>
                    {aktion.hinweis && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {aktion.hinweis}
                      </span>
                    )}
                  </span>
                  {aktiv && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
                      <span className="hidden sm:inline">Enter</span>
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>

        {/* Fußzeile mit Tastatur-Hinweisen */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono text-xs">
              ↑
            </kbd>
            <kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono text-xs">
              ↓
            </kbd>
            <span>Navigieren</span>
            <span aria-hidden="true">·</span>
            <kbd className="rounded border border-border bg-card px-1 py-0.5 font-mono text-xs">
              ↵
            </kbd>
            <span>Ausführen</span>
          </span>
          <span aria-hidden="true">{trefferText}</span>
        </div>

        {/* Live-Region — kündigt die Trefferzahl beim Tippen für Screenreader an. */}
        <div id={liveId} role="status" aria-live="polite" className="sr-only">
          {trefferText}
        </div>
      </div>
    </div>
  );
}
