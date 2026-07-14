// /buerger — Einstieg der Bürger:in: direkt der geführte Antrag (der Kit rendert ihn aus
// der Config). Jede Seite komponiert EINEN Kit-Baustein mit der EINEN Store-Instanz.
import { useNavigate } from "react-router-dom";
import { AntragStepper } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { store } from "../store.js";

export function BuergerStartPage(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell persona="buerger" activeNavKey="start">
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
