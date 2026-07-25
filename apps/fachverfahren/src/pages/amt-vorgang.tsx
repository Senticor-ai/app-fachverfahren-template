// /amt/vorgang/:id — die interne Prüf-/Entscheidungs-Sicht (ReviewWorkspace) für EINEN Vorgang.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ReviewWorkspace } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { amtStore } from "../store.js";

export function AmtVorgangPage(): React.JSX.Element {
  useStoreVersion(amtStore);
  const { id = "" } = useParams();
  const navigate = useNavigate();
  // Direkter Einstieg (Lesezeichen/Reload): der Bestand kommt vom SERVER, nicht aus dem Browser.
  const [laedt, setLaedt] = useState(!amtStore.get(id));
  useEffect(() => {
    if (amtStore.get(id)) return;
    let abgebrochen = false;
    void amtStore
      .laden?.()
      .catch(() => undefined)
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, [id]);

  if (laedt)
    return (
      <Shell persona="sachbearbeitung" activeNavKey="eingang">
        <p className="p-4 text-sm text-muted-foreground md:p-8" aria-busy="true">
          Der Vorgang wird geladen …
        </p>
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
