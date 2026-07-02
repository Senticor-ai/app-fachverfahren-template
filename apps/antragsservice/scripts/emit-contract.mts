// emit-contract — schreibt den JSON-Vertrags-Snapshot der App-Leistung (leistung.contract.json), den externe
// Build-Gates deterministisch validieren können. Quelle ist IMMER die EINE
// Austausch-Naht ../src/leistung.config.ts — nach jedem Config-Wechsel (Generierung) neu ausführen.
import { writeFileSync } from "node:fs";
// Direkt auf die .ts-Quelle (statt Paket-Index): läuft so ohne Bundler mit `node --experimental-strip-types` —
// der Kit-Index zieht .tsx-Komponenten + .js-Endungs-Importe, die reines Type-Stripping nicht auflöst.
import { toContractSnapshot } from "../../../packages/fachverfahren-kit/src/contract-snapshot.ts";
import { leistungConfig } from "../src/leistung.config.ts";
const snap = toContractSnapshot(leistungConfig as never);
const out = new URL("../leistung.contract.json", import.meta.url);
writeFileSync(out, JSON.stringify(snap, null, 2) + "\n");
console.log(
  `leistung.contract.json — ${snap.id} · ${snap.antrag.steps.length} Schritte · ${snap.statusMachine.states.length} Status · seed ${snap.seedCount}`,
);
