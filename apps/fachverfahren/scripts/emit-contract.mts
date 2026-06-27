// emit-contract — schreibt den JSON-Vertrags-Snapshot der App-Leistung (leistung.contract.json), den das governte
// Build-Gate der Fabrik (leistung-vertrag-gueltig) deterministisch validiert. Generisch: tausche die Config-Quelle.
import { writeFileSync } from "node:fs";
import { toContractSnapshot } from "@senticor/fachverfahren-kit";
import { hundesteuerConfig } from "@senticor/fachverfahren-kit/leistungen/hundesteuer";
const snap = toContractSnapshot(hundesteuerConfig as never);
const out = new URL("../leistung.contract.json", import.meta.url);
writeFileSync(out, JSON.stringify(snap, null, 2) + "\n");
console.log(`leistung.contract.json — ${snap.id} · ${snap.antrag.steps.length} Schritte · ${snap.statusMachine.states.length} Status · seed ${snap.seedCount}`);
