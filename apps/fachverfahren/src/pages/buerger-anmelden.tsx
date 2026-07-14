// /buerger/anmelden — derselbe Antrags-Baustein unter dem expliziten „Antrag stellen"-Pfad.
import { useNavigate } from "react-router-dom";
import { AntragStepper } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { store } from "../store.js";

export function BuergerAnmeldenPage(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell persona="buerger" activeNavKey="antrag">
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <AntragStepper
          config={store.config}
          port={store}
          onDone={(v) => navigate(`/buerger/bestaetigung/${v.id}`)}
        />
      </div>
    </Shell>
  );
}
