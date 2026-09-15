// /aufsicht — die Aufsichts-Kennzahlen / Audit (AufsichtDashboard) über der EINEN Quelle.
//
// ⛔ SIE MASS BIS 2026-09-07 EINEN ERFUNDENEN BESTAND, und die Doktrin dagegen stand zwei Dateien weiter
// ausgeschrieben. `store.ts` sagt über den `amtStore` wörtlich:
//
//     «KEIN DEMO-SEED: die Amts-Sicht zeigt, was der Server hat — auch wenn das NICHTS ist. Ein Demo-
//      Bestand, der aussieht wie echte Arbeit, ist die schlimmere Lüge als ein ehrlich leerer Eingangskorb.»
//
// Diese Seite übergab dennoch `port={store}` — den BÜRGER-Store, dessen Config-`seed` der Anfangsbestand
// bleibt, bis `store.laden()` ihn ersetzt. Auf /aufsicht wurde `laden()` NIE gerufen (kein Rufer auf
// dieser Route), und selbst ein Ruf lüde owner-scoped die EIGENEN Anträge der Aufsichtsperson — nicht den
// Bestand der Behörde. Ergebnis: «Vorgänge gesamt: 3», eine EUR-Summe erfundener Beträge und ein
// Audit-Trail aus fiktiver Seed-History — unter der Kopfzeile «Zahlen aus dem aktuellen Vorgangsbestand».
//
// ⭐ DAS IST DIE GEFÄHRLICHSTE FORM DES DEFEKTS, WEIL DIE SICHT MESSUNG SUGGERIERT, WO PER KONSTRUKTION
// nie gemessen werden konnte. Eine Aufsicht schließt aus Abwesenheit von Auffälligkeiten auf Ordnung —
// hier las sie ein Drehbuch. Dieselbe Klasse wie «statische Seeds ununterscheidbar als Governance DIESES
// Laufs» (2026-09-05).
//
// ⛔ UND DIE DREI LAGEN GEHÖREN DAZU, nicht nur der Store-Tausch: ohne sie wäre ein LADEFEHLER von einem
// ehrlich leeren Bestand nicht zu unterscheiden — und genau diese Verwechslung ist bei einer Aufsicht
// teurer als anderswo. Das Muster ist dasselbe wie in `amt-eingang.tsx`; es wird hier nicht neu erfunden.
import { useEffect, useState } from "react";
import { AufsichtDashboard, ErrorState } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { amtStore } from "../store.js";

export function AufsichtPage(): React.JSX.Element {
  useStoreVersion();
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

  return (
    <Shell persona="aufsicht" activeNavKey="kennzahlen">
      {laedt ? (
        <p
          className="p-4 text-sm text-muted-foreground md:p-8"
          aria-busy="true"
        >
          Die Kennzahlen werden geladen …
        </p>
      ) : fehler ? (
        <div className="p-4 md:p-8">
          <ErrorState
            title="Die Kennzahlen konnten nicht geladen werden"
            description="Das heißt NICHT, dass keine Vorgänge vorliegen — der Bestand ist gerade nicht abrufbar. Bitte laden Sie die Seite neu."
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : (
        <AufsichtDashboard config={amtStore.config} port={amtStore} />
      )}
    </Shell>
  );
}
