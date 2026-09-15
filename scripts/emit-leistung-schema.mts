// emit-leistung-schema — schreibt `schemas/leistung-config.schema.json`: die maschinenlesbare PFLICHT-FORM
// des Leistungs-Vertrags. Quelle ist IMMER `packages/fachverfahren-kit/src/leistung-contract-form.ts` —
// dieselbe Konstante, die `scripts/check-leistung-contract.mts` AUSFÜHRT. Es gibt keine zweite Wahrheit;
// das Schema kann nicht driften, weil es keine eigene Aussage trifft.
//
// WARUM (gemessen 2026-09-01, Lauf `beweis-0901b`): die Phase `build` verbrauchte 12 von 12 Runden mit 26
// Lesungen und NULL Schreibungen — 16 Lesungen galten `packages/fachverfahren-kit/src/types.ts`
// (57.029 Bytes), nur um acht Pflichtfelder zu erfahren. Diese Datei erzeugt die Antwort in einer Größe,
// die in EINE Lesung passt.
//
// Läuft ohne Bundler via `node --experimental-strip-types` — direkt auf die .ts-Quelle (wie emit-contract.mts).
// Frische-Gate: `pnpm run check:leistung-contract` schlägt fehl, sobald die committete Datei abweicht.
import { writeFileSync } from "node:fs";
import { zuJsonSchema } from "../packages/fachverfahren-kit/src/leistung-contract-form.ts";

const out = new URL("../schemas/leistung-config.schema.json", import.meta.url);
const schema = zuJsonSchema();
const text = JSON.stringify(schema, null, 2) + "\n";
writeFileSync(out, text);
console.log(
  `leistung-config.schema.json — ${(schema["required"] as string[]).length} Pflicht-Wurzeln · ${text.length} Bytes.`,
);
