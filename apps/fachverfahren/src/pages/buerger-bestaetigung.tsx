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
              Ihr Antrag ist eingegangen
            </h1>
            {/* DIE ZAHLEN KOMMEN VOM SERVER (nicht mehr aus dem Browser) — sie sind der
                Eingangsnachweis und stehen so auch in Ihrem Postfach. */}
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Eingangsnummer
                </dt>
                <dd className="font-mono text-sm font-medium text-foreground">
                  {v.vorgangsnummer}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Bei uns eingegangen am
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {new Date(v.eingangIso).toLocaleString("de-DE", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Aktenzeichen</dt>
                <dd className="break-all font-mono text-sm text-foreground">
                  {v.id}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              Wir haben Ihnen eine Eingangsbestätigung in Ihr Postfach gelegt.
              Bitte bewahren Sie die Eingangsnummer auf — mit ihr können Sie
              jederzeit nach dem Stand fragen.
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
            <div className="mt-5 flex flex-wrap gap-2">
              {/* DER SICHTBARE NÄCHSTE SCHRITT — nicht „was kann ich sonst noch". */}
              <button
                type="button"
                onClick={() => navigate("/buerger/postfach")}
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Eingangsbestätigung im Postfach ansehen
              </button>
              <button
                type="button"
                onClick={() => navigate("/buerger/antraege")}
                className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground"
              >
                Meine Anträge
              </button>
            </div>
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
