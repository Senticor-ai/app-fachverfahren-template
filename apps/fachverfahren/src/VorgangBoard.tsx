// VorgangBoard — das Kanban-Board des SB-Workspace (Phase 2 des PM-Upgrades).
//
// Spalten = Status (aus `boardSpalten` der Config). Karten lassen sich per MAUS ziehen (native HTML5-DnD) UND —
// BITV-Pflicht — vollständig ÜBER DIE TASTATUR bedienen: jede Karte trägt ein Aktionsmenü („Status ändern",
// „Priorität", „Zuweisen", „Nach oben/unten"), das exakt dieselben erlaubten Übergänge anbietet wie der Drag.
//
// SICHERHEIT: Ein Drag ändert NIE einen Vier-Augen-/Begründungspflichtigen Status automatisch — solche Übergänge
// werden abgewiesen und in die Prüfsicht geleitet (menschliche Vorlage, nie autonome Freigabe). Metadaten
// (Priorität/Zuweisung/Rang) tragen kein Gate. Server-Autorität folgt in Phase 3; hier spiegelt der DEV-Store die
// Guards für die UX.
import { useMemo, useState } from "react";
import { Check, ListTree, MoreHorizontal, PanelRightOpen } from "lucide-react";
import {
  AKTIVITAET_TYP_LABELS,
  AktivitaetsFeed,
  BEZIEHUNGS_TYP_LABELS,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FilterBar,
  KommentarThread,
  RelationPanel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusPill,
  boardSpalten,
  cn,
  boardKarten,
  boardWurzeln,
  erlaubteUebergaenge as erlaubteUebergaengeKit,
  kinderAnzahl,
  raengeFuerEinordnung,
  rankZwischen,
  unteraufgabenVon,
  type Aufgabe,
  type LeistungConfig,
  type TaskFilter,
  type Transition,
  type WorkspaceStore,
} from "@senticor/fachverfahren-kit";

export interface VorgangBoardProps {
  workspace: WorkspaceStore;
  onOpen: (procedureId: string, vorgangId: string) => void;
  aktuellerAkteur: string;
  /** Konkrete, zuweisbare Personen (Kollegen) für den Assignee-Picker. In PROD aus der Zuständigkeit (actor_roles);
   *  im DEV die umschaltbaren Demo-Akteure. Leer = nur „mir zuweisen"/„entfernen". */
  zuweisbareAkteure?: readonly { id: string; name: string }[];
}

const ROLLE = "sachbearbeitung";

type Zuweisungsmodus = "alle" | "meine" | "niemand";

export function VorgangBoard({
  workspace,
  onOpen,
  aktuellerAkteur,
  zuweisbareAkteure = [],
}: VorgangBoardProps): React.JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null);
  const [meldung, setMeldung] = useState("");
  // Task-Detail-Drawer (Vermerke/Aktivität/Beziehungen). Die Daten kommen aus dem WorkspacePort (DEV: in-memory,
  // reaktiv über den Store-Snapshot; PROD: dieselbe Schnittstelle gegen die Server-Routen).
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? workspace.getTask(detailId) : undefined;
  // Sub-Issues (Unteraufgaben): Eingabe + Fehler beim Anlegen. `createFreieAufgabe` kann in einer nicht-
  // unterstützten Datenquelle (HTTP-PROD) werfen — im Event-Handler abfangen (keine Error-Boundary).
  const [subTitel, setSubTitel] = useState("");
  const [subFehler, setSubFehler] = useState<string | null>(null);

  const prioritaeten = workspace.config.prioritaeten;
  const labels = workspace.config.labels;

  // ── Filter (dieselben Achsen wie die Liste: Suche + Priorität + Zuweisung) — das Board zeigt nur die passenden
  //    Karten; die Spalten-Zähler spiegeln die gefilterte Menge. Rein clientseitig über denselben `TaskFilter`.
  const [suche, setSuche] = useState("");
  const [prioAktiv, setPrioAktiv] = useState<Set<string>>(new Set());
  const [zuweisung, setZuweisung] = useState<Zuweisungsmodus>("alle");
  const filter = useMemo<TaskFilter>(() => {
    const f: TaskFilter = {};
    if (suche.trim()) f.suche = suche.trim();
    if (prioAktiv.size) f.prioritaet = [...prioAktiv];
    if (zuweisung === "meine") f.zugewiesenAn = aktuellerAkteur;
    if (zuweisung === "niemand") f.zugewiesenAn = "$niemand";
    return f;
  }, [suche, prioAktiv, zuweisung, aktuellerAkteur]);
  const hatFilter =
    suche.trim().length > 0 || prioAktiv.size > 0 || zuweisung !== "alle";
  const zuruecksetzen = (): void => {
    setSuche("");
    setPrioAktiv(new Set());
    setZuweisung("alle");
  };
  const togglePrio = (key: string): void =>
    setPrioAktiv((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ── Gespeicherte Board-Ansichten: der aktuelle Filter als benannte Ansicht (layout="board", getrennt von den
  //    Listen-Ansichten — dieselbe Store-Naht, nach `layout` skopiert, damit sich die Sichten nicht vermischen).
  const [viewName, setViewName] = useState("");
  const gespeicherte = workspace
    .listSavedViews()
    .filter((v) => v.layout === "board");
  const speichereAnsicht = (): void => {
    const label = viewName.trim();
    if (!label) return;
    workspace.saveView({
      label,
      layout: "board",
      definition: { ...filter } as Record<string, unknown>,
    });
    setViewName("");
  };
  const wendeAnsichtAn = (def: Record<string, unknown>): void => {
    const f = def as TaskFilter;
    setSuche(typeof f.suche === "string" ? f.suche : "");
    setPrioAktiv(new Set(Array.isArray(f.prioritaet) ? f.prioritaet : []));
    setZuweisung(
      f.zugewiesenAn === "$niemand"
        ? "niemand"
        : f.zugewiesenAn === aktuellerAkteur
          ? "meine"
          : "alle",
    );
  };

  // Board-Achse Status: die Spalten des PRIMÄREN Verfahrens (State-Group-Normalisierung über mehrere Verfahren ist
  // eine spätere Ausbaustufe). Eine Auffang-Spalte „Weitere" fängt Status, die keiner Spalte entsprechen.
  const primary = workspace.verfahren()[0];
  const primaryConfig = primary
    ? (workspace.configFor(primary.procedureId) as LeistungConfig)
    : undefined;
  const spalten = useMemo(
    () => (primaryConfig ? boardSpalten(primaryConfig, prioritaeten) : []),
    [primaryConfig, prioritaeten],
  );

  const alleUngefiltert = workspace.listTasks();
  // Board zeigt Board-Wurzeln als eigene Karten; Kinder mit SICHTBAREM Parent nur im Detail (kein Doppel-Eintrag).
  // `boardKarten` promotet aber ein gefiltertes Kind zur eigenen Karte, wenn sein Parent weggefiltert ist — sonst
  // verschwände eine filter-treffende Unteraufgabe unsichtbar/unerreichbar (z. B. „Nur meine", Kind mir zugewiesen,
  // Parent nicht). Kind-Anzahl fürs Rollup-Badge aus dem Gesamtbestand.
  const alle = boardKarten(alleUngefiltert, workspace.listTasks(filter));
  // Zähler-Bezug = Top-Level-Wurzeln, aber nie kleiner als die sichtbaren Karten (promotete Kinder), damit die
  // FilterBar nie ein widersprüchliches „X von <X" zeigt.
  const gesamt = Math.max(boardWurzeln(alleUngefiltert).length, alle.length);
  const kinder = kinderAnzahl(alleUngefiltert);
  const statusOf = (a: Aufgabe): string | undefined =>
    a.vorgangId
      ? workspace.portFor(a.procedureId)?.get(a.vorgangId)?.status
      : undefined;
  const statesOf = (a: Aufgabe) =>
    workspace.configFor(a.procedureId)?.statusMachine.states ?? [];
  const prioDef = (key?: string) =>
    key ? prioritaeten.find((p) => p.key === key) : undefined;
  const labelDef = (key: string) => labels.find((l) => l.key === key);

  const spaltenKeys = new Set(spalten.map((s) => s.key));
  const inSpalte = (statusKey: string): string =>
    spaltenKeys.has(statusKey) ? statusKey : "__weitere";
  // Aufgaben je Spalte (nach Rang sortiert — listTasks liefert bereits Rang-Ordnung).
  const jeSpalte = new Map<string, Aufgabe[]>();
  for (const s of spalten) jeSpalte.set(s.key, []);
  jeSpalte.set("__weitere", []);
  for (const a of alle) {
    const st = statusOf(a) ?? "__weitere";
    jeSpalte.get(inSpalte(st))!.push(a);
  }
  const weitere = jeSpalte.get("__weitere")!;

  // Eine Wahrheit: die reine `erlaubteUebergaenge` aus dem Kit (rollen-gefiltert wie im EntscheidungPanel).
  const erlaubteUebergaenge = (a: Aufgabe, vonStatus: string): Transition[] =>
    erlaubteUebergaengeKit(
      workspace.configFor(a.procedureId)?.statusMachine,
      vonStatus,
      ROLLE,
    );

  /** Fachlicher Statuswechsel — mit Guards: unerlaubt → Hinweis; Vier-Augen/Begründungspflicht → in die Prüfung. */
  const versucheUebergang = (a: Aufgabe, zielStatus: string): void => {
    const vonStatus = statusOf(a);
    if (!vonStatus || vonStatus === zielStatus) return;
    const trans = erlaubteUebergaenge(a, vonStatus).find(
      (t) => t.to === zielStatus,
    );
    if (!trans) {
      setMeldung(
        `Verschieben nach „${zielLabel(a, zielStatus)}" ist von hier nicht möglich.`,
      );
      return;
    }
    if (trans.vierAugen || trans.detailPflicht) {
      setMeldung(
        `„${trans.label}" erfordert eine Prüfung/Begründung — der Vorgang wird geöffnet.`,
      );
      if (a.procedureId && a.vorgangId) onOpen(a.procedureId, a.vorgangId);
      return;
    }
    try {
      workspace.taskUebergang(
        a.id,
        zielStatus,
        ROLLE,
        undefined,
        aktuellerAkteur,
      );
      setMeldung(`„${trans.label}" ausgeführt.`);
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : "Übergang fehlgeschlagen.");
    }
  };

  const zielLabel = (a: Aufgabe, statusKey: string): string =>
    statesOf(a).find((s) => s.key === statusKey)?.label ?? statusKey;

  /** Rang neu setzen, um `a` VOR der Karte `vorZielId` (oder ans Ende, `null`) in `zielKarten` einzuordnen. Nutzt
   *  die reine Kit-Funktion `raengeFuerEinordnung` (entfernt `a` und nimmt die TATSÄCHLICHEN Nachbarn — kein
   *  Off-by-one aus der Voll-Liste). Rein-defensiv: rankZwischen kann bei zu dichten Nachbarn werfen → Meldung. */
  const ordneEin = (
    a: Aufgabe,
    zielKarten: Aufgabe[],
    vorZielId: string | null,
  ): void => {
    const { vorher, nachher } = raengeFuerEinordnung(
      zielKarten,
      a.id,
      vorZielId,
    );
    try {
      const rang = rankZwischen(vorher, nachher);
      workspace.move(a.id, a.boardSpalte, rang, a.version);
    } catch (e) {
      setMeldung(
        e instanceof Error ? e.message : "Verschieben fehlgeschlagen.",
      );
    }
  };

  const dropAufSpalte = (spalteKey: string): void => {
    if (!dragId) return;
    const a = workspace.getTask(dragId);
    setDragId(null);
    if (!a || spalteKey === "__weitere") return;
    const vonStatus = statusOf(a);
    if (vonStatus === spalteKey) {
      // Gleiche Spalte, leerer Bereich → ans Ende (vorZielId = null).
      ordneEin(a, jeSpalte.get(spalteKey) ?? [], null);
    } else {
      versucheUebergang(a, spalteKey);
    }
  };

  const dropAufKarte = (ziel: Aufgabe): void => {
    if (!dragId || dragId === ziel.id) {
      setDragId(null);
      return;
    }
    const a = workspace.getTask(dragId);
    setDragId(null);
    if (!a) return;
    const zielStatus = statusOf(ziel);
    const vonStatus = statusOf(a);
    if (!zielStatus) return;
    if (zielStatus === vonStatus) {
      // Drop AUF eine Karte → `a` VOR diese Zielkarte einordnen (die Kit-Funktion rechnet den Index korrekt aus
      // der Liste OHNE `a` — früher übergab dieser Aufruf den Voll-Listen-Index und ordnete abwärts 1 zu tief ein).
      ordneEin(a, jeSpalte.get(inSpalte(zielStatus)) ?? [], ziel.id);
    } else {
      versucheUebergang(a, zielStatus);
    }
  };

  const reihenfolge = (a: Aufgabe, richtung: -1 | 1): void => {
    // Auch verfahrens-freie Aufgaben (ohne Status → „__weitere"-Spalte) lassen sich neu ordnen — Rang ist Metadaten.
    const spalte = inSpalte(statusOf(a) ?? "__weitere");
    const karten = jeSpalte.get(spalte) ?? [];
    const idx = karten.findIndex((k) => k.id === a.id);
    if (idx < 0) return;
    const zielIdx = idx + richtung;
    if (zielIdx < 0 || zielIdx >= karten.length) return;
    // „nach oben" → vor den unmittelbaren Vorgänger; „nach unten" → vor die Karte ZWEI Positionen weiter (bzw. ans
    // Ende, wenn `a` vorletzt ist). Dieselbe eindeutige `vorZielId`-Semantik wie beim Drop → eine Einordnungs-Wahrheit.
    const vorZielId =
      (richtung === -1 ? karten[idx - 1] : karten[idx + 2])?.id ?? null;
    ordneEin(a, karten, vorZielId);
  };

  return (
    <div className="p-4 md:p-6">
      <header className="mb-3">
        <h1 className="text-xl font-semibold text-foreground">Board</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ziehen Sie Karten zwischen den Spalten — oder nutzen Sie das
          Aktionsmenü jeder Karte (vollständig per Tastatur bedienbar).
        </p>
      </header>

      <FilterBar
        value={suche}
        onValueChange={setSuche}
        placeholder="Karten durchsuchen…"
        resultCount={alle.length}
        totalCount={gesamt}
        hasActiveFilters={hatFilter}
        onReset={zuruecksetzen}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <fieldset className="flex flex-wrap items-center gap-1.5">
              <legend className="sr-only">Nach Priorität filtern</legend>
              {prioritaeten.map((p) => {
                const aktiv = prioAktiv.has(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={aktiv}
                    onClick={() => togglePrio(p.key)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors motion-reduce:transition-none ${
                      aktiv
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </fieldset>
            <Select
              value={zuweisung}
              onValueChange={(v) => setZuweisung(v as Zuweisungsmodus)}
            >
              <SelectTrigger
                className="ml-1 h-8 w-44 text-xs"
                aria-label="Nach Zuweisung filtern"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Zuweisungen</SelectItem>
                <SelectItem value="meine">Nur meine</SelectItem>
                <SelectItem value="niemand">Nicht zugewiesen</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Gespeicherte Board-Ansichten: aktuellen Filter benannt sichern, per Klick anwenden, löschen. */}
      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Ansichten:
        </span>
        {gespeicherte.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            keine gespeichert
          </span>
        ) : (
          gespeicherte.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pe-1 ps-2.5 text-xs"
            >
              <button
                type="button"
                onClick={() => wendeAnsichtAn(v.definition)}
                className="font-medium text-foreground hover:underline"
              >
                {v.label}
              </button>
              <button
                type="button"
                onClick={() => workspace.deleteView(v.id)}
                aria-label={`Ansicht ${v.label} löschen`}
                className="rounded-full px-1 text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </span>
          ))
        )}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <input
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          placeholder="Aktuelle Ansicht benennen…"
          aria-label="Name der zu speichernden Board-Ansicht"
          className="h-7 w-44 rounded-md border border-border bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!viewName.trim()}
          onClick={speichereAnsicht}
        >
          Speichern
        </Button>
      </div>

      {/* Live-Region: Ergebnis jeder Aktion (auch abgelehnter Move) wird angesagt. */}
      <p aria-live="assertive" className="sr-only">
        {meldung}
      </p>
      {meldung ? (
        <div
          role="status"
          className="mb-3 rounded-md border border-status-info/30 bg-status-info-soft px-3 py-2 text-sm text-foreground"
        >
          {meldung}
        </div>
      ) : null}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {[
          ...spalten,
          ...(weitere.length
            ? [{ key: "__weitere", label: "Weitere", tone: undefined }]
            : []),
        ].map((spalte) => {
          const karten = jeSpalte.get(spalte.key) ?? [];
          return (
            <section
              key={spalte.key}
              aria-label={`Spalte ${spalte.label}`}
              onDragOver={(e) => {
                if (dragId) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropAufSpalte(spalte.key);
              }}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30"
            >
              <h2 className="flex items-center justify-between px-3 py-2 text-sm font-semibold text-foreground">
                <span>{spalte.label}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  {karten.length}
                </span>
              </h2>
              <ul className="flex flex-1 flex-col gap-2 p-2">
                {karten.length === 0 ? (
                  <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Keine Vorgänge
                  </li>
                ) : (
                  karten.map((a) => {
                    const p = prioDef(a.prioritaet);
                    const status = statusOf(a);
                    const uebergaenge = status
                      ? erlaubteUebergaenge(a, status)
                      : [];
                    return (
                      <li key={a.id}>
                        <article
                          draggable
                          aria-roledescription="Ziehbare Karte"
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", a.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(a.id);
                          }}
                          onDragEnd={() => setDragId(null)}
                          onDragOver={(e) => {
                            if (dragId) e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dropAufKarte(a);
                          }}
                          className={cn(
                            "rounded-md border border-border bg-card p-3 shadow-sm transition-colors motion-reduce:transition-none",
                            dragId === a.id
                              ? "opacity-50"
                              : "hover:border-primary/40",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            {a.procedureId && a.vorgangId ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpen(a.procedureId!, a.vorgangId!)
                                }
                                className="text-left text-sm font-medium text-foreground underline-offset-2 hover:underline"
                              >
                                {a.titel}
                              </button>
                            ) : (
                              // Verfahrens-freie Aufgabe: kein Vorgang zu öffnen → nicht-interaktiver Titel
                              // (Details weiterhin über den „Details"-Knopf rechts).
                              <span className="text-left text-sm font-medium text-foreground">
                                {a.titel}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setDetailId(a.id)}
                              aria-label={`Details zu „${a.titel}" öffnen`}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                            >
                              <PanelRightOpen
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                            </button>
                            <KartenMenue
                              aufgabe={a}
                              statusLabel={(s) => zielLabel(a, s)}
                              uebergaenge={uebergaenge}
                              prioritaeten={prioritaeten}
                              aktuellerAkteur={aktuellerAkteur}
                              onUebergang={(t) => {
                                if (t.vierAugen || t.detailPflicht) {
                                  setMeldung(
                                    `„${t.label}" erfordert eine Prüfung/Begründung — der Vorgang wird geöffnet.`,
                                  );
                                  if (a.procedureId && a.vorgangId)
                                    onOpen(a.procedureId, a.vorgangId);
                                } else {
                                  versucheUebergang(a, t.to);
                                }
                              }}
                              onPrioritaet={(key) =>
                                workspace.setPrioritaet(
                                  a.id,
                                  key,
                                  aktuellerAkteur,
                                )
                              }
                              onZuweisen={(an) =>
                                workspace.assign(a.id, an, aktuellerAkteur)
                              }
                              zuweisbareAkteure={zuweisbareAkteure}
                              {...(a.zugewiesenAn
                                ? { zugewiesenAn: a.zugewiesenAn }
                                : {})}
                              onReihenfolge={(r) => reihenfolge(a, r)}
                            />
                          </div>
                          {(workspace.configFor(a.procedureId)?.label ??
                          a.procedureId) ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {workspace.configFor(a.procedureId)?.label ??
                                a.procedureId}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {status ? (
                              <StatusPill
                                status={status}
                                states={statesOf(a)}
                              />
                            ) : null}
                            {p ? <Badge tone={p.tone}>{p.label}</Badge> : null}
                            {(a.labels ?? []).map((key) => {
                              const l = labelDef(key);
                              return (
                                <Badge key={key} tone={l?.tone ?? "info"}>
                                  {l?.label ?? key}
                                </Badge>
                              );
                            })}
                            {(kinder.get(a.id) ?? 0) > 0 ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                                title={`${kinder.get(a.id)} Unteraufgaben`}
                              >
                                <ListTree
                                  aria-hidden="true"
                                  className="h-3 w-3"
                                />
                                {kinder.get(a.id)}
                                <span className="sr-only"> Unteraufgaben</span>
                              </span>
                            ) : null}
                          </div>
                          {a.zugewiesenAn ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Zugewiesen: {a.zugewiesenAn}
                            </p>
                          ) : null}
                        </article>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Task-Detail-Drawer: Vermerke (append-only) + Aktivität + Beziehungen aus dem WorkspacePort. Radix-Sheet
          liefert Fokusfalle + ESC. Reaktiv über den Store-Snapshot (Vermerk anlegen → Feed/Liste aktualisieren). */}
      <Sheet
        open={detail !== undefined}
        onOpenChange={(offen) => {
          if (!offen) {
            setDetailId(null);
            setSubTitel("");
            setSubFehler(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md"
        >
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.titel}</SheetTitle>
                <SheetDescription>
                  {detail.procedureId
                    ? `Verfahren ${detail.procedureId}`
                    : "Verfahrens-freie Aufgabe"}
                  {detail.zugewiesenAn ? ` · ${detail.zugewiesenAn}` : ""}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-8">
                <KommentarThread
                  kommentare={workspace.listKommentare(detail.id)}
                  schreibenErlaubt
                  onVermerk={(text) =>
                    workspace.addKommentar(detail.id, text, aktuellerAkteur)
                  }
                />
                <AktivitaetsFeed
                  aktivitaeten={workspace.listAktivitaet(detail.id)}
                  typLabels={AKTIVITAET_TYP_LABELS}
                />
                <RelationPanel
                  beziehungen={workspace.listBeziehungen(detail.id)}
                  bearbeitenErlaubt
                  typLabels={BEZIEHUNGS_TYP_LABELS}
                  aufgabenTitel={Object.fromEntries(
                    workspace.listTasks().map((a) => [a.id, a.titel]),
                  )}
                  anlegbareAufgaben={workspace
                    .listTasks()
                    .filter((a) => a.id !== detail.id)
                    .map((a) => ({ id: a.id, titel: a.titel }))}
                  onAnlegen={(zielId, typ) =>
                    workspace.addBeziehung(
                      detail.id,
                      zielId,
                      typ,
                      aktuellerAkteur,
                    )
                  }
                  onEntfernen={(id) =>
                    workspace.entferneBeziehung(detail.id, id)
                  }
                />
                {/* Unteraufgaben (Sub-Issues, Plane): Kinder dieser Aufgabe auflisten + eine neue anlegen. Kinder
                    erscheinen NICHT als eigene Board-Karte, nur hier. `createFreieAufgabe` ist DEV-seitig (der
                    HTTP-PROD-Pfad wirft — verfahrens-freie Aufgaben brauchen ein nullbares Verfahren im Schema). */}
                <section aria-label="Unteraufgaben">
                  <h3 className="text-sm font-semibold text-foreground">
                    Unteraufgaben
                  </h3>
                  <ul className="mt-2 flex flex-col gap-1">
                    {unteraufgabenVon(alleUngefiltert, detail.id).length ===
                    0 ? (
                      <li className="text-xs text-muted-foreground">
                        Keine Unteraufgaben.
                      </li>
                    ) : (
                      unteraufgabenVon(alleUngefiltert, detail.id).map((k) => (
                        <li key={k.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSubTitel("");
                              setSubFehler(null);
                              setDetailId(k.id);
                            }}
                            className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-left text-sm text-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {k.titel}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const t = subTitel.trim();
                      if (!t) return;
                      try {
                        workspace.createFreieAufgabe(t, {
                          parentAufgabeId: detail.id,
                        });
                        setSubTitel("");
                        setSubFehler(null);
                      } catch (err) {
                        setSubFehler(
                          err instanceof Error
                            ? err.message
                            : "Anlegen fehlgeschlagen.",
                        );
                      }
                    }}
                    className="mt-2 flex items-center gap-2"
                  >
                    <input
                      value={subTitel}
                      onChange={(e) => setSubTitel(e.target.value)}
                      placeholder="Neue Unteraufgabe …"
                      aria-label="Titel der neuen Unteraufgabe"
                      className="h-8 flex-1 rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={!subTitel.trim()}
                    >
                      Hinzufügen
                    </Button>
                  </form>
                  {subFehler ? (
                    <p className="mt-1 text-xs text-destructive">{subFehler}</p>
                  ) : null}
                </section>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Karten-Aktionsmenü (die BITV-Tastaturalternative zum Drag) ────────────────────────────────────
interface KartenMenueProps {
  aufgabe: Aufgabe;
  statusLabel: (statusKey: string) => string;
  uebergaenge: Transition[];
  prioritaeten: WorkspaceStore["config"]["prioritaeten"];
  aktuellerAkteur: string;
  onUebergang: (t: Transition) => void;
  onPrioritaet: (key: string | undefined) => void;
  onZuweisen: (an: string | undefined) => void;
  onReihenfolge: (richtung: -1 | 1) => void;
  zuweisbareAkteure: readonly { id: string; name: string }[];
  zugewiesenAn?: string;
}

function KartenMenue({
  aufgabe,
  statusLabel,
  uebergaenge,
  prioritaeten,
  aktuellerAkteur,
  onUebergang,
  onPrioritaet,
  onZuweisen,
  onReihenfolge,
  zuweisbareAkteure,
  zugewiesenAn,
}: KartenMenueProps): React.JSX.Element {
  // Radix DropdownMenu statt nativem <details>: bringt Fokusfalle, Pfeiltasten-/Typeahead-Navigation, ESC-Schließen
  // und Fokus-Rückkehr auf den Trigger — die BITV/WCAG-2.2-Menü-Semantik, die das <details>-Konstrukt nicht bot.
  // `onSelect` schließt das Menü automatisch (kein DOM-Hack mehr).
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={`Aktionen für ${aufgabe.titel}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Status ändern</DropdownMenuLabel>
        {uebergaenge.length === 0 ? (
          <DropdownMenuItem disabled>Keine Übergänge möglich</DropdownMenuItem>
        ) : (
          uebergaenge.map((t) => (
            <DropdownMenuItem
              key={`${t.from}-${t.to}`}
              onSelect={() => onUebergang(t)}
            >
              {t.label} → {statusLabel(t.to)}
              {t.vierAugen || t.detailPflicht ? (
                <span className="ml-1 text-muted-foreground">(Prüfung)</span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Priorität</DropdownMenuLabel>
        {prioritaeten.map((p) => (
          <DropdownMenuItem key={p.key} onSelect={() => onPrioritaet(p.key)}>
            {p.label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Zuweisung & Reihenfolge</DropdownMenuLabel>
        {/* Assignee-Picker: konkrete Kollegen (das Häkchen markiert die aktuelle Zuweisung, unsichtbar sonst → Ausrichtung). */}
        {zuweisbareAkteure.map((kollege) => (
          <DropdownMenuItem
            key={kollege.id}
            onSelect={() => onZuweisen(kollege.id)}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                zugewiesenAn === kollege.id ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            Zuweisen an {kollege.name}
            {zugewiesenAn === kollege.id ? (
              <span className="sr-only"> (aktuell zugewiesen)</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => onZuweisen(aktuellerAkteur)}>
          <span className="mr-2 inline-block h-4 w-4" aria-hidden="true" />
          Mir zuweisen
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZuweisen(undefined)}>
          <span className="mr-2 inline-block h-4 w-4" aria-hidden="true" />
          Zuweisung entfernen
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onReihenfolge(-1)}>
          Nach oben
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onReihenfolge(1)}>
          Nach unten
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
