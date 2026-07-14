// /amt — Sachbearbeitung: der Arbeitsvorrat (Kit) über der EINEN Quelle; Klick öffnet die
// Vorgangs-Prüfung.
import { useNavigate } from "react-router-dom";
import { Arbeitsvorrat } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { store } from "../store.js";

export function AmtEingangPage(): React.JSX.Element {
  useStoreVersion();
  const navigate = useNavigate();
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <Arbeitsvorrat
        config={store.config}
        port={store}
        onOpen={(id) => navigate(`/amt/vorgang/${id}`)}
      />
    </Shell>
  );
}
