// WorkspaceListe — die verfahrensÜBERGREIFENDE Sachbearbeiter-Sicht (Phase 1 des PM-Upgrades).
//
// Zeigt ALLE Aufgaben über ALLE Verfahren des Workspace in EINER Liste, mit Priorität/Zuweisung/Labels,
// Suche/Filter und Bulk-Zuweisung. App-lokal (Komposition), konsumiert nur den `WorkspacePort` + Kit-Bausteine
// (StatusPill/Badge/FilterBar). Kein Verfahrens-Literal: Verfahren, Status und Vokabular kommen aus den Configs.
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  FilterBar,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  type Aufgabe,
  type TaskFilter,
  type WorkspaceStore,
} from "@senticor/fachverfahren-kit";

type Zuweisungsmodus = "alle" | "meine" | "niemand";

export interface WorkspaceListeProps {
  workspace: WorkspaceStore;
  /** Öffnet einen Vorgang (Verfahren + Vorgangs-Id → Prüf-/Entscheidungssicht). */
  onOpen: (procedureId: string, vorgangId: string) => void;
  /** Die angemeldete Sachbearbeiter-Kennung (für „meine"-Filter + „mir zuweisen"). DEV-Demo: ein Pseudonym. */
  aktuellerAkteur: string;
}

/** Rendert die verfahrensübergreifende Aufgabenliste mit Filter + Bulk-Zuweisung. */
export function WorkspaceListe({
  workspace,
  onOpen,
  aktuellerAkteur,
}: WorkspaceListeProps): React.JSX.Element {
  const [suche, setSuche] = useState("");
  const [prioAktiv, setPrioAktiv] = useState<Set<string>>(new Set());
  const [zuweisung, setZuweisung] = useState<Zuweisungsmodus>("alle");
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());

  const prioritaeten = workspace.config.prioritaeten;
  const labels = workspace.config.labels;

  const filter = useMemo<TaskFilter>(() => {
    const f: TaskFilter = {};
    if (suche.trim()) f.suche = suche.trim();
    if (prioAktiv.size) f.prioritaet = [...prioAktiv];
    if (zuweisung === "meine") f.zugewiesenAn = aktuellerAkteur;
    if (zuweisung === "niemand") f.zugewiesenAn = "$niemand";
    return f;
  }, [suche, prioAktiv, zuweisung, aktuellerAkteur]);

  const aufgaben = workspace.listTasks(filter);
  const gesamt = workspace.listTasks().length;

  const hatFilter =
    suche.trim().length > 0 || prioAktiv.size > 0 || zuweisung !== "alle";
  const zuruecksetzen = () => {
    setSuche("");
    setPrioAktiv(new Set());
    setZuweisung("alle");
  };

  // ── Gespeicherte Ansichten: den aktuellen Filter als benannte, wiederverwendbare Ansicht sichern/anwenden/löschen.
  const [viewName, setViewName] = useState("");
  const gespeicherte = workspace.listSavedViews();
  const speichereAnsicht = () => {
    const label = viewName.trim();
    if (!label) return;
    workspace.saveView({
      label,
      layout: "liste",
      definition: { ...filter } as Record<string, unknown>,
    });
    setViewName("");
  };
  const wendeAnsichtAn = (def: Record<string, unknown>) => {
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

  const togglePrio = (key: string) =>
    setPrioAktiv((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAuswahl = (id: string) =>
    setAuswahl((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const alleSichtbarAusgewaehlt =
    aufgaben.length > 0 && aufgaben.every((a) => auswahl.has(a.id));
  const toggleAlle = () =>
    setAuswahl(
      alleSichtbarAusgewaehlt ? new Set() : new Set(aufgaben.map((a) => a.id)),
    );

  const bulkZuweisen = (an: string | undefined) => {
    workspace.bulkAssign([...auswahl], an, aktuellerAkteur);
    setAuswahl(new Set());
  };
  const bulkPrioritaet = (key: string | undefined) => {
    workspace.bulkPrioritaet([...auswahl], key, aktuellerAkteur);
    setAuswahl(new Set());
  };
  const bulkLabel = (label: string) => {
    workspace.bulkLabel([...auswahl], label, aktuellerAkteur);
    setAuswahl(new Set());
  };

  const statusOf = (a: Aufgabe): string | undefined =>
    a.vorgangId
      ? workspace.portFor(a.procedureId)?.get(a.vorgangId)?.status
      : undefined;
  const statesOf = (a: Aufgabe) =>
    workspace.configFor(a.procedureId)?.statusMachine.states ?? [];
  const verfahrenLabel = (a: Aufgabe) =>
    workspace.configFor(a.procedureId)?.label ??
    a.procedureId ??
    "Freie Aufgabe";
  const prioDef = (key?: string) =>
    key ? prioritaeten.find((p) => p.key === key) : undefined;
  const labelDef = (key: string) => labels.find((l) => l.key === key);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-foreground">
          Alle Verfahren
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verfahrensübergreifender Arbeitsvorrat — {gesamt}{" "}
          {gesamt === 1 ? "Aufgabe" : "Aufgaben"} über{" "}
          {workspace.verfahren().length}{" "}
          {workspace.verfahren().length === 1 ? "Verfahren" : "Verfahren"}.
        </p>
      </header>

      <FilterBar
        value={suche}
        onValueChange={setSuche}
        placeholder="Aufgaben durchsuchen…"
        resultCount={aufgaben.length}
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
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
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

      {/* Gespeicherte Ansichten: aktuellen Filter benannt sichern, per Klick anwenden, löschen. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
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
          aria-label="Name der zu speichernden Ansicht"
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

      {auswahl.size > 0 ? (
        <div
          role="region"
          aria-label="Sammelaktionen"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
        >
          <span className="font-medium text-foreground">
            {auswahl.size} ausgewählt
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => bulkZuweisen(aktuellerAkteur)}
          >
            Mir zuweisen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => bulkZuweisen(undefined)}
          >
            Zuweisung entfernen
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Priorität:
            <select
              aria-label="Priorität für die Auswahl setzen"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                bulkPrioritaet(
                  e.target.value === "__keine" ? undefined : e.target.value,
                );
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
            >
              <option value="" disabled>
                wählen …
              </option>
              {prioritaeten.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
              <option value="__keine">— entfernen —</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Label:
            <select
              aria-label="Label zur Auswahl hinzufügen"
              value=""
              onChange={(e) => {
                if (e.target.value) bulkLabel(e.target.value);
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
            >
              <option value="" disabled>
                hinzufügen …
              </option>
              {labels.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            variant="link"
            onClick={() => setAuswahl(new Set())}
          >
            Auswahl leeren
          </Button>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Verfahrensübergreifende Aufgabenliste
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th scope="col" className="w-10 px-3 py-2">
                <Checkbox
                  checked={
                    alleSichtbarAusgewaehlt
                      ? true
                      : aufgaben.some((a) => auswahl.has(a.id))
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={() => toggleAlle()}
                  aria-label="Alle sichtbaren Aufgaben auswählen"
                />
              </th>
              <th
                scope="col"
                className="px-3 py-2 font-medium text-muted-foreground"
              >
                Verfahren
              </th>
              <th
                scope="col"
                className="px-3 py-2 font-medium text-muted-foreground"
              >
                Vorgang
              </th>
              <th
                scope="col"
                className="px-3 py-2 font-medium text-muted-foreground"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-3 py-2 font-medium text-muted-foreground"
              >
                Priorität
              </th>
              <th
                scope="col"
                className="px-3 py-2 font-medium text-muted-foreground"
              >
                Zuweisung
              </th>
              <th
                scope="col"
                className="px-3 py-2 font-medium text-muted-foreground"
              >
                Labels
              </th>
            </tr>
          </thead>
          <tbody>
            {aufgaben.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  Keine Aufgaben für die aktuelle Auswahl.
                </td>
              </tr>
            ) : (
              aufgaben.map((a) => {
                const p = prioDef(a.prioritaet);
                const status = statusOf(a);
                return (
                  <tr
                    key={a.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 align-middle">
                      <Checkbox
                        checked={auswahl.has(a.id)}
                        onCheckedChange={() => toggleAuswahl(a.id)}
                        aria-label={`Aufgabe ${a.titel} auswählen`}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">
                      {verfahrenLabel(a)}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {a.procedureId && a.vorgangId ? (
                        <button
                          type="button"
                          onClick={() => onOpen(a.procedureId!, a.vorgangId!)}
                          className="text-left font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {a.titel}
                        </button>
                      ) : (
                        // Verfahrens-freie Aufgabe: kein Vorgang zu öffnen → nicht-interaktiver Titel.
                        <span className="font-medium text-foreground">
                          {a.titel}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {status ? (
                        <StatusPill status={status} states={statesOf(a)} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      {p ? (
                        <Badge tone={p.tone}>{p.label}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">
                      {a.zugewiesenAn ?? (
                        <span className="text-xs">nicht zugewiesen</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex flex-wrap gap-1">
                        {(a.labels ?? []).map((key) => {
                          const l = labelDef(key);
                          return (
                            <Badge key={key} tone={l?.tone ?? "info"}>
                              {l?.label ?? key}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
