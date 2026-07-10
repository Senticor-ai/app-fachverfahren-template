// fachverfahren-kit/components/BenutzerEinstellungen — die persönlichen NUTZER-EINSTELLUNGEN (Phase 7).
//
// Kontrolliert (value + onChange) — der Aufrufer persistiert (in PROD via /api/preferences, im DEV via localStorage).
// Nutzt ausschließlich die Kit-Primitive (ThemeToggle · ui/select · ui/checkbox · ui/label) im shadcn-Muster, rein
// data-driven (die verfügbaren Ansichten kommen als DATEN). Barrierefrei: beschriftete Felder (Label/htmlFor),
// gruppierte Abschnitte (fieldset/legend), sichtbarer Fokus über die Primitive.
import { useId, type ReactElement } from "react";

import { cn } from "../lib/utils.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { Checkbox } from "../ui/checkbox.js";
import { Label } from "../ui/label.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";

/** Die persönlichen Präferenzen eines Nutzers (generisch; erweiterbar). */
export interface BenutzerPraeferenzen {
  /** Startansicht der Sachbearbeitung (Route-Schlüssel; DATEN). */
  standardansicht: string;
  /** Kompaktere Listen/Tabellen (dichtere Darstellung). */
  kompakteListen: boolean;
}

export interface BenutzerEinstellungenProps {
  praeferenzen: BenutzerPraeferenzen;
  /** Auswählbare Startansichten (DATEN — kein Route-Literal in der Komponente). */
  ansichten: { wert: string; label: string }[];
  /** Teil-Patch bei jeder Änderung; der Aufrufer persistiert. */
  onChange: (patch: Partial<BenutzerPraeferenzen>) => void;
  className?: string;
}

export function BenutzerEinstellungen({
  praeferenzen,
  ansichten,
  onChange,
  className,
}: BenutzerEinstellungenProps): ReactElement {
  const ansichtId = useId();
  const kompaktId = useId();

  return (
    <div className={cn("mx-auto flex max-w-2xl flex-col gap-6", className)}>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Persönliche Präferenzen für diese Arbeitsumgebung.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <legend className="px-1 text-sm font-medium text-foreground">
          Darstellung
        </legend>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground">Farbschema</span>
          <ThemeToggle />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <legend className="px-1 text-sm font-medium text-foreground">
          Arbeitsweise
        </legend>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ansichtId}>Startansicht</Label>
          <Select
            value={praeferenzen.standardansicht}
            onValueChange={(wert) => onChange({ standardansicht: wert })}
          >
            <SelectTrigger id={ansichtId} className="max-w-xs">
              <SelectValue placeholder="Ansicht wählen" />
            </SelectTrigger>
            <SelectContent>
              {ansichten.map((a) => (
                <SelectItem key={a.wert} value={a.wert}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Wird nach der Anmeldung als erste Seite geöffnet.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id={kompaktId}
            checked={praeferenzen.kompakteListen}
            onCheckedChange={(wert) =>
              onChange({ kompakteListen: wert === true })
            }
            className="mt-0.5"
          />
          <div className="flex flex-col">
            <Label htmlFor={kompaktId}>Kompakte Listen</Label>
            <p className="text-xs text-muted-foreground">
              Dichtere Darstellung in Arbeitsvorrat und Board.
            </p>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
