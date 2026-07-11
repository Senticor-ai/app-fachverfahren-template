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
import { MoreHorizontal, PanelRightOpen } from "lucide-react";
import {
  AKTIVITAET_TYP_LABELS,
  AktivitaetsFeed,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  KommentarThread,
  RelationPanel,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusPill,
  boardSpalten,
  cn,
  erlaubteUebergaenge as erlaubteUebergaengeKit,
  raengeFuerEinordnung,
  rankZwischen,
  type Aufgabe,
  type LeistungConfig,
  type Transition,
  type WorkspaceStore,
} from "@senticor/fachverfahren-kit";

export interface VorgangBoardProps {
  workspace: WorkspaceStore;
  onOpen: (procedureId: string, vorgangId: string) => void;
  aktuellerAkteur: string;
}

const ROLLE = "sachbearbeitung";

export function VorgangBoard({
  workspace,
  onOpen,
  aktuellerAkteur,
}: VorgangBoardProps): React.JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null);
  const [meldung, setMeldung] = useState("");
  // Task-Detail-Drawer (Vermerke/Aktivität/Beziehungen). Die Daten kommen aus dem WorkspacePort (DEV: in-memory,
  // reaktiv über den Store-Snapshot; PROD: dieselbe Schnittstelle gegen die Server-Routen).
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? workspace.getTask(detailId) : undefined;

  const prioritaeten = workspace.config.prioritaeten;
  const labels = workspace.config.labels;

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

  const alle = workspace.listTasks();
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
          if (!offen) setDetailId(null);
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
                  onEntfernen={(id) =>
                    workspace.entferneBeziehung(detail.id, id)
                  }
                />
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
        <DropdownMenuItem onSelect={() => onZuweisen(aktuellerAkteur)}>
          Mir zuweisen
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZuweisen(undefined)}>
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
