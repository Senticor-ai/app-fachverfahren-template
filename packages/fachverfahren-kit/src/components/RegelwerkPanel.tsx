// components/RegelwerkPanel — die WORKFLOW-/REGELWERK-Sicht: macht die deklarativen Automations-/Hook-Regeln (DATEN)
// sichtbar und erlaubt einen REINEN Trockenlauf (dieselbe getestete `evalAutomationen`/`pruefeAutomationen`, die der
// DEV-Store und die server-`simulate`-Route nutzen). Rein präsentierend: kein Netz, keine Mutation, kein Domänen-
// Literal — Trigger/Bedingung/Aktionen werden generisch aus den Daten in lesbares Deutsch projiziert. Die AUSFÜHRUNG
// der Regeln bleibt server-autoritativ (RBAC/Vier-Augen/Audit); hier wird NUR die Absicht angezeigt.
import { useMemo, useState, type ReactElement } from "react";
import { Sparkles, Workflow, ShieldCheck, TriangleAlert } from "lucide-react";

import type {
  AutomationAktion,
  AutomationRule,
  AutomationTrigger,
  PriorityDef,
} from "../types.js";
import {
  evalAutomationen,
  pruefeAutomationen,
  type AutomationKontext,
} from "../lib/automation.js";
import { cn } from "../lib/cn.js";
import { Badge } from "../ui/badge.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";

export interface RegelwerkPanelProps<T = Record<string, unknown>> {
  /** Die auszuwertenden Regeln (aus `LeistungConfig.automationen` + `WorkspaceConfig.automationenGlobal`). */
  regeln: AutomationRule[];
  /** Prioritäts-Definitionen — nur zum LESBAREN Beschriften der `setze-prioritaet`-Aktion (optional). */
  prioritaeten?: PriorityDef[];
  /** Beispiel-Kontext (Aufgabe/Vorgang) für den Trockenlauf. Ohne ihn ist die Simulation ausgeblendet. */
  beispiel?: AutomationKontext<T>;
}

/** Trigger → lesbares Deutsch (generisch, kein Domänen-Literal). */
function triggerLabel(t: AutomationTrigger): string {
  switch (t.art) {
    case "beim-eingang":
      return "Beim Eingang";
    case "beim-uebergang":
      return `Beim Übergang${t.von ? ` von „${t.von}"` : ""}${t.nach ? ` nach „${t.nach}"` : ""}`;
    case "frist-erreicht":
      return `Frist erreicht (${t.fristTyp})`;
    case "nachweis-eingegangen":
      return `Nachweis eingegangen${t.nachweisId ? ` (${t.nachweisId})` : ""}`;
    case "feld-geaendert":
      return `Feld geändert (${t.feld})`;
    case "zuweisung-geaendert":
      return "Zuweisung geändert";
    case "manuell":
      return `Manuell: ${t.label}`;
    default:
      return "Unbekannter Auslöser";
  }
}

/** Aktion → lesbares Deutsch. `prioLabel` löst Prioritäts-Schlüssel in ihr Label auf. */
function aktionLabel(
  a: AutomationAktion,
  prioLabel: (key: string) => string,
): string {
  switch (a.art) {
    case "setze-feld":
      return `Feld setzen: ${a.feld} = ${String(a.wert)}`;
    case "setze-prioritaet":
      return `Priorität: ${prioLabel(a.wert)}`;
    case "zuweisen":
      return `Zuweisen an: ${typeof a.an === "string" ? a.an : `Rolle ${a.an.rolle}`}`;
    case "label-hinzufuegen":
      return `Label: ${a.label}`;
    case "status-uebergang":
      return `Status-Übergang → ${a.nach}`;
    case "aufgabe-erstellen":
      return `Aufgabe erstellen: ${a.titel}`;
    case "benachrichtigen":
      return `Benachrichtigen (${a.kanal})`;
    case "ki-vorschlag":
      return "KI-Vorschlag (Mensch entscheidet)";
    case "audit":
      return `Audit: ${a.aktion}`;
    default:
      return "Aktion";
  }
}

/** Eine Aktion ändert den Zustand (⇒ läuft server-autoritativ durch RBAC/Vier-Augen). Nur zur Kennzeichnung. */
function istMutierend(a: AutomationAktion): boolean {
  return (
    a.art === "setze-feld" ||
    a.art === "setze-prioritaet" ||
    a.art === "zuweisen" ||
    a.art === "label-hinzufuegen" ||
    a.art === "status-uebergang" ||
    a.art === "aufgabe-erstellen"
  );
}

/** Ein stabiler Schlüssel je Trigger (für die Trockenlauf-Auswahl). */
function triggerKey(t: AutomationTrigger): string {
  return JSON.stringify(t);
}

/**
 * Rendert das Regelwerk (Automations-/Hook-Regeln) + einen reinen Trockenlauf. Der Trockenlauf wählt EIN eingetretenes
 * Ereignis (aus den in den Regeln vorkommenden Triggern) und zeigt via `evalAutomationen`, welche Effekt-Absichten
 * gegen den Beispiel-Kontext feuern würden — exakt die Auswertung, die auch server-seitig `simulate` verwendet.
 */
export function RegelwerkPanel<T = Record<string, unknown>>({
  regeln,
  prioritaeten = [],
  beispiel,
}: RegelwerkPanelProps<T>): ReactElement {
  const prioLabel = useMemo(() => {
    const m = new Map(prioritaeten.map((p) => [p.key, p.label]));
    return (key: string) => m.get(key) ?? key;
  }, [prioritaeten]);

  const probleme = useMemo(() => pruefeAutomationen(regeln), [regeln]);
  const problemeById = useMemo(
    () => new Set(probleme.map((p) => p.regelId)),
    [probleme],
  );
  const aktivAnzahl = regeln.filter((r) => r.aktiv !== false).length;

  // Distinkte Trigger-Ereignisse (aus den Regeln) als Trockenlauf-Optionen.
  const ereignisse = useMemo(() => {
    const seen = new Map<string, AutomationTrigger>();
    for (const r of regeln) seen.set(triggerKey(r.trigger), r.trigger);
    return [...seen.values()];
  }, [regeln]);

  const [gewaehlt, setGewaehlt] = useState<string>("");
  const gewaehltesEreignis = ereignisse.find((e) => triggerKey(e) === gewaehlt);

  const effekte = useMemo(() => {
    if (!beispiel || !gewaehltesEreignis) return null;
    return evalAutomationen(regeln, gewaehltesEreignis, beispiel);
  }, [beispiel, gewaehltesEreignis, regeln]);

  return (
    <section className="mx-auto max-w-4xl p-4 md:p-6">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">Regelwerk</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {regeln.length} {regeln.length === 1 ? "Regel" : "Regeln"} ·{" "}
          {aktivAnzahl} aktiv · deklarative Automationen/Hooks. Die Ausführung
          ist server-autoritativ (RBAC · Vier-Augen · Audit) — hier wird die
          Absicht angezeigt.
        </p>
      </header>

      {probleme.length > 0 ? (
        <div
          role="alert"
          className="mb-4 rounded-md border border-status-warn/40 bg-status-warn-soft/40 p-3 text-sm"
        >
          <div className="flex items-center gap-2 font-medium text-foreground">
            <TriangleAlert
              className="h-4 w-4 text-status-warn"
              aria-hidden="true"
            />
            {probleme.length} fail-closed{" "}
            {probleme.length === 1 ? "Warnung" : "Warnungen"}
          </div>
          <ul className="mt-1 list-disc pl-6 text-muted-foreground">
            {probleme.map((p) => (
              <li key={p.regelId}>{p.meldung}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {regeln.length === 0 ? (
        <p className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Für diesen Workspace sind keine Automations-Regeln konfiguriert.
        </p>
      ) : (
        <ul className="space-y-3">
          {regeln.map((r) => {
            const inaktiv = r.aktiv === false;
            const failClosed = problemeById.has(r.id);
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border border-border bg-card p-4 shadow-sm",
                  // Inaktive Regeln per Rahmen-Stil de-emphasizen, NICHT per opacity:
                  // opacity dimmt auch den Text unter den WCAG-2.1-AA-Kontrast (dt/mono
                  // fielen auf 3.06/3.35:1). Der Zustand wird ohnehin per Badge "inaktiv" getragen.
                  inaktiv && "border-dashed",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-medium text-primary">
                    {r.id}
                  </span>
                  {inaktiv ? (
                    <Badge tone="block">inaktiv</Badge>
                  ) : (
                    <Badge tone="ok">aktiv</Badge>
                  )}
                  {r.vierAugenErforderlich ? (
                    <Badge tone="warn">
                      <ShieldCheck
                        className="mr-1 h-3 w-3"
                        aria-hidden="true"
                      />
                      Vier-Augen
                    </Badge>
                  ) : null}
                  {failClosed ? <Badge tone="warn">fail-closed</Badge> : null}
                </div>

                <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]">
                  <dt className="text-muted-foreground">Auslöser</dt>
                  <dd className="text-foreground">{triggerLabel(r.trigger)}</dd>
                  <dt className="text-muted-foreground">Bedingung</dt>
                  <dd className="text-foreground">
                    {r.wenn ? (
                      <code className="rounded bg-secondary px-1 py-0.5 text-xs">
                        {JSON.stringify(r.wenn)}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">
                        keine (fail-open)
                      </span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Aktionen</dt>
                  <dd>
                    <div className="flex flex-wrap gap-1.5">
                      {r.dann.map((a, i) => (
                        <Badge key={i} tone={istMutierend(a) ? "info" : "neu"}>
                          {aktionLabel(a, prioLabel)}
                        </Badge>
                      ))}
                    </div>
                  </dd>
                  {r.normRef ? (
                    <>
                      <dt className="text-muted-foreground">Rechtsgrundlage</dt>
                      <dd className="text-muted-foreground">
                        {r.normRef.norm}
                      </dd>
                    </>
                  ) : null}
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      {beispiel && ereignisse.length > 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">
              Trockenlauf (rein, kein Effekt)
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ereignis wählen → welche Effekt-Absichten würden gegen den
            Beispiel-Vorgang feuern?
          </p>
          <div className="mt-3 max-w-sm">
            <Select value={gewaehlt} onValueChange={setGewaehlt}>
              <SelectTrigger
                aria-label="Ereignis für den Trockenlauf"
                className="h-9 text-sm"
              >
                <SelectValue placeholder="Ereignis wählen…" />
              </SelectTrigger>
              <SelectContent>
                {ereignisse.map((e) => (
                  <SelectItem key={triggerKey(e)} value={triggerKey(e)}>
                    {triggerLabel(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {effekte ? (
            effekte.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-foreground">
                  {effekte.length} Effekt-
                  {effekte.length === 1 ? "Absicht" : "Absichten"}:
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {effekte.map((a, i) => (
                    <Badge key={i} tone="info">
                      {aktionLabel(a, prioLabel)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Keine Regel würde für dieses Ereignis feuern.
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
