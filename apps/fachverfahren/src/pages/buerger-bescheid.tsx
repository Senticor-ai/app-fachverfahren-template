// /buerger/bescheid/:id — der eigene, EINGEFRORENE Bescheid. Lädt den bestandskräftigen VA
// server-seitig (GET .../bescheid, owner-scoped, als case.disclosed auditiert = Bekanntgabe) und
// rendert ihn über BescheidView. Der Tenor und die Rechtsbehelfsbelehrung kommen AUSSCHLIESSLICH aus
// dem gefrorenen Snapshot (nicht aus der lebenden Config) — so ändert eine spätere Tarif-/Regime-
// Umstellung den bereits erlassenen Bescheid NICHT.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BescheidView, type Vorgang } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { store } from "../store.js";
import { ladeBescheid, type VerwaltungsaktDto } from "../antrag-client.js";

/** Der gefrorene VA → ein Vorgang-Objekt, das BescheidView rendert (Tenor = eingefrorene Berechnung). */
function toVorgang(va: VerwaltungsaktDto): Vorgang {
  const basis: Vorgang = {
    id: va.aktenzeichen,
    vorgangsnummer: va.aktenzeichen,
    eingangIso: va.issuedAt,
    antragsdaten: {},
    status: "festgesetzt",
    nachweise: [],
    history: [],
  };
  // Tenor ist die eingefrorene Berechnung (opak transportiert) — nur setzen, wenn vorhanden
  // (exactOptionalPropertyTypes: kein explizites undefined).
  if (va.tenor)
    basis.berechnung = va.tenor as unknown as NonNullable<
      Vorgang["berechnung"]
    >;
  return basis;
}

export function BuergerBescheidPage(): React.JSX.Element {
  const { id = "" } = useParams();
  const [va, setVa] = useState<VerwaltungsaktDto | null>(null);
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    let abgebrochen = false;
    ladeBescheid(id)
      .then((dto) => {
        if (!abgebrochen) setVa(dto);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [id]);

  return (
    <Shell persona="buerger" activeNavKey="antraege">
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <Link
          to={`/buerger/antrag/${id}`}
          className="text-sm text-primary hover:underline"
        >
          ← Zurück zum Antrag
        </Link>
        {laedt ? (
          <p className="mt-6 text-sm text-muted-foreground" aria-busy="true">
            Ihr Bescheid wird geladen …
          </p>
        ) : va ? (
          <div className="mt-4">
            <BescheidView
              vorgang={toVorgang(va)}
              config={store.config}
              // Die EINGEFRORENE Belehrung — regime-neutral, aus dem Snapshot, NICHT aus der Config.
              belehrung={{
                rechtsbehelf: va.rechtsbehelf,
                fiktionTage: va.fiktionTage,
                fiktionNorm: va.fiktionNorm,
              }}
            />
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Für diesen Antrag liegt noch kein Bescheid vor.
          </p>
        )}
      </div>
    </Shell>
  );
}
