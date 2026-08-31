// /buerger/antraege — „Meine Anträge": die eigenen, server-persistierten Vorgänge des angemeldeten
// Bürgers. Hydriert einmal beim Mounten aus dem Server (store.laden → owner-scoped) und listet die
// Vorgänge mit Status; Klick öffnet die Status-Detailsicht. Ohne diese Route sah ein Bürger seine
// Anträge nur über die Bestätigungs-URL — nach dem Login gab es keinen Weg zurück zu ihnen.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusPill } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { store } from "../store.js";
import { grundVon, statusVon } from "../app/ladelage.js";
import { FehlerFlaeche } from "../app/fehler-flaeche.js";

export function BuergerAntraegePage(): React.JSX.Element {
  useStoreVersion();
  const [laedt, setLaedt] = useState(store.laden !== undefined);
  const [fehler, setFehler] = useState<{
    grund: string;
    status: number | null;
  } | null>(null);
  const [versuch, setVersuch] = useState(0);
  useEffect(() => {
    if (store.laden === undefined) {
      setLaedt(false);
      return;
    }
    let abgebrochen = false;
    setFehler(null);
    store
      .laden()
      .catch((e: unknown) => {
        // A failed load is not "no applications yet": the sentence below would otherwise tell a citizen whose
        // session expired that they never filed anything. Same class as five sibling pages (app/ladelage.ts).
        if (!abgebrochen)
          setFehler({ grund: grundVon(e), status: statusVon(e) });
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
    // Bewusst leere Deps: nur EINMAL beim Mounten hydrieren.
  }, [versuch]);

  const vorgaenge = store.list();
  const states = store.config.statusMachine.states;

  return (
    <Shell persona="buerger" activeNavKey="antraege">
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <h1 className="text-lg font-semibold text-foreground">Meine Anträge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ihre eingereichten Anträge und deren aktueller Stand.
        </p>

        {laedt ? (
          <p className="mt-6 text-sm text-muted-foreground" aria-busy="true">
            Ihre Anträge werden geladen …
          </p>
        ) : fehler ? (
          <FehlerFlaeche
            className="mt-6"
            titel="Ihre Anträge konnten gerade nicht geladen werden."
            klarstellung="Das heißt NICHT, dass Sie keinen gestellt haben — wir konnten es nur nicht feststellen."
            grund={fehler.grund}
            status={fehler.status}
            erneut={() => setVersuch((n) => n + 1)}
          />
        ) : vorgaenge.length === 0 ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Sie haben noch keinen Antrag gestellt.
            </p>
            <Link
              to="/buerger"
              className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Antrag stellen
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {vorgaenge.map((v) => (
              <li key={v.id}>
                <Link
                  to={`/buerger/antrag/${v.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-medium text-foreground">
                      {v.vorgangsnummer}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Eingereicht am{" "}
                      {new Date(v.eingangIso).toLocaleDateString("de-DE")}
                    </span>
                  </span>
                  <StatusPill status={v.status} states={states} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
