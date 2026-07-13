// components/WissensPanel — die interne WISSENSBASIS/WIKI (Wiki.js-inspiriert): Master-Detail über die `wissen`-
// Artikel (DATEN) des Workspace. Links die nach Kategorie gruppierte Navigation, rechts der gewählte Artikel über die
// EINE Markdown-Render-Schicht (`MarkdownView`: GFM + Highlighting + Mermaid). Rein präsentierend, generisch, vendor-
// neutral — Inhalte kommen ausschließlich aus der Config.
import { useMemo, useState, type ReactElement } from "react";
import { BookOpen } from "lucide-react";

import type { WissensArtikel, WissensRevision } from "../types.js";
import { cn } from "../lib/cn.js";
import { filtereWissen, hatHierarchie, wissensBaum } from "../lib/wissen.js";
import { wikiDiff, diffBilanz } from "../lib/wiki-diff.js";
import { EmptyState } from "./EmptyState.js";
import { MarkdownView } from "./MarkdownView.js";

export interface WissensPanelProps {
  /** Die Wissens-/Wiki-Artikel (aus `WorkspaceConfig.wissen`). */
  artikel: WissensArtikel[];
  /** Überschrift der Region. Default „Wissensbasis". */
  titel?: string;
  /** OPTIONAL Authoring (#20 Phase 3b): ist der Callback gesetzt, zeigt das Panel „Bearbeiten"/„Neuer Artikel" und
   *  ruft ihn beim Speichern. `expectedVersion` = die aktuelle `version` des Artikels (0 = Neuanlage) — der Port
   *  erzwingt damit Optimistic-Locking. OHNE den Callback bleibt es die reine Leseansicht (rückwärtskompatibel). */
  onSpeichern?: (input: {
    id: string;
    titel: string;
    markdown: string;
    kategorie?: string;
    expectedVersion: number;
  }) => void;
  /** OPTIONAL Verlauf/Diff (#20 Phase 4b): liefert die Revisionshistorie eines Artikels (neueste zuerst). Ist der
   *  Callback gesetzt, zeigt der aktive Artikel einen „Verlauf"-Tab mit Revisionsliste + Zeilen-Diff. OHNE ihn bleibt
   *  es die reine Artikelansicht (rückwärtskompatibel). */
  revisionen?: (articleId: string) => WissensRevision[];
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

/** Ein bearbeiteter/neuer Artikel im Formular. `id === null` ⇒ Neuanlage (id wird beim Speichern aus dem Titel
 *  abgeleitet); `expectedVersion` trägt die Optimistic-Lock-Version des Ausgangsartikels (0 = Neuanlage). */
interface Entwurf {
  id: string | null;
  titel: string;
  markdown: string;
  kategorie: string;
  expectedVersion: number;
}

/** Leitet aus dem Titel eine stabile, ASCII-nahe Artikel-Id ab (deutsche Umlaute transliteriert). Rein & deterministisch
 *  (kein Date/Random). Eine Kollision fängt der Server per 409 ab (→ onError im Port). */
function wissenSlug(titel: string): string {
  return titel
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const eingabeKlasse =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]";
const knopfPrimaer =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors ease-out motion-reduce:transition-none hover:bg-primary/90 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]";
const knopfSekundaer =
  "rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors ease-out motion-reduce:transition-none hover:bg-secondary/60 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]";
const selectKlasse =
  "rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]";
const tabKlasse = (aktiv: boolean): string =>
  cn(
    "rounded-md px-2.5 py-1 text-sm font-medium transition-colors ease-out motion-reduce:transition-none outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    aktiv
      ? "bg-primary text-primary-foreground"
      : "text-foreground hover:bg-secondary/60",
  );

/** Der „Verlauf"-Tab eines Artikels: Revisionsliste (neueste zuerst) + ein Zeilen-Diff zwischen zwei gewählten
 *  Revisionen. Die Diff-Zeilen sind ZEICHEN- (Prefix +/−/Leer) UND farbcodiert — die Zeichen-Codierung ist die
 *  barrierefreie Wahrheit (BITV; Farbe nur zusätzlich). Eigener State (von/bis) — beim Artikelwechsel via `key` frisch. */
function VerlaufDiff({
  revisionen,
}: {
  revisionen: WissensRevision[];
}): ReactElement {
  const neuesteV = revisionen[0]?.version ?? 0;
  const vorherigeV = revisionen[1]?.version ?? neuesteV;
  const [vonV, setVonV] = useState<number>(vorherigeV);
  const [bisV, setBisV] = useState<number>(neuesteV);

  if (revisionen.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Noch keine Revisionen — der Verlauf erscheint nach der ersten
        Speicherung.
      </p>
    );
  }

  const von =
    revisionen.find((r) => r.version === vonV) ??
    revisionen[revisionen.length - 1]!;
  const bis = revisionen.find((r) => r.version === bisV) ?? revisionen[0]!;
  const diff = wikiDiff(von.markdown, bis.markdown);
  const bilanz = diffBilanz(diff);

  return (
    <div className="space-y-4">
      <ol className="space-y-1" aria-label="Revisionen">
        {revisionen.map((r) => (
          <li
            key={r.version}
            className="flex flex-wrap items-baseline gap-x-2 text-sm"
          >
            <span className="font-medium text-foreground">v{r.version}</span>
            {standText(r.standIso) ? (
              <span className="text-xs text-muted-foreground">
                {standText(r.standIso)}
              </span>
            ) : null}
            {r.editorActorId ? (
              <span className="text-xs text-muted-foreground">
                · {r.editorActorId}
              </span>
            ) : null}
            {r.changeNote ? (
              <span className="text-xs text-muted-foreground">
                · {r.changeNote}
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {revisionen.length >= 2 ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="wissen-diff-von" className="text-foreground">
              Von
            </label>
            <select
              id="wissen-diff-von"
              value={vonV}
              onChange={(e) => setVonV(Number(e.target.value))}
              className={selectKlasse}
            >
              {revisionen.map((r) => (
                <option key={r.version} value={r.version}>
                  v{r.version}
                </option>
              ))}
            </select>
            <label htmlFor="wissen-diff-bis" className="text-foreground">
              Bis
            </label>
            <select
              id="wissen-diff-bis"
              value={bisV}
              onChange={(e) => setBisV(Number(e.target.value))}
              className={selectKlasse}
            >
              {revisionen.map((r) => (
                <option key={r.version} value={r.version}>
                  v{r.version}
                </option>
              ))}
            </select>
            <span className="text-xs tabular-nums">
              <span className="text-status-ok">+{bilanz.hinzu}</span>{" "}
              <span className="text-status-err">-{bilanz.weg}</span>
            </span>
          </div>

          <div
            className="overflow-x-auto rounded-md border border-border"
            role="group"
            aria-label="Zeilen-Diff"
          >
            {diff.map((z, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 whitespace-pre-wrap px-2 font-mono text-sm",
                  z.typ === "hinzu"
                    ? "bg-status-ok-soft text-status-ok"
                    : z.typ === "weg"
                      ? "text-status-err"
                      : "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className="w-3 shrink-0 select-none text-center"
                >
                  {z.typ === "hinzu" ? "+" : z.typ === "weg" ? "-" : " "}
                </span>
                {/* 1.4.1 — Diff-Art nicht nur über Farbe + (aria-hidden) Glyph: sr-only-Textpräfix je Zeile. */}
                {z.typ !== "gleich" ? (
                  <span className="sr-only">
                    {z.typ === "hinzu" ? "Hinzugefügt: " : "Entfernt: "}
                  </span>
                ) : null}
                <span>{z.zeile || " "}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nur eine Revision — ein Diff braucht mindestens zwei.
        </p>
      )}
    </div>
  );
}

/** Rendert die Wissensbasis als Master-Detail: gruppierte Artikel-Navigation + Markdown-Ansicht des gewählten Artikels. */
export function WissensPanel({
  artikel,
  titel = "Wissensbasis",
  onSpeichern,
  revisionen,
}: WissensPanelProps): ReactElement {
  const [aktivId, setAktivId] = useState<string>(artikel[0]?.id ?? "");
  const [suche, setSuche] = useState("");
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [ansicht, setAnsicht] = useState<"artikel" | "verlauf">("artikel");
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

  // ── Authoring (#20 Phase 3b): nur aktiv, wenn `onSpeichern` gesetzt ist ──
  const starteNeu = (): void =>
    setEntwurf({
      id: null,
      titel: "",
      markdown: "",
      kategorie: "",
      expectedVersion: 0,
    });
  const starteBearbeiten = (): void => {
    if (!aktiv) return;
    setEntwurf({
      id: aktiv.id,
      titel: aktiv.titel,
      markdown: aktiv.markdown,
      kategorie: aktiv.kategorie ?? "",
      expectedVersion: aktiv.version ?? 0,
    });
  };
  const speichere = (): void => {
    if (!entwurf || !onSpeichern) return;
    const titelTrim = entwurf.titel.trim();
    const id = entwurf.id ?? wissenSlug(titelTrim);
    // Leerer Titel oder (bei Neuanlage) leerer Slug → nicht speichern (der Server lehnt leeren Titel ohnehin 400 ab).
    if (!titelTrim || !id) return;
    onSpeichern({
      id,
      titel: titelTrim,
      markdown: entwurf.markdown,
      expectedVersion: entwurf.expectedVersion,
      ...(entwurf.kategorie.trim()
        ? { kategorie: entwurf.kategorie.trim() }
        : {}),
    });
    setEntwurf(null);
    if (entwurf.id === null) setAktivId(id); // neu angelegten Artikel gleich anwählen
  };

  // Editor-Ansicht (bearbeiten ODER neu) — verdrängt die Leseansicht, solange ein Entwurf offen ist.
  if (entwurf) {
    const neu = entwurf.id === null;
    return (
      <section className="mx-auto max-w-3xl p-4 md:p-6">
        <header className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">
            {neu ? "Neuer Wissensartikel" : "Artikel bearbeiten"}
          </h1>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            speichere();
          }}
          className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm"
        >
          <div className="space-y-1">
            <label
              htmlFor="wissen-titel"
              className="block text-sm font-medium text-foreground"
            >
              Titel
            </label>
            <input
              id="wissen-titel"
              value={entwurf.titel}
              onChange={(e) =>
                setEntwurf({ ...entwurf, titel: e.target.value })
              }
              className={eingabeKlasse}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="wissen-kategorie"
              className="block text-sm font-medium text-foreground"
            >
              Kategorie{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="wissen-kategorie"
              value={entwurf.kategorie}
              onChange={(e) =>
                setEntwurf({ ...entwurf, kategorie: e.target.value })
              }
              className={eingabeKlasse}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="wissen-markdown"
              className="block text-sm font-medium text-foreground"
            >
              Inhalt (Markdown)
            </label>
            <textarea
              id="wissen-markdown"
              value={entwurf.markdown}
              onChange={(e) =>
                setEntwurf({ ...entwurf, markdown: e.target.value })
              }
              rows={14}
              className={cn(eingabeKlasse, "font-mono")}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={knopfPrimaer}>
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setEntwurf(null)}
              className={knopfSekundaer}
            >
              Abbrechen
            </button>
          </div>
        </form>
      </section>
    );
  }

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
      <section className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
        <EmptyState
          icon={BookOpen}
          title="Keine Wissensartikel"
          description="Für diesen Workspace ist keine Wissensbasis hinterlegt."
        />
        {onSpeichern ? (
          <div className="text-center">
            <button type="button" onClick={starteNeu} className={knopfPrimaer}>
              Neuer Artikel
            </button>
          </div>
        ) : null}
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
        {onSpeichern ? (
          <button
            type="button"
            onClick={starteNeu}
            className={cn(knopfSekundaer, "ml-auto")}
          >
            Neuer Artikel
          </button>
        ) : null}
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
              <div className="mb-3 flex items-start justify-between gap-2 border-b border-border pb-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">
                    {aktiv.titel}
                  </h2>
                  {standText(aktiv.standIso) ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Stand: {standText(aktiv.standIso)}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {revisionen ? (
                    <div
                      role="tablist"
                      aria-label="Ansicht"
                      className="flex gap-1"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={ansicht === "artikel"}
                        onClick={() => setAnsicht("artikel")}
                        className={tabKlasse(ansicht === "artikel")}
                      >
                        Artikel
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={ansicht === "verlauf"}
                        onClick={() => setAnsicht("verlauf")}
                        className={tabKlasse(ansicht === "verlauf")}
                      >
                        Verlauf
                      </button>
                    </div>
                  ) : null}
                  {onSpeichern ? (
                    <button
                      type="button"
                      onClick={starteBearbeiten}
                      className={knopfSekundaer}
                    >
                      Bearbeiten
                    </button>
                  ) : null}
                </div>
              </div>
              {revisionen && ansicht === "verlauf" ? (
                <div role="tabpanel" aria-label="Verlauf">
                  {/* key=aktiv.id → beim Artikelwechsel wird die von/bis-Auswahl frisch initialisiert */}
                  <VerlaufDiff
                    key={aktiv.id}
                    revisionen={revisionen(aktiv.id)}
                  />
                </div>
              ) : (
                <div
                  role={revisionen ? "tabpanel" : undefined}
                  aria-label={revisionen ? "Artikel" : undefined}
                >
                  <MarkdownView>{aktiv.markdown}</MarkdownView>
                </div>
              )}
            </>
          ) : null}
        </article>
      </div>
    </section>
  );
}
