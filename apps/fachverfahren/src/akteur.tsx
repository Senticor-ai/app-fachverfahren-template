// akteur — DEV-Identität (WER handelt gerade) als umschaltbarer App-Context.
//
// WARUM: Vier-Augen (Vorbereiter ≠ Freigeber) und die WER-nachweisbare History brauchen VERSCHIEDENE Personen.
// Bisher war der handelnde Akteur eine EINZIGE Konstante („sb.angemeldet") → die Vier-Augen-Freigabe liess sich in
// der laufenden UI gar nicht demonstrieren (jede Aktion trug denselben Akteur). Dieser Context macht die
// angemeldete DEV-Person umschaltbar, sodass ein zweiter Sachbearbeiter eine vorbereitete Entscheidung freigeben
// (bzw. die Selbstfreigabe blockiert werden) kann.
//
// GRENZE / PROD: In PROD kommt die Identität AUSSCHLIESSLICH aus der angemeldeten Session (BundID/OIDC,
// server-autoritativ). Dieser Umschalter ist rein ein DEV-Affordance für die In-Memory-Demo und hat auf den
// server-autoritativen Pfad (der die actorId aus der Session ableitet) KEINE Wirkung — er kann keine Identität
// „vortäuschen", wo der Server entscheidet.
import { createContext, useContext, useState, type ReactNode } from "react";

export interface DevAkteur {
  /** Stabile actor_id-Semantik (identisch zum Verweis in History/Audit). */
  id: string;
  /** Anzeigename. */
  name: string;
  /** Rolle/Funktion (nur informativ für den DEV-Umschalter). */
  rolle: string;
}

/** DEV-Demo-Akteure: verschiedene PERSONEN derselben Behörde, damit die Vier-Augen-Regel live erlebbar ist. */
export const DEV_AKTEURE: readonly DevAkteur[] = [
  { id: "sb.eins", name: "Sachbearbeitung Eins", rolle: "Sachbearbeitung" },
  {
    id: "sb.zwei",
    name: "Sachbearbeitung Zwei",
    rolle: "Sachbearbeitung · Freigabe",
  },
];

interface AkteurContextWert {
  /** Die aktuell angemeldete DEV-Person (actor_id). */
  akteur: string;
  akteurInfo: DevAkteur;
  setAkteur: (id: string) => void;
  akteure: readonly DevAkteur[];
}

const AkteurContext = createContext<AkteurContextWert | null>(null);

export function AkteurProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [akteur, setAkteur] = useState<string>(DEV_AKTEURE[0]!.id);
  const akteurInfo =
    DEV_AKTEURE.find((a) => a.id === akteur) ?? DEV_AKTEURE[0]!;
  return (
    <AkteurContext.Provider
      value={{ akteur, akteurInfo, setAkteur, akteure: DEV_AKTEURE }}
    >
      {children}
    </AkteurContext.Provider>
  );
}

/** Vollständiger Context (für den Umschalter). */
export function useAkteurContext(): AkteurContextWert {
  const c = useContext(AkteurContext);
  if (!c)
    throw new Error("useAkteur muss innerhalb von <AkteurProvider> stehen");
  return c;
}

/** Bequemer Zugriff auf die aktuelle actor_id (für die Routen, die einen Akteur an den Port reichen). */
export function useAkteur(): string {
  return useAkteurContext().akteur;
}

/**
 * DEV-Umschalter der angemeldeten Person — ein schmales, klar als DEV markiertes Band. Ermöglicht, als
 * verschiedene Sachbearbeiter:innen zu handeln (Vier-Augen: Person A bereitet vor, Person B gibt frei). Rein
 * clientseitig für die In-Memory-Demo; erklärt seine PROD-Grenze direkt in der UI.
 */
export function AkteurWechsler(): React.JSX.Element {
  const { akteur, setAkteur, akteure } = useAkteurContext();
  return (
    <div
      className="border-b border-dashed border-status-warn/40 bg-status-warn-soft/40 text-status-warn"
      role="region"
      aria-label="DEV-Identität"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs md:px-6">
        <span className="font-semibold uppercase tracking-wide">DEV</span>
        <label className="flex items-center gap-2">
          <span className="text-foreground">Angemeldet als</span>
          <select
            value={akteur}
            onChange={(e) => setAkteur(e.target.value)}
            aria-label="Angemeldete Person (DEV)"
            className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
          >
            {akteure.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.rolle}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground">
          Vier-Augen: eine ANDERE Person muss freigeben. In PROD kommt die
          Identität aus der Anmeldung (nicht wählbar).
        </span>
      </div>
    </div>
  );
}
