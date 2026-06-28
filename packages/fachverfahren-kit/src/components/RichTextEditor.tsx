// fachverfahren-kit/components/RichTextEditor — der GENERISCHE, dependency-freie Rich-Text-Editor.
//
// Zweck: rechtsförmliche Texte bearbeiten (z.B. Bescheid-Begründung, Vermerk, Stellungnahme) mit einer kleinen,
// barrierefreien Formatierungs-Leiste — OHNE schwere Editor-Bibliothek (kein TipTap/Slate/Quill).
//
// Technik: ein `contentEditable`-Bereich. Formatierungen laufen über das DOM-native `document.execCommand`
// (Fett/Kursiv/Unterstrichen/Listen/Überschrift) — der einzige fork-freie, dep-lose Weg zur Inline-Bearbeitung.
// `execCommand` gilt als „deprecated", ist aber in allen Ziel-Browsern weiterhin implementiert; fehlt es, bleibt
// der Editor als reines Textfeld nutzbar (die Leiste wird dann deaktiviert).
//
// SICHERHEIT: Die Ausgabe ist IMMER sanitisiert. `onChange` liefert ein gegen eine strikte ALLOW-LIST gefiltertes
// HTML (nur semantische Formatierungs-Tags, KEINE script/style/iframe/event-Attribute/javascript:-URLs). Auch der
// initiale `value` wird vor dem Einsetzen sanitisiert — nie ungeprüftes HTML ins DOM.
//
// A11y (BITV/WCAG 2.2 AA): `role="toolbar"` mit Roving-Tabindex + Pfeiltasten-Navigation, `aria-pressed` je
// Umschalter, beschriftete Buttons (Zielgröße ≥ 24px), das Editierfeld ist ein `textbox` mit `aria-multiline`,
// Tastatur-Kürzel (Strg/Cmd+B/I/U), sichtbarer Fokus, Bewegung respektiert `prefers-reduced-motion`.
//
// VOLLSTÄNDIG GENERISCH: keine Domänen-Literale; Label/Platzhalter kommen als Props.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Eraser } from "lucide-react";

import { cn } from "../lib/utils.js";
import { SaveIndicator, type SaveStatus } from "./SaveIndicator.js";
import { useStatusRegion } from "./StatusRegion.js";

// ── Sanitisierung (strikte Allow-List) ──────────────────────────────────────────────────────────
// Nur diese Tags überleben — alles andere wird entpackt (Inhalt bleibt) oder verworfen.
const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "UL",
  "OL",
  "LI",
  "H2",
  "H3",
  "BLOCKQUOTE",
  "SPAN",
  "DIV",
]);
// Tags, deren Inhalt komplett zu verwerfen ist (niemals nur entpacken).
const FORBIDDEN_SUBTREE = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "NOSCRIPT",
  "TEMPLATE",
  "SVG",
  "MATH",
]);

/** Normalisiert browser-spezifische Tags auf semantische Äquivalente. */
function normalizeTagName(tag: string): string {
  if (tag === "B") return "STRONG";
  if (tag === "I") return "EM";
  if (tag === "DIV") return "P";
  return tag;
}

/**
 * Sanitisiert HTML gegen die Allow-List: entfernt verbotene Teilbäume, streift Attribute (inkl. on*-Handler,
 * style, javascript:-URLs), packt unbekannte Tags aus (Inhalt bleibt). Läuft über DOMParser — kein Dep, keine
 * Skript-Ausführung beim Parsen (DOMParser führt keine Skripte aus).
 */
function sanitizeHtml(dirty: string): string {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    // SSR/Test ohne DOM: konservativ alle Tags entfernen, nur Text behalten.
    return dirty.replace(/<[^>]*>/g, "").trim();
  }
  const doc = new DOMParser().parseFromString(`<body>${dirty}</body>`, "text/html");
  const body = doc.body;

  const walk = (node: Node): void => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.parentNode?.removeChild(child);
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue; // Textknoten bleiben
      const el = child as Element;
      const tag = el.tagName.toUpperCase();

      if (FORBIDDEN_SUBTREE.has(tag)) {
        el.parentNode?.removeChild(el);
        continue;
      }

      // Erst Kinder bereinigen.
      walk(el);

      if (!ALLOWED_TAGS.has(tag)) {
        // Unbekanntes Tag auspacken: Kinder an die Stelle des Elements heben.
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
        continue;
      }

      // Alle Attribute entfernen (keine href/src/style/on*/class) — reine Semantik.
      for (const attr of Array.from(el.attributes)) {
        el.removeAttribute(attr.name);
      }
      // Normalisieren (b→strong, i→em, div→p).
      const norm = normalizeTagName(tag);
      if (norm !== tag) {
        const repl = doc.createElement(norm);
        while (el.firstChild) repl.appendChild(el.firstChild);
        el.parentNode?.replaceChild(repl, el);
      }
    }
  };

  walk(body);
  return body.innerHTML.trim();
}

/** True, wenn der (bereits sanitisierte) Inhalt sichtbar leer ist. */
function isEmptyHtml(html: string): boolean {
  return html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]*>/g, "").replace(/\u00A0/g, "").trim()
    .length === 0;
}

// ── Toolbar-Definition (data-driven) ─────────────────────────────────────────────────────────────
type CommandKind = "inline" | "block" | "list" | "clear";

interface ToolItem {
  id: string;
  label: string;
  icon: ReactElement;
  command: string; // execCommand-Name
  value?: string; // optionaler Wert (z.B. formatBlock)
  kind: CommandKind;
  /** Tastatur-Kürzel-Buchstabe für Strg/Cmd (nur inline). */
  shortcut?: string;
}

const TOOLBAR: readonly ToolItem[] = [
  {
    id: "bold",
    label: "Fett",
    icon: <Bold className="h-4 w-4" aria-hidden="true" />,
    command: "bold",
    kind: "inline",
    shortcut: "b",
  },
  {
    id: "italic",
    label: "Kursiv",
    icon: <Italic className="h-4 w-4" aria-hidden="true" />,
    command: "italic",
    kind: "inline",
    shortcut: "i",
  },
  {
    id: "underline",
    label: "Unterstrichen",
    icon: <Underline className="h-4 w-4" aria-hidden="true" />,
    command: "underline",
    kind: "inline",
    shortcut: "u",
  },
  {
    id: "h2",
    label: "Überschrift",
    icon: <Heading2 className="h-4 w-4" aria-hidden="true" />,
    command: "formatBlock",
    value: "H2",
    kind: "block",
  },
  {
    id: "ul",
    label: "Aufzählung",
    icon: <List className="h-4 w-4" aria-hidden="true" />,
    command: "insertUnorderedList",
    kind: "list",
  },
  {
    id: "ol",
    label: "Nummerierte Liste",
    icon: <ListOrdered className="h-4 w-4" aria-hidden="true" />,
    command: "insertOrderedList",
    kind: "list",
  },
  {
    id: "clear",
    label: "Formatierung entfernen",
    icon: <Eraser className="h-4 w-4" aria-hidden="true" />,
    command: "removeFormat",
    kind: "clear",
  },
];

// ── Props ────────────────────────────────────────────────────────────────────────────────────────
export interface RichTextEditorProps {
  /** Aktueller Wert als HTML (wird vor der Anzeige sanitisiert). */
  value?: string;
  /** Liefert das sanitisierte HTML bei jeder Änderung. */
  onChange?: (html: string) => void;
  /** Sichtbares/zugängliches Label des Editors. */
  label?: string;
  /** Platzhalter, wenn leer. */
  placeholder?: string;
  /** Nur-Lesen-Modus (Toolbar deaktiviert, Feld nicht editierbar). */
  readOnly?: boolean;
  /** Mindesthöhe des Editierbereichs (CSS-Wert). Standard: "12rem". */
  minHeight?: string;
  /** id für Verknüpfung mit externem Label/Fehlertext. */
  id?: string;
  className?: string;
  /**
   * Optionaler Speicher-Status. Ist er gesetzt, zeigt der Editor eine einheitliche Fußzeile mit
   * <SaveIndicator/> und sagt Zustandswechsel zentral über useStatusRegion an. Bleibt er undefined,
   * verhält sich der Editor exakt wie bisher (keine Fußzeile, kein zusätzliches DOM).
   */
  saveStatus?: SaveStatus | undefined;
  /** Zeitpunkt des letzten Speicherns (ISO-String oder Date) — für „gespeichert vor X". */
  savedAt?: string | Date | undefined;
  /** „Jetzt speichern"-Handler. Aktiviert den passiven Speicher-Button für Nutzer ohne Autosave-Vertrauen. */
  onSaveNow?: (() => void) | undefined;
  /** Retry-Handler für den Fehlerfall (Pflicht-Recovery im SaveIndicator). Default: onSaveNow. */
  onRetrySave?: (() => void) | undefined;
}

// ── Komponente ─────────────────────────────────────────────────────────────────────────────────
export function RichTextEditor({
  value,
  onChange,
  label = "Textbearbeitung",
  placeholder = "Text eingeben …",
  readOnly = false,
  minHeight = "12rem",
  id,
  className,
  saveStatus,
  savedAt,
  onSaveNow,
  onRetrySave,
}: RichTextEditorProps): ReactElement {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const labelId = `${generatedId}-label`;
  const toolbarId = `${generatedId}-toolbar`;

  const editorRef = useRef<HTMLDivElement | null>(null);
  const [activeTool, setActiveTool] = useState(0); // Roving-Tabindex-Index in der Toolbar
  const [empty, setEmpty] = useState(true);
  const [execAvailable, setExecAvailable] = useState(true);

  // `document.execCommand` verfügbar? (In manchen Umgebungen entfernt.)
  useEffect(() => {
    setExecAvailable(
      typeof document !== "undefined" && typeof document.execCommand === "function",
    );
  }, []);

  // Speicher-Status zentral ansagen (eine Wahrheit). Nur aktiv, wenn saveStatus gesetzt ist.
  // „saving"/„saved" höflich (polite), „error" dringend (assertive) — Information nie nur über Farbe.
  const { announce } = useStatusRegion();
  useEffect(() => {
    if (saveStatus == null) return;
    if (saveStatus === "saving") announce("Speichert …");
    else if (saveStatus === "saved") announce("Entwurf gespeichert.");
    else if (saveStatus === "error") announce("Entwurf nicht gespeichert.", "assertive");
  }, [saveStatus, announce]);

  // Initialen/extern geänderten Wert sanitisiert ins Feld setzen — nur wenn er vom aktuellen DOM abweicht,
  // damit die Caret-Position während des Tippens nicht zurückspringt.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const incoming = sanitizeHtml(value ?? "");
    if (el.innerHTML !== incoming) {
      el.innerHTML = incoming;
    }
    setEmpty(isEmptyHtml(el.innerHTML));
  }, [value]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const clean = sanitizeHtml(el.innerHTML);
    setEmpty(isEmptyHtml(clean));
    onChange?.(clean);
  }, [onChange]);

  const focusEditor = () => editorRef.current?.focus();

  const runCommand = useCallback(
    (item: ToolItem) => {
      if (readOnly || !execAvailable || typeof document === "undefined") return;
      focusEditor();
      try {
        if (item.command === "formatBlock") {
          // Toggle: ist der Block bereits eine H2, zurück auf Absatz.
          const isHeading = document.queryCommandValue?.("formatBlock")?.toLowerCase() === "h2";
          document.execCommand("formatBlock", false, isHeading ? "P" : (item.value ?? "P"));
        } else {
          document.execCommand(item.command, false, item.value);
        }
      } catch {
        // Nicht unterstütztes Kommando ignorieren — Feld bleibt nutzbar.
      }
      emit();
    },
    [readOnly, execAvailable, emit],
  );

  /** Aktiver Zustand eines Umschalters (Fett/Kursiv/…) für `aria-pressed`. */
  const isActive = (item: ToolItem): boolean => {
    if (typeof document === "undefined" || !execAvailable) return false;
    try {
      if (item.command === "formatBlock") {
        return document.queryCommandValue?.("formatBlock")?.toLowerCase() === "h2";
      }
      if (item.kind === "inline" || item.kind === "list") {
        return document.queryCommandState?.(item.command) === true;
      }
    } catch {
      return false;
    }
    return false;
  };

  // Tastatur-Kürzel im Editierbereich (Strg/Cmd + B/I/U).
  const onEditorKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const item = TOOLBAR.find((t) => t.shortcut && t.shortcut === e.key.toLowerCase());
    if (item) {
      e.preventDefault();
      runCommand(item);
    }
  };

  // Roving-Tabindex-Navigation der Toolbar (Pfeil/Home/End).
  const onToolbarKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = TOOLBAR.length - 1;
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = activeTool >= last ? 0 : activeTool + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = activeTool <= 0 ? last : activeTool - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    setActiveTool(next);
    const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tool]");
    btns[next]?.focus();
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground",
        readOnly && "opacity-95",
        className,
      )}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      {/* Toolbar */}
      <div
        id={toolbarId}
        role="toolbar"
        aria-label={`${label}: Formatierung`}
        aria-controls={editorId}
        aria-orientation="horizontal"
        onKeyDown={onToolbarKeyDown}
        className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 p-1.5"
      >
        {TOOLBAR.map((item, i) => {
          const pressed = item.kind === "inline" || item.kind === "block" || item.kind === "list";
          const active = pressed && isActive(item);
          return (
            <button
              key={item.id}
              type="button"
              data-tool={item.id}
              tabIndex={i === activeTool ? 0 : -1}
              disabled={readOnly || !execAvailable}
              aria-label={item.label}
              title={item.label}
              {...(pressed ? { "aria-pressed": active } : {})}
              onClick={() => {
                setActiveTool(i);
                runCommand(item);
              }}
              // Fokus nicht ans Feld verlieren, bevor das Kommando läuft (Selection erhalten).
              onMouseDown={(e) => e.preventDefault()}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-foreground",
                "transition-colors duration-150 ease-out motion-reduce:transition-none",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-50",
                active && "border-border bg-accent text-accent-foreground",
              )}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* Editierbereich */}
      <div className="relative">
        <div
          ref={editorRef}
          id={editorId}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          aria-readonly={readOnly}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck
          tabIndex={0}
          onInput={emit}
          onBlur={emit}
          onKeyDown={onEditorKeyDown}
          style={{ minHeight }}
          className={cn(
            "w-full px-4 py-3 text-sm leading-relaxed text-foreground outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-inset",
            // Semantische Block-/Listen-Darstellung im Editierbereich.
            "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold",
            "[&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold",
            "[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-6",
            "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
            readOnly && "cursor-default",
          )}
        />
        {/* Platzhalter — rein dekorativ, blendet bei Inhalt aus. */}
        {empty && (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-3 select-none text-sm text-muted-foreground"
          >
            {placeholder}
          </p>
        )}
      </div>

      {/* Fallback-Hinweis, wenn die native Formatierung fehlt — Feld bleibt als Textfeld nutzbar. */}
      {!execAvailable && !readOnly && (
        <p
          role="status"
          className="border-t border-border px-4 py-2 text-[12px] text-status-warn"
        >
          Formatierung wird in dieser Umgebung nicht unterstützt — der Text lässt sich weiterhin
          eingeben und wird unformatiert gespeichert.
        </p>
      )}

      {/* Einheitliche Speicher-Status-Fußzeile — nur sichtbar, wenn ein saveStatus übergeben wird. */}
      {saveStatus != null && (
        <div className="flex items-center justify-end border-t border-border px-4 py-2">
          <SaveIndicator
            status={saveStatus}
            {...(savedAt != null ? { savedAt } : {})}
            {...(onRetrySave != null
              ? { onRetry: onRetrySave }
              : onSaveNow != null
                ? { onRetry: onSaveNow }
                : {})}
            {...(onSaveNow != null ? { onSaveNow } : {})}
          />
        </div>
      )}
    </div>
  );
}
