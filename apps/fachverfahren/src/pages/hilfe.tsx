// /hilfe — das In-App Doc-Wiki: die KOMPLETTE Repo-Doku (README · AGENTS · CONTRIBUTING · docs/ · Skills)
// direkt im laufenden Golden Template aufrufbar — fuer Mensch UND KI-Agent. Quelle ist das generierte
// docs-manifest (emit:docs). Lazy geladen (grosses Manifest -> eigener Chunk, kein Haupt-Bundle-Bloat).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MarkdownView } from "@senticor/fachverfahren-kit";
import { DOCS, type DocEntry } from "../docs/docs-manifest.generated.js";

export function HilfePage(): React.JSX.Element {
  const [aktiv, setAktiv] = useState<string>(DOCS[0]?.id ?? "");
  const [suche, setSuche] = useState("");

  const gefiltert = useMemo<DocEntry[]>(() => {
    const q = suche.trim().toLowerCase();
    if (q === "") return DOCS;
    return DOCS.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.path.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q),
    );
  }, [suche]);

  const nachKategorie = useMemo<[string, DocEntry[]][]>(() => {
    const map = new Map<string, DocEntry[]>();
    for (const d of gefiltert) {
      const list = map.get(d.category) ?? [];
      list.push(d);
      map.set(d.category, list);
    }
    return [...map.entries()];
  }, [gefiltert]);

  const doc = DOCS.find((d) => d.id === aktiv) ?? gefiltert[0] ?? DOCS[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Start
        </Link>
        <h1 className="text-base font-semibold">Doku-Wiki</h1>
        <span className="text-xs text-muted-foreground">
          {DOCS.length} Dokumente aus dem Repository (README · AGENTS · docs/ · Skills)
        </span>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6 md:flex-row">
        <nav aria-label="Dokumente" className="w-full shrink-0 md:w-72">
          <label htmlFor="doku-suche" className="sr-only">
            Doku durchsuchen
          </label>
          <input
            id="doku-suche"
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Doku durchsuchen…"
            className="mb-3 w-full rounded-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
            {nachKategorie.map(([kat, docs]) => (
              <div key={kat}>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {kat}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setAktiv(d.id)}
                        aria-current={d.id === doc?.id ? "true" : undefined}
                        className={`w-full rounded px-2 py-1 text-left text-sm ${
                          d.id === doc?.id
                            ? "bg-secondary text-secondary-foreground"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        {d.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {gefiltert.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Treffer für „{suche}".
              </p>
            ) : null}
          </div>
        </nav>
        <article className="min-w-0 flex-1">
          {doc ? (
            <>
              <div className="mb-2 text-xs text-muted-foreground">
                {doc.path}
              </div>
              <MarkdownView>{doc.content}</MarkdownView>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Keine Dokumente.</p>
          )}
        </article>
      </div>
    </div>
  );
}
