// FileBrowser — generischer Akten-/Dokumenten-Explorer (Ordner-Baum + Dateien mit Metadaten + Aktionen). Config/props-
// getrieben (eine FileNode-Baumstruktur + Callbacks), token-vereinheitlicht, barrierefrei (WAI-ARIA Tree), dep-frei.
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File as FileIcon,
  Search,
  Download,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "../lib/utils.js";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  size?: number;
  mime?: string;
  /** ISO-Datum (kein Date.now im Kit). */
  modified?: string;
  children?: FileNode[];
}

interface Props {
  nodes: FileNode[];
  onOpen?: (node: FileNode) => void;
  onDownload?: (node: FileNode) => void;
  onDelete?: (node: FileNode) => void;
  onRename?: (node: FileNode) => void;
  title?: string;
  emptyHint?: string;
  className?: string;
}

function formatSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Filtert den Baum: behält Knoten, deren Name passt ODER die passende Nachfahren haben (Ordner-Kontext erhalten). */
function filterTree(nodes: FileNode[], q: string): FileNode[] {
  if (!q) return nodes;
  const ql = q.toLowerCase();
  const walk = (list: FileNode[]): FileNode[] =>
    list.flatMap((n) => {
      if (n.type === "folder") {
        const kids = walk(n.children ?? []);
        if (kids.length || n.name.toLowerCase().includes(ql))
          return [{ ...n, children: kids }];
        return [];
      }
      return n.name.toLowerCase().includes(ql) ? [n] : [];
    });
  return walk(nodes);
}

export function FileBrowser({
  nodes,
  onOpen,
  onDownload,
  onDelete,
  onRename,
  title = "Dateien",
  emptyHint = "Keine Dateien vorhanden.",
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const filtered = useMemo(() => filterTree(nodes, query), [nodes, query]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const Row = ({ node, depth }: { node: FileNode; depth: number }) => {
    const isFolder = node.type === "folder";
    const isOpen = open.has(node.id) || !!query; // bei aktiver Suche alles aufklappen
    const isSel = selected === node.id;
    return (
      <li
        role="treeitem"
        aria-expanded={isFolder ? isOpen : undefined}
        aria-selected={isSel}
      >
        <div
          className={cn(
            "group flex items-center gap-1.5 rounded-md py-1 pr-1.5 text-sm transition-colors duration-150 ease-out motion-reduce:transition-none",
            isSel
              ? "bg-accent text-foreground"
              : "hover:bg-accent/60 text-foreground/90",
          )}
          style={{ paddingLeft: 6 + depth * 16 }}
        >
          <button
            type="button"
            onClick={() => {
              setSelected(node.id);
              if (isFolder) toggle(node.id);
              else onOpen?.(node);
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm"
            aria-label={`${isFolder ? "Ordner" : "Datei"} ${node.name}`}
          >
            {isFolder ? (
              <>
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                    isOpen && "rotate-90",
                  )}
                  aria-hidden
                />
                {isOpen ? (
                  <FolderOpen
                    className="size-4 shrink-0 text-status-warn"
                    aria-hidden
                  />
                ) : (
                  <Folder
                    className="size-4 shrink-0 text-status-warn"
                    aria-hidden
                  />
                )}
              </>
            ) : (
              <>
                <span className="size-3.5 shrink-0" />
                <FileIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </>
            )}
            <span className="truncate">{node.name}</span>
            {!isFolder && (node.size != null || node.modified) && (
              <span className="ml-2 shrink-0 text-xs text-muted-foreground tabular-nums">
                {[formatSize(node.size), node.modified]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </button>
          {!isFolder && (
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {onDownload && (
                <IconBtn
                  icon={Download}
                  label="Herunterladen"
                  onClick={() => onDownload(node)}
                />
              )}
              {onRename && (
                <IconBtn
                  icon={Pencil}
                  label="Umbenennen"
                  onClick={() => onRename(node)}
                />
              )}
              {onDelete && (
                <IconBtn
                  icon={Trash2}
                  label="Löschen"
                  onClick={() => onDelete(node)}
                  danger
                />
              )}
            </span>
          )}
        </div>
        {isFolder && isOpen && node.children && node.children.length > 0 && (
          <ul role="group" className="list-none">
            {node.children.map((c) => (
              <Row key={c.id} node={c} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <div className="relative ml-auto">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen …"
            aria-label="Dateien durchsuchen"
            className="h-8 w-40 rounded-md border border-input bg-background pl-7 pr-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
          {query ? "Keine Treffer." : emptyHint}
        </div>
      ) : (
        <ul
          role="tree"
          aria-label={title}
          className="max-h-[28rem] list-none overflow-auto p-1.5"
        >
          {filtered.map((n) => (
            <Row key={n.id} node={n} depth={0} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        danger && "hover:text-status-block",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
