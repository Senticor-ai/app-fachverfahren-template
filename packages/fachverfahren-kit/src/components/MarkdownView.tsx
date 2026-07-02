// MarkdownView — advanced Markdown-Anzeige für das Kit (GFM + Syntax-Highlighting + eingebettete Mermaid-Diagramme).
// Aus einer produktionserprobten Builder-Render-Schicht portiert: GFM (Tabellen/Task-Lists/Strikethrough), highlight.js, ```mermaid →
// MermaidView (ELK/Zoom). Generisch, token-vereinheitlicht, barrierefrei. Deps MIT (react-markdown/remark-gfm/
// rehype-highlight/highlight.js).
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { MermaidView } from "./MermaidView.js";
// HINWEIS: für farbiges Syntax-Highlighting importiert die KONSUMIERENDE App ein highlight.js-Theme, z. B.
//   import "highlight.js/styles/atom-one-dark.css";
// (Bibliotheken importieren kein CSS — das übernimmt der App-Bundler. Ohne Theme bleiben Code-Blöcke schlicht lesbar.)

interface Props {
  children: string;
  /** Kompakter Modus (Karten-Bodies/Inspector) — weniger Vertical-Rhythm. */
  compact?: boolean;
  className?: string;
}

/** Die EINE Markdown-Render-Schicht: GFM + Highlighting + Mermaid, auf den Kit-Tokens. */
export function MarkdownView({ children, compact, className }: Props) {
  return (
    <div
      className={[
        "gt-md text-foreground/85 leading-relaxed text-pretty",
        compact ? "text-sm" : "text-sm",
        className ?? "",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={components(compact)}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
/** Alias. */
export const Markdown = MarkdownView;

function components(compact: boolean | undefined): Components {
  const mt = compact ? "mt-2" : "mt-3";
  return {
    h1: ({ children }) => (
      <h1
        className={`font-semibold text-xl leading-tight ${mt} mb-1.5 text-foreground`}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={`font-semibold text-lg leading-tight ${mt} mb-1.5 text-foreground`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={`font-semibold text-base leading-snug ${mt} mb-1 text-foreground`}
      >
        {children}
      </h3>
    ),
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }) => (
      <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-snug">{children}</li>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-border pl-3 my-2 text-foreground/70 italic">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-3 border-border" />,
    img: ({ src, alt }) => (
      <a
        href={typeof src === "string" ? src : undefined}
        target="_blank"
        rel="noreferrer"
        className="block my-3 rounded-lg overflow-hidden ring-1 ring-border bg-surface-2/40 hover:ring-foreground/30 transition"
      >
        <img
          src={typeof src === "string" ? src : undefined}
          alt={alt ?? ""}
          loading="lazy"
          className="block w-full h-auto"
        />
        {alt && (
          <span className="block px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
            {alt}
          </span>
        )}
      </a>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto rounded-md ring-1 ring-border">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-surface-2/60">{children}</thead>
    ),
    tr: ({ children }) => (
      <tr className="border-b border-border last:border-b-0">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="text-left font-medium px-2.5 py-1.5 text-foreground/80">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-2.5 py-1.5 align-top">{children}</td>
    ),
    code: ({ children }: { children?: ReactNode }) => (
      <code className="font-mono text-sm bg-surface-2 ring-1 ring-border px-1 py-0.5 rounded text-foreground">
        {children}
      </code>
    ),
    pre: (props) => {
      const node = (props as { node?: HastNode }).node;
      const codeNode = node?.children?.find(
        (child) => child?.tagName === "code",
      );
      const classNames = codeNode?.properties?.className ?? [];
      const className = Array.isArray(classNames)
        ? classNames.join(" ")
        : String(classNames ?? "");
      const lang = /language-([\w-]+)/.exec(className)?.[1] ?? "";
      const text = hastText(codeNode).replace(/\n$/, "");
      if (lang === "mermaid") return <MermaidView code={text} />;
      return <CodeBlock lang={lang}>{text}</CodeBlock>;
    },
  };
}

interface HastNode {
  type?: string;
  value?: unknown;
  tagName?: string;
  properties?: { className?: string | string[] };
  children?: HastNode[];
}

function hastText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return String(node.value ?? "");
  if (!Array.isArray(node.children)) return "";
  return node.children.map(hastText).join("");
}

function CodeBlock({ lang, children }: { lang: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };
  return (
    <div className="my-2 rounded-lg overflow-hidden ring-1 ring-foreground/10 bg-[oklch(0.16_0.008_70)] text-[oklch(0.9_0.01_85)]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-foreground/10 text-xs uppercase tracking-[0.14em] opacity-70">
        <span className="font-mono">{lang || "code"}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 hover:opacity-100 opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm"
          aria-label="Code kopieren"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "kopiert" : "kopieren"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-sm leading-relaxed font-mono">
        <code className={`language-${lang || "plaintext"}`}>{children}</code>
      </pre>
    </div>
  );
}
