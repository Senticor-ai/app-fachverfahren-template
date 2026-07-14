// /amt/vorgang/:id — die interne Prüf-/Entscheidungs-Sicht (ReviewWorkspace) für EINEN Vorgang.
import { useNavigate, useParams } from "react-router-dom";
import { ReviewWorkspace } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { store } from "../store.js";

export function AmtVorgangPage(): React.JSX.Element {
  useStoreVersion();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <ReviewWorkspace
        config={store.config}
        port={store}
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
