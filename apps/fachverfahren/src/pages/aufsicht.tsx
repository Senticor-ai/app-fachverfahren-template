// /aufsicht — die Aufsichts-Kennzahlen / Audit (AufsichtDashboard) über der EINEN Quelle.
import { AufsichtDashboard } from "@senticor/fachverfahren-kit";
import { Shell } from "../app/shell.js";
import { useStoreVersion } from "../app/use-store-version.js";
import { store } from "../store.js";

export function AufsichtPage(): React.JSX.Element {
  useStoreVersion();
  return (
    <Shell persona="aufsicht" activeNavKey="kennzahlen">
      <AufsichtDashboard config={store.config} port={store} />
    </Shell>
  );
}
