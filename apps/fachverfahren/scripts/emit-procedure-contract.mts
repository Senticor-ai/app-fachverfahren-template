// emit-procedure-contract — schreibt den JSON-Vertrags-Snapshot des Dossier-Verfahrens
// (procedure.contract.json), den externe Build-Gates deterministisch validieren können. Quelle ist IMMER die EINE
// Dossier-Naht ../server/procedure.config.ts — nach jedem Verfahrens-Wechsel (Generierung) neu ausführen.
// Das Dossier-Gegenstück zu emit-contract.mts (Antrag-Pfad).
import { writeFileSync } from "node:fs";
// Direkt auf die .ts-Quellen (statt Paket-Index): läuft so ohne Bundler mit `node --experimental-strip-types`.
import { toProcedureContractSnapshot } from "../../../packages/public-sector-sdk/src/procedure-contract.ts";
import { dossierProcedure } from "../server/procedure.config.ts";

const snap = toProcedureContractSnapshot(dossierProcedure);
const out = new URL("../procedure.contract.json", import.meta.url);
writeFileSync(out, JSON.stringify(snap, null, 2) + "\n");
console.log(
  `procedure.contract.json — ${snap.procedureId}@${snap.version} · ${snap.allowedStates.length} Zustände · ${snap.allowedTransitions.length} Übergänge · ${snap.legalBasisIds.length} Rechtsgrundlage(n)`,
);
