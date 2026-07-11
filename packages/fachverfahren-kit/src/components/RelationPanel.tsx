// fachverfahren-kit/components/RelationPanel — die Beziehungen einer Aufgabe (Plane-Parität).
//
// Zeigt gerichtete Beziehungen (blockiert / blockiert-von / Dublette / bezieht-sich-auf / Widerspruch-zu) als
// zugängliche Liste; ein optionaler Entfernen-Knopf (nur wenn `bearbeitenErlaubt`) löst das Löschen aus. Der
// Beziehungstyp ist DATEN; `typLabels` macht ihn menschenlesbar, ohne Domänen-Literale in die Komponente zu backen.
// Barrierefrei (BITV/WCAG 2.2 AA): semantische Liste, beschriftete Aktionen, sichtbarer Fokus-Ring, reduced-motion.
import { useId, useState, type ReactElement } from "react";
import { Link2, X } from "lucide-react";

import type { AufgabeBeziehung, BeziehungsTyp } from "../types.js";
import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";

/** Kanonische Beziehungstypen (Plane-Parität) in Anlege-Reihenfolge — DATEN für das Typ-Auswahlmenü. */
export const BEZIEHUNGS_TYPEN: readonly BeziehungsTyp[] = [
  "blocks",
  "blocked-by",
  "relates",
  "duplicate",
  "widerspruch-zu",
];

/** Sinnvolle deutsche Standard-Beschriftungen je Beziehungstyp — wiederverwendbar (an `typLabels` reichen). */
export const BEZIEHUNGS_TYP_LABELS: Record<BeziehungsTyp, string> = {
  blocks: "blockiert",
  "blocked-by": "blockiert von",
  relates: "bezieht sich auf",
  duplicate: "Dublette von",
  "widerspruch-zu": "Widerspruch zu",
};

export interface RelationPanelProps {
  beziehungen: AufgabeBeziehung[];
  /** Anzeigetext je Beziehungstyp (DATEN). Fehlt einer, wird der rohe Typ gezeigt. */
  typLabels?: Partial<Record<BeziehungsTyp, string>>;
  /** Menschenlesbarer Titel je verknüpfter Aufgabe (optional; sonst die Id). */
  aufgabenTitel?: Record<string, string>;
  bearbeitenErlaubt?: boolean;
  onEntfernen?: (beziehungId: string) => void;
  /** Verknüpfbare andere Aufgaben (für das Anlege-UI) — ohne die eigene Aufgabe. Leer/fehlt = kein Anlege-UI. */
  anlegbareAufgaben?: readonly { id: string; titel: string }[];
  /** Legt eine neue Beziehung an. Nur wirksam mit `bearbeitenErlaubt` + `anlegbareAufgaben`. */
  onAnlegen?: (verknuepfteAufgabeId: string, typ: BeziehungsTyp) => void;
  className?: string;
}

/** Beziehungstyp → Badge-Ton (rein visuell; blockierend/Widerspruch hervorgehoben). */
function typTon(typ: BeziehungsTyp): "block" | "warn" | "info" | "neu" {
  if (typ === "blocks" || typ === "blocked-by") return "block";
  if (typ === "widerspruch-zu") return "warn";
  if (typ === "duplicate") return "info";
  return "neu";
}

export function RelationPanel({
  beziehungen,
  typLabels,
  aufgabenTitel,
  bearbeitenErlaubt = false,
  onEntfernen,
  anlegbareAufgaben,
  onAnlegen,
  className,
}: RelationPanelProps): ReactElement {
  const ueberschriftId = useId();
  const [zielId, setZielId] = useState("");
  const [typ, setTyp] = useState<BeziehungsTyp>("blocks");
  const anlegenMoeglich =
    bearbeitenErlaubt &&
    !!onAnlegen &&
    !!anlegbareAufgaben &&
    anlegbareAufgaben.length > 0;
  const labelFuer = (t: BeziehungsTyp): string =>
    typLabels?.[t] ?? BEZIEHUNGS_TYP_LABELS[t];

  return (
    <section
      aria-labelledby={ueberschriftId}
      className={cn("flex flex-col gap-3", className)}
    >
      <h3
        id={ueberschriftId}
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <Link2 aria-hidden="true" className="h-4 w-4" />
        Beziehungen
        <span className="text-muted-foreground">({beziehungen.length})</span>
      </h3>

      {beziehungen.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine verknüpften Aufgaben.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {beziehungen.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={typTon(b.typ)}>{labelFuer(b.typ)}</Badge>
                <span className="text-sm text-foreground">
                  {aufgabenTitel?.[b.verknuepfteAufgabeId] ??
                    b.verknuepfteAufgabeId}
                </span>
              </div>
              {bearbeitenErlaubt && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onEntfernen?.(b.id)}
                  aria-label={`Beziehung zu ${
                    aufgabenTitel?.[b.verknuepfteAufgabeId] ??
                    b.verknuepfteAufgabeId
                  } entfernen`}
                  className="h-8 w-8 text-muted-foreground"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {anlegenMoeglich ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!zielId) return;
            onAnlegen?.(zielId, typ);
            setZielId("");
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Beziehungstyp
            <select
              value={typ}
              onChange={(e) => setTyp(e.target.value as BeziehungsTyp)}
              aria-label="Beziehungstyp"
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              {BEZIEHUNGS_TYPEN.map((t) => (
                <option key={t} value={t}>
                  {labelFuer(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Aufgabe verknüpfen
            <select
              value={zielId}
              onChange={(e) => setZielId(e.target.value)}
              aria-label="Aufgabe verknüpfen"
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            >
              <option value="">Aufgabe wählen …</option>
              {anlegbareAufgaben!.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titel}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" disabled={!zielId}>
            Verknüpfen
          </Button>
        </form>
      ) : null}
    </section>
  );
}
