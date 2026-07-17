// /buerger/bestaetigung/:id — Eingangsbestätigung: liest den eben erzeugten Vorgang aus
// der EINEN Quelle. Bei einem RELOAD ist der lokale Snapshot leer (nur Seed) — deshalb hydriert
// die Seite einmalig aus dem Server (store.laden()), damit der eigene Antrag wieder auftaucht.
// Genau das macht die Bürger-Seite stateful: der Vorgang lebt server-seitig, nicht nur im Browser.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatBetragStatus } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { store } from "../store.js";

export function BuergerBestaetigungPage(): React.JSX.Element {
  useStoreVersion();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const v = store.get(id);
  // Fehlt der Vorgang lokal (frischer Reload), einmal aus dem Server hydrieren. `laden` ersetzt den
  // Snapshot durch die eigenen Anträge — danach findet store.get(id) den Vorgang. `laedt` unterscheidet
  // „wird noch geladen" von „gibt es wirklich nicht", damit kein falsches „nicht gefunden" aufblitzt.
  const [laedt, setLaedt] = useState(!v && store.laden !== undefined);
  useEffect(() => {
    if (v || store.laden === undefined) return;
    let abgebrochen = false;
    store
      .laden()
      .catch(() => undefined)
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
    // Bewusst leere Deps: nur EINMAL beim Mounten hydrieren, nicht bei jeder v-Änderung.
  }, []);
  return (
    <Shell persona="buerger" activeNavKey="start">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        {v ? (
          <div className="rounded-lg border border-status-ok/30 bg-status-ok-soft p-6">
            <h1 className="text-lg font-semibold text-foreground">
              Antrag eingegangen
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ihr Vorgang wurde unter der Nummer{" "}
              <span className="font-mono font-medium text-foreground">
                {v.vorgangsnummer}
              </span>{" "}
              aufgenommen und wird geprüft.
            </p>
            {v.berechnung ? (
              <>
                <p className="mt-3 text-sm text-foreground">
                  {v.berechnung.label}: {formatBetragStatus(v.berechnung).text}
                </p>
                {formatBetragStatus(v.berechnung).vorlaeufig ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vorläufige Angabe — die endgültige Festsetzung erfolgt nach
                    Prüfung; dieser Betrag ist noch nicht verbindlich.
                  </p>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/buerger/anmelden")}
              className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Neuen Antrag stellen
            </button>
          </div>
        ) : laedt ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Ihr Vorgang wird geladen …
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Vorgang nicht gefunden.
          </p>
        )}
      </div>
    </Shell>
  );
}
