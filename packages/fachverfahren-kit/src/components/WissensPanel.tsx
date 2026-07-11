// components/WissensPanel — die interne WISSENSBASIS/WIKI (Wiki.js-inspiriert): Master-Detail über die `wissen`-
// Artikel (DATEN) des Workspace. Links die nach Kategorie gruppierte Navigation, rechts der gewählte Artikel über die
// EINE Markdown-Render-Schicht (`MarkdownView`: GFM + Highlighting + Mermaid). Rein präsentierend, generisch, vendor-
// neutral — Inhalte kommen ausschließlich aus der Config.
import { useMemo, useState, type ReactElement } from "react";
import { BookOpen } from "lucide-react";

import type { WissensArtikel } from "../types.js";
import { cn } from "../lib/cn.js";
import { filtereWissen, hatHierarchie, wissensBaum } from "../lib/wissen.js";
import { EmptyState } from "./EmptyState.js";
import { MarkdownView } from "./MarkdownView.js";

export interface WissensPanelProps {
  /** Die Wissens-/Wiki-Artikel (aus `WorkspaceConfig.wissen`). */
  artikel: WissensArtikel[];
  /** Überschrift der Region. Default „Wissensbasis". */
  titel?: string;
}

const stand = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});
function standText(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : stand.format(d);
}

/** Rendert die Wissensbasis als Master-Detail: gruppierte Artikel-Navigation + Markdown-Ansicht des gewählten Artikels. */
export function WissensPanel({
  artikel,
  titel = "Wissensbasis",
}: WissensPanelProps): ReactElement {
  const [aktivId, setAktivId] = useState<string>(artikel[0]?.id ?? "");
  const [suche, setSuche] = useState("");
  const suchend = suche.trim() !== "";

  const gefiltert = useMemo(
    () => filtereWissen(artikel, suche),
    [artikel, suche],
  );
  // Beim Suchen dem ersten Treffer folgen, wenn der aktuell gewählte Artikel nicht (mehr) im Filter ist.
  const aktivKandidat = artikel.find((a) => a.id === aktivId) ?? artikel[0];
  const aktiv =
    suchend && !gefiltert.some((a) => a.id === aktivId)
      ? (gefiltert[0] ?? aktivKandidat)
      : aktivKandidat;

  const benutzeBaum = useMemo(() => hatHierarchie(artikel), [artikel]);
  const baum = useMemo(() => wissensBaum(artikel), [artikel]);

  // Nach Kategorie gruppieren (stabile Einfüge-Reihenfolge) — der flache Fallback ohne Hierarchie.
  const gruppen = useMemo(() => {
    const m = new Map<string, WissensArtikel[]>();
    for (const a of artikel) {
      const k = a.kategorie ?? "Allgemein";
      const liste = m.get(k);
      if (liste) liste.push(a);
      else m.set(k, [a]);
    }
    return [...m.entries()];
  }, [artikel]);

  const artikelButton = (a: WissensArtikel, tiefe: number): ReactElement => {
    const aktivEintrag = a.id === (aktiv?.id ?? "");
    return (
      <li key={a.id}>
        <button
          type="button"
          onClick={() => setAktivId(a.id)}
          aria-current={aktivEintrag ? "true" : undefined}
          style={
            tiefe > 0 ? { paddingLeft: `${0.5 + tiefe * 0.85}rem` } : undefined
          }
          className={cn(
            "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ease-out motion-reduce:transition-none",
            "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            aktivEintrag
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-secondary/60",
          )}
        >
          {a.titel}
        </button>
      </li>
    );
  };

  if (artikel.length === 0) {
    return (
      <section className="mx-auto max-w-4xl p-4 md:p-6">
        <EmptyState
          icon={BookOpen}
          title="Keine Wissensartikel"
          description="Für diesen Workspace ist keine Wissensbasis hinterlegt."
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-foreground">{titel}</h1>
        <span className="text-sm text-muted-foreground">
          · {artikel.length} {artikel.length === 1 ? "Artikel" : "Artikel"}
        </span>
      </header>

      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        {/* Master: Suche + Navigation (Suchtreffer flach · sonst Baum bei Hierarchie · sonst Kategorie-Gruppen) */}
        <nav aria-label="Wissensartikel" className="space-y-3">
          <input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Wissen durchsuchen …"
            aria-label="Wissensbasis durchsuchen"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          {gefiltert.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground" role="status">
              Keine Treffer für „{suche.trim()}".
            </p>
          ) : suchend ? (
            <ul className="space-y-0.5">
              {gefiltert.map((a) => artikelButton(a, 0))}
            </ul>
          ) : benutzeBaum ? (
            <ul className="space-y-0.5">
              {baum.map(({ artikel: a, tiefe }) => artikelButton(a, tiefe))}
            </ul>
          ) : (
            gruppen.map(([kategorie, liste]) => (
              <div key={kategorie}>
                <h2 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {kategorie}
                </h2>
                <ul className="space-y-0.5">
                  {liste.map((a) => artikelButton(a, 0))}
                </ul>
              </div>
            ))
          )}
        </nav>

        {/* Detail: der gewählte Artikel */}
        <article className="min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm">
          {aktiv ? (
            <>
              <div className="mb-3 border-b border-border pb-3">
                <h2 className="text-lg font-semibold text-foreground">
                  {aktiv.titel}
                </h2>
                {standText(aktiv.standIso) ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Stand: {standText(aktiv.standIso)}
                  </p>
                ) : null}
              </div>
              <MarkdownView>{aktiv.markdown}</MarkdownView>
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}
