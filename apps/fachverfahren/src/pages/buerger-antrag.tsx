// /buerger/antrag/:id — Status-Detail eines eigenen Antrags: der Lebensweg des Vorgangs
// (StatusVerfolgung, config-getrieben) für die Bürger:in. Hydriert bei Bedarf (Deep-Link/Reload),
// sodass der Vorgang auch ohne vorherige Listen-Ansicht auffindbar ist.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusVerfolgung } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { store } from "../store.js";

export function BuergerAntragPage(): React.JSX.Element {
  useStoreVersion();
  const { id = "" } = useParams();
  const v = store.get(id);
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
    // Bewusst leere Deps: nur EINMAL beim Mounten hydrieren.
  }, []);

  return (
    <Shell persona="buerger" activeNavKey="antraege">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <Link
          to="/buerger/antraege"
          className="text-sm text-primary hover:underline"
        >
          ← Zurück zu „Meine Anträge"
        </Link>
        {v ? (
          <div className="mt-4">
            <StatusVerfolgung vorgang={v} config={store.config} />
          </div>
        ) : laedt ? (
          <p className="mt-6 text-sm text-muted-foreground" aria-busy="true">
            Ihr Antrag wird geladen …
          </p>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Antrag nicht gefunden.
          </p>
        )}
      </div>
    </Shell>
  );
}
