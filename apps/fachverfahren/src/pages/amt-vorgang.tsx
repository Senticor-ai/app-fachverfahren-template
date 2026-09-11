// /amt/vorgang/:id — die interne Prüf-/Entscheidungs-Sicht (ReviewWorkspace) für EINEN Vorgang.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ReviewWorkspace } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { amtStore } from "../store.js";
import { grundVon, statusVon } from "../app/ladelage.js";
import { FehlerFlaeche } from "../app/fehler-flaeche.js";

export function AmtVorgangPage(): React.JSX.Element {
  useStoreVersion(amtStore);
  const { id = "" } = useParams();
  const navigate = useNavigate();
  // Direkter Einstieg (Lesezeichen/Reload): der Bestand kommt vom SERVER, nicht aus dem Browser.
  const [laedt, setLaedt] = useState(!amtStore.get(id));
  const [fehler, setFehler] = useState<{
    grund: string;
    status: number | null;
  } | null>(null);
  const [versuch, setVersuch] = useState(0);
  useEffect(() => {
    if (amtStore.get(id)) return;
    let abgebrochen = false;
    setFehler(null);
    void amtStore
      .laden?.()
      .catch((e: unknown) => {
        // A failed hydration used to fall through into ReviewWorkspace with an unhydrated store — the
        // caseworker saw an empty workspace instead of a named situation. See app/ladelage.ts.
        if (!abgebrochen)
          setFehler({ grund: grundVon(e), status: statusVon(e) });
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [id, versuch]);

  if (laedt)
    return (
      <Shell persona="sachbearbeitung" activeNavKey="eingang">
        <p
          className="p-4 text-sm text-muted-foreground md:p-8"
          aria-busy="true"
        >
          Der Vorgang wird geladen …
        </p>
      </Shell>
    );

  if (fehler)
    return (
      <Shell persona="sachbearbeitung" activeNavKey="eingang">
        <FehlerFlaeche
          className="p-4 md:p-8"
          titel="Der Vorgang konnte gerade nicht geladen werden."
          klarstellung="Das heißt NICHT, dass es ihn nicht gibt — wir konnten es nur nicht feststellen."
          grund={fehler.grund}
          status={fehler.status}
          erneut={() => setVersuch((n) => n + 1)}
        />
      </Shell>
    );

  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <ReviewWorkspace
        config={amtStore.config}
        port={amtStore}
        vorgangId={id}
        rolle="sachbearbeitung"
        // AKTEUR (Person, nicht Rolle): in PROD die angemeldete BundID-Identität. Im DEV-Demo (keine Anmeldung)
        // eine stabile pseudonyme Person, damit die Vier-Augen-Prüfung greift und die History WER-nachweisbar wird
        // (history[].akteur) — der Store erzwingt dann „andere Person als der letzte Akteur" bei vierAugen-Übergängen.
        akteur="sb.angemeldet"
        onClose={() => navigate("/amt")}
      />
    </Shell>
  );
}
