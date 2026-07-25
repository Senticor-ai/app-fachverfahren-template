// /amt — Sachbearbeitung: der Eingangskorb (Kit-Arbeitsvorrat) über den Vorgängen, die der SERVER hat.
//
// GESCHLOSSENER BRUCH: diese Sicht rendert bis eben den Demo-Bestand aus der Config. Ein Bürger
// konnte einen Antrag stellen — hier tauchte er nie auf. Jetzt hydriert die Seite aus /api/cases;
// was zu sehen ist, IST der Bestand der Stelle. Ist er leer, steht das ehrlich da.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Arbeitsvorrat,
  EmptyState,
  ErrorState,
} from "@senticor/fachverfahren-kit";
import { Inbox } from "lucide-react";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { amtStore } from "../store.js";

export function AmtEingangPage(): React.JSX.Element {
  useStoreVersion(amtStore);
  const navigate = useNavigate();
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    void amtStore
      .laden?.()
      .catch(() => {
        if (!abgebrochen) setFehler(true);
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  const vorgaenge = amtStore.list();
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      {laedt ? (
        <p className="p-4 text-sm text-muted-foreground md:p-8" aria-busy="true">
          Der Eingang wird geladen …
        </p>
      ) : fehler ? (
        <div className="p-4 md:p-8">
          <ErrorState
            title="Der Eingang konnte nicht geladen werden"
            description="Bitte laden Sie die Seite neu. Bleibt es dabei, ist die Fachanwendung gerade nicht erreichbar."
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : vorgaenge.length === 0 ? (
        <div className="p-4 md:p-8">
          <EmptyState
            icon={Inbox}
            title="Zurzeit liegt nichts im Eingang"
            description="Sobald eine Bürgerin oder ein Bürger einen Antrag einreicht, erscheint er hier — mit Eingangsnummer, Eingangszeitpunkt und allen eingereichten Angaben."
          />
        </div>
      ) : (
        <Arbeitsvorrat
          config={amtStore.config}
          port={amtStore}
          onOpen={(id) => navigate(`/amt/vorgang/${id}`)}
        />
      )}
    </Shell>
  );
}
