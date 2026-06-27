// MarkdownEditor — generischer Markdown-Editor mit Toolbar + Live-Vorschau (Split oder umschaltbar). Config/props-
// getrieben, token-vereinheitlicht, barrierefrei. Nutzt MarkdownView für die Vorschau. Dep-frei (Web-APIs).
import { useRef, useState } from "react";
import { Bold, Italic, Heading2, List, Link2, Code, Eye, Pencil } from "lucide-react";
import { cn } from "../lib/utils.js";
import { MarkdownView } from "./MarkdownView.js";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** "side" = Split (Desktop), "tab" = umschaltbar Bearbeiten/Vorschau. */
  preview?: "side" | "tab";
}

export function MarkdownEditor({ value, onChange, placeholder, className, preview = "side" }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const wrap = (before: string, after = before) => {
    const ta = ref.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + before.length, e + before.length); });
  };
  const prefixLines = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const next = value.slice(0, start) + value.slice(start, e).split("\n").map((l) => prefix + l).join("\n") + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => ta.focus());
  };

  const tools = [
    { icon: Bold, label: "Fett", run: () => wrap("**") },
    { icon: Italic, label: "Kursiv", run: () => wrap("_") },
    { icon: Heading2, label: "Überschrift", run: () => prefixLines("## ") },
    { icon: List, label: "Liste", run: () => prefixLines("- ") },
    { icon: Link2, label: "Link", run: () => wrap("[", "](https://)") },
    { icon: Code, label: "Code", run: () => wrap("`") },
  ];

  const editor = (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Markdown-Editor"
      className="h-full min-h-[12rem] w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
    />
  );
  const previewEl = (
    <div className="h-full overflow-auto p-3">
      <MarkdownView>{value || "_Keine Eingabe_"}</MarkdownView>
    </div>
  );

  return (
    <div className={cn("flex h-full min-h-[16rem] flex-col rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5" role="toolbar" aria-label="Formatierung">
        {tools.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={t.run}
            title={t.label}
            aria-label={t.label}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <t.icon className="size-4" aria-hidden />
          </button>
        ))}
        {preview === "tab" && (
          <div className="ml-auto inline-flex rounded-md border border-border p-0.5" role="tablist" aria-label="Ansicht">
            <button type="button" role="tab" aria-selected={tab === "edit"} onClick={() => setTab("edit")} className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === "edit" ? "bg-secondary text-foreground" : "text-muted-foreground")}><Pencil className="size-3" aria-hidden />Bearbeiten</button>
            <button type="button" role="tab" aria-selected={tab === "preview"} onClick={() => setTab("preview")} className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === "preview" ? "bg-secondary text-foreground" : "text-muted-foreground")}><Eye className="size-3" aria-hidden />Vorschau</button>
          </div>
        )}
      </div>
      {preview === "side" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-border md:grid-cols-2 md:divide-x">
          {editor}
          <div className="hidden md:block">{previewEl}</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{tab === "edit" ? editor : previewEl}</div>
      )}
    </div>
  );
}
