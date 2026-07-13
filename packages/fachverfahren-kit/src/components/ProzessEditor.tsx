// fachverfahren-kit/components/ProzessEditor — der a11y-PRIMÄRE Autorenpfad für eine `ProzessDefinition` (BPMN-Subset
// V1: Start/Ende/UserTask/ServiceTask/ExclusiveGateway + SequenceFlows). Bewusst FORMULAR-/LISTEN-basiert statt
// Canvas-only: die grafische ANZEIGE (Mermaid) ist Vorschau/Progressive-Enhancement, der EDIT läuft über beschriftete
// Formularfelder (BITV AA — voll tastaturbedienbar, kein Maus-/Canvas-Zwang). Kontrolliert: jede Änderung ruft
// `beiAenderung(neueDefinition)`. Live-Validierung via `validateProzessGraph` (fail-closed, gegen die StatusMachine).
import { useId } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { StatusMachine } from "../types.js";
import type {
  ProzessDefinition,
  ProzessKante,
  ProzessKnoten,
  ProzessKnotenTyp,
} from "../lib/process-ir.js";
import type { KiAssistPort } from "../lib/ai-assist.js";
import { validateProzessGraph } from "../lib/process-graph.js";
import { prozessDefZuMermaid } from "../lib/process-ir-view.js";
import { useAiAssist } from "../hooks/use-ai-assist.js";
import { MermaidView } from "./MermaidView.js";
import { KiAssistPanel } from "./KiAssistPanel.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";

/** Im Editor anlegbare Knotentypen (die V1-ausführbaren). Nicht-unterstützte BPMN-Elemente bleibt der Interpreter
 *  fail-closed schuldig — sie werden hier gar nicht erst angeboten. */
const ANLEGBARE_TYPEN: { typ: ProzessKnotenTyp; label: string }[] = [
  { typ: "start", label: "Start" },
  { typ: "ende", label: "Ende" },
  { typ: "userTask", label: "Benutzer-Aufgabe" },
  { typ: "serviceTask", label: "System-Aufgabe" },
  { typ: "exclusiveGateway", label: "Exklusives Gateway (XOR)" },
];

const hatCatalogAction = (
  k: ProzessKnoten,
): k is ProzessKnoten & { catalogAction: string; vierAugen?: boolean } =>
  k.typ === "userTask" || k.typ === "serviceTask";

/** Baut einen Knoten des gewählten Typs, überträgt kompatible Felder (label/catalogAction/vierAugen/rollen). */
function baueKnoten(
  id: string,
  typ: ProzessKnotenTyp,
  alt?: ProzessKnoten,
): ProzessKnoten {
  const label = alt?.label;
  const labelTeil = label !== undefined ? { label } : {};
  if (typ === "userTask") {
    const rollen = alt && "rollen" in alt ? alt.rollen : [];
    const catalogAction = alt && hatCatalogAction(alt) ? alt.catalogAction : "";
    const vierAugen = alt && hatCatalogAction(alt) ? alt.vierAugen : undefined;
    return {
      id,
      typ,
      rollen,
      catalogAction,
      ...labelTeil,
      ...(vierAugen ? { vierAugen: true } : {}),
    };
  }
  if (typ === "serviceTask") {
    const catalogAction = alt && hatCatalogAction(alt) ? alt.catalogAction : "";
    const vierAugen = alt && hatCatalogAction(alt) ? alt.vierAugen : undefined;
    return {
      id,
      typ,
      catalogAction,
      ...labelTeil,
      ...(vierAugen ? { vierAugen: true } : {}),
    };
  }
  return { id, typ, ...labelTeil };
}

/** Nächste freie, stabile Knoten-/Kanten-Id (kx / ex) — deterministisch aus dem Bestand (kein Random/Date). */
function naechsteId(praefix: string, vorhandene: string[]): string {
  let n = vorhandene.length + 1;
  while (vorhandene.includes(`${praefix}${n}`)) n += 1;
  return `${praefix}${n}`;
}

export interface ProzessEditorProps {
  wert: ProzessDefinition;
  statusMachine: StatusMachine;
  beiAenderung: (def: ProzessDefinition) => void;
  /** Read-only-Ansicht (nur Vorschau + Tabelle, keine Edit-Controls). */
  nurLesen?: boolean;
  /** OPTIONAL: KI-Assistent. Ist er verbunden, bietet der Editor einen transparenten, MENSCHLICH zu prüfenden
   *  Vorschlag zur Vervollständigung/Verbesserung an (HITL — der Mensch übernimmt manuell, KI ist nie eines der
   *  zwei Augen). Fehlt er, arbeitet der Editor vollständig OHNE KI (die KI ist strikt additiv/optional). */
  kiPort?: KiAssistPort;
}

export function ProzessEditor({
  wert,
  statusMachine,
  beiAenderung,
  nurLesen = false,
  kiPort,
}: ProzessEditorProps) {
  const uid = useId().replace(/:/g, "_");
  const fehler = validateProzessGraph(wert, statusMachine);
  const knotenIds = wert.knoten.map((k) => k.id);
  const assist = useAiAssist(kiPort);
  const kiKontextText =
    `Prozess „${wert.label ?? wert.id}" mit ${wert.knoten.length} Knoten und ${wert.kanten.length} Kanten. ` +
    (fehler.length > 0
      ? `Offene Validierungsfehler: ${fehler.map((f) => f.detail).join("; ")}. `
      : "Aktuell valide. ") +
    "Wie lässt sich der Prozess sinnvoll vervollständigen oder verbessern?";

  const setzeKnoten = (id: string, neu: ProzessKnoten) =>
    beiAenderung({
      ...wert,
      knoten: wert.knoten.map((k) => (k.id === id ? neu : k)),
    });

  const entferneKnoten = (id: string) =>
    beiAenderung({
      ...wert,
      knoten: wert.knoten.filter((k) => k.id !== id),
      // Kanten, die den Knoten referenzieren, mitentfernen (kein verwaister SequenceFlow).
      kanten: wert.kanten.filter((e) => e.von !== id && e.nach !== id),
    });

  const fuegeKnotenHinzu = () => {
    const id = naechsteId("k", knotenIds);
    beiAenderung({
      ...wert,
      knoten: [...wert.knoten, baueKnoten(id, "userTask")],
    });
  };

  const setzeKante = (id: string, teil: Partial<ProzessKante>) =>
    beiAenderung({
      ...wert,
      kanten: wert.kanten.map((e) => (e.id === id ? { ...e, ...teil } : e)),
    });

  const entferneKante = (id: string) =>
    beiAenderung({ ...wert, kanten: wert.kanten.filter((e) => e.id !== id) });

  const fuegeKanteHinzu = () => {
    const id = naechsteId(
      "e",
      wert.kanten.map((e) => e.id),
    );
    const von = knotenIds[0] ?? "";
    const nach = knotenIds[1] ?? knotenIds[0] ?? "";
    beiAenderung({ ...wert, kanten: [...wert.kanten, { id, von, nach }] });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Validierung (aria-live, damit Screenreader Fehler beim Editieren mitbekommen) ── */}
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-border bg-muted/40 p-3 text-sm"
      >
        {fehler.length === 0 ? (
          <p className="text-muted-foreground">
            Prozess ist gültig ({wert.knoten.length} Knoten,{" "}
            {wert.kanten.length} Kanten).
          </p>
        ) : (
          <div>
            <p className="font-medium text-destructive">
              {fehler.length} Validierungsfehler:
            </p>
            <ul className="ml-4 list-disc">
              {fehler.map((f, i) => (
                <li key={`${f.code}-${i}`}>
                  {f.detail}
                  {f.knotenId ? ` (Knoten ${f.knotenId})` : ""}
                  {f.kanteId ? ` (Kante ${f.kanteId})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── KI-Assistent (OPTIONAL, strikt additiv, HITL) — nur sichtbar, wenn ein Port verbunden ist ── */}
      {kiPort && !nurLesen && (
        <div className="flex flex-col gap-2">
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={assist.laedt}
              onClick={() =>
                void assist.anfragen({
                  text: kiKontextText,
                  kontext: { prozess: wert },
                })
              }
            >
              <Sparkles className="size-4" aria-hidden />
              {assist.laedt
                ? "KI erstellt Vorschlag …"
                : "KI-Vorschlag anfordern"}
            </Button>
          </div>
          {assist.vorschlag && (
            <KiAssistPanel
              vorschlag={assist.vorschlag}
              risikoklasse="begrenzt"
              funktionsName="Prozess-Assistent"
              onVerwerfen={assist.zuruecksetzen}
            />
          )}
        </div>
      )}

      {/* ── Knoten ── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Knoten</legend>
        {wert.knoten.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Knoten.</p>
        )}
        <ul className="flex flex-col gap-3">
          {wert.knoten.map((k) => (
            <li
              key={k.id}
              className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${uid}-${k.id}-typ`}>Typ ({k.id})</Label>
                <select
                  id={`${uid}-${k.id}-typ`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={k.typ}
                  disabled={nurLesen}
                  onChange={(e) =>
                    setzeKnoten(
                      k.id,
                      baueKnoten(k.id, e.target.value as ProzessKnotenTyp, k),
                    )
                  }
                >
                  {ANLEGBARE_TYPEN.map((t) => (
                    <option key={t.typ} value={t.typ}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${uid}-${k.id}-label`}>Bezeichnung</Label>
                <Input
                  id={`${uid}-${k.id}-label`}
                  value={k.label ?? ""}
                  disabled={nurLesen}
                  onChange={(e) =>
                    setzeKnoten(k.id, { ...k, label: e.target.value })
                  }
                />
              </div>
              {hatCatalogAction(k) && (
                <>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${uid}-${k.id}-action`}>
                      Ziel-Status (Katalog-Aktion)
                    </Label>
                    <Input
                      id={`${uid}-${k.id}-action`}
                      value={k.catalogAction}
                      disabled={nurLesen}
                      onChange={(e) =>
                        // Cast umgeht die exactOptionalPropertyTypes-Reibung beim Spread des (narrowed) Knotens —
                        // optionale Felder werden dabei typseitig zu `T | undefined`; der Wert ist zur Laufzeit valide.
                        setzeKnoten(k.id, {
                          ...k,
                          catalogAction: e.target.value,
                        } as ProzessKnoten)
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <input
                      id={`${uid}-${k.id}-va`}
                      type="checkbox"
                      className="size-4 rounded border-input outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      checked={Boolean(k.vierAugen)}
                      disabled={nurLesen}
                      onChange={(e) =>
                        setzeKnoten(k.id, {
                          ...k,
                          vierAugen: e.target.checked,
                        } as ProzessKnoten)
                      }
                    />
                    <Label htmlFor={`${uid}-${k.id}-va`}>Vier-Augen</Label>
                  </div>
                </>
              )}
              {!nurLesen && (
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => entferneKnoten(k.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Knoten {k.id} entfernen
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {!nurLesen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fuegeKnotenHinzu}
          >
            <Plus className="size-4" aria-hidden />
            Knoten hinzufügen
          </Button>
        )}
      </fieldset>

      {/* ── Kanten ── */}
      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-semibold">
          Kanten (Sequenzflüsse)
        </legend>
        {wert.kanten.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Kanten.</p>
        )}
        <ul className="flex flex-col gap-3">
          {wert.kanten.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 sm:grid-cols-3"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${uid}-${e.id}-von`}>Von ({e.id})</Label>
                <select
                  id={`${uid}-${e.id}-von`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={e.von}
                  disabled={nurLesen}
                  onChange={(ev) => setzeKante(e.id, { von: ev.target.value })}
                >
                  {knotenIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${uid}-${e.id}-nach`}>Nach</Label>
                <select
                  id={`${uid}-${e.id}-nach`}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={e.nach}
                  disabled={nurLesen}
                  onChange={(ev) => setzeKante(e.id, { nach: ev.target.value })}
                >
                  {knotenIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="flex items-end gap-2">
                  <input
                    id={`${uid}-${e.id}-default`}
                    type="checkbox"
                    className="size-4 rounded border-input outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    checked={Boolean(e.default)}
                    disabled={nurLesen}
                    onChange={(ev) =>
                      setzeKante(
                        e.id,
                        ev.target.checked
                          ? { default: true }
                          : { default: false },
                      )
                    }
                  />
                  <Label htmlFor={`${uid}-${e.id}-default`}>Default</Label>
                </div>
                {!nurLesen && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => entferneKante(e.id)}
                    aria-label={`Kante ${e.id} entfernen`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!nurLesen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fuegeKanteHinzu}
            disabled={wert.knoten.length === 0}
          >
            <Plus className="size-4" aria-hidden />
            Kante hinzufügen
          </Button>
        )}
      </fieldset>

      {/* ── Anzeige (Mermaid-Vorschau, Progressive Enhancement neben dem Formular) ── */}
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Vorschau</h3>
        <MermaidView code={prozessDefZuMermaid(wert)} />
      </div>
    </div>
  );
}
