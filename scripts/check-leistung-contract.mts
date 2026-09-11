// check:leistung-contract — validiert die EINE Austausch-Naht (apps/fachverfahren/src/leistung.config.ts) und ihren
// committeten JSON-Vertrag (apps/fachverfahren/leistung.contract.json) GENERISCH — ohne ein einziges Domänen-Literal.
//
// Zwei Prüfungen, damit ein externes (governtes) Build-Gate den Vertrag deterministisch prüfen kann:
//  1) FRISCHE: der aus der Config frisch erzeugte Snapshot MUSS byte-gleich zur committeten leistung.contract.json sein
//     (sonst wurde die Config geändert, aber `pnpm --filter @senticor/fachverfahren emit:contract` vergessen).
//  2) STRUKTUR: der Vertrag erfüllt die generische Mindest-Form, die jede Fachverfahren-Instanz braucht — id/label,
//     mind. 1 Antragsschritt, eine widerspruchsfreie StatusMachine (Initial existiert, mind. 1 Endzustand, keine
//     Sackgasse, alle Übergänge referenzieren existierende Zustände + tragen Rollen), Detail-Sektionen, Register-
//     Suchfelder und mind. eine Rechtsgrundlage.
//
// Läuft ohne Bundler via `node --experimental-strip-types` — direkt auf die .ts-Quellen (wie scripts/emit-contract.mts).
import { readFileSync } from "node:fs";
import {
  diffNurEinfacheSprache,
  toContractSnapshot,
  type LeistungContractSnapshot,
} from "../packages/fachverfahren-kit/src/contract-snapshot.ts";
import { verifyDatenanbindung } from "../packages/fachverfahren-kit/src/lib/datenanbindung.ts";
import {
  checkApplicationForm,
  checkStateMachine,
  pruefeForm,
  zuJsonSchema,
} from "../packages/fachverfahren-kit/src/leistung-contract-form.ts";
import { leistungConfig } from "../apps/fachverfahren/src/leistung.config.ts";

const CONTRACT_URL = new URL(
  "../apps/fachverfahren/leistung.contract.json",
  import.meta.url,
);

const fehler: string[] = [];
const fail = (m: string) => fehler.push(m);

// ── 1) FRISCHE ──────────────────────────────────────────────────────────────
const snap = toContractSnapshot(leistungConfig as never);
const frisch = JSON.stringify(snap, null, 2) + "\n";
let committed = "";
try {
  committed = readFileSync(CONTRACT_URL, "utf8");
} catch {
  fail(
    "apps/fachverfahren/leistung.contract.json fehlt — `pnpm --filter @senticor/fachverfahren emit:contract` ausführen.",
  );
}
if (committed && committed !== frisch) {
  let committedObj: LeistungContractSnapshot | undefined;
  try {
    committedObj = JSON.parse(committed);
  } catch {
    committedObj = undefined;
  }
  const drift = committedObj
    ? diffNurEinfacheSprache(committedObj, snap)
    : null;
  if (drift && drift.length > 0) {
    const details = drift.map((d) => `${d.feld} (${d.schluessel})`).join(", ");
    fail(
      `leistung.contract.json ist NICHT frisch — NUR Einfache-Sprache-Felder unterscheiden sich: ${details}. ` +
        "Reihenfolge-Fehler: `emit:contract` lief VOR der Einfache-Sprache-Anreicherung der Config " +
        '(siehe .agents/skills/fachverfahren-app/SKILL.md, "Bürger-Sprache"). ' +
        "Fix: `pnpm --filter @senticor/fachverfahren emit:contract` ERNEUT ausführen (NACH der Anreicherung) und committen.",
    );
  } else {
    fail(
      "leistung.contract.json ist NICHT frisch (Config geändert?) — `pnpm --filter @senticor/fachverfahren emit:contract` ausführen und committen.",
    );
  }
}

// ── 2) STRUKTUR (generisch) ───────────────────────────────────────────────────
// Die PFLICHT-FORM steht EINMAL als Daten in packages/fachverfahren-kit/src/leistung-contract-form.ts.
// HIER STAND die Form als acht handgeschriebene if-Bloecke; sie wanderte 2026-09-01 in jene Konstante,
// weil `schemas/leistung-config.schema.json` sonst eine ZWEITE Wahrheit ueber dieselbe Pflichtmenge
// waere. Der Pruefer bleibt die Wahrheit — er FUEHRT die Konstante aus, das Schema PROJIZIERT sie nur.
for (const verstoss of pruefeForm(snap)) fail(verstoss);
// The cross-field APPLICATION invariants (step/field form + `konditionierendesFeld` in `steps[0]`).
// They sit here for the same reason as the state-machine graph rules: a JSON Schema cannot carry a rule
// that relates two places of the contract to each other. Each one RUNS out of its own record — see
// `LEISTUNG_APPLICATION_INVARIANTS`; there is no rule here that is not in that list.
for (const verstoss of checkApplicationForm(snap)) fail(verstoss);
// Nur fuer die Erfolgsmeldung unten — die Pflicht `>= 1 Schritt` prueft bereits pruefeForm.
const steps = snap.antrag?.steps ?? [];

// The graph-valued state-machine assurances — a JSON Schema cannot carry them. Until 2026-09-09 they stood
// HERE as code and were thus reachable by this one caller only; since the move into the form source
// `seam check` runs them TOO, without copying them (no second notion of form).
for (const verstoss of checkStateMachine(snap)) fail(verstoss);

// DATENANBINDUNG (generische, sichere Naht): je deklarierte Anbindung Zweckbindung (Art. 5 DSGVO) + Verbindungsklasse
// (BSI TR-03190 bei register/extern). Fehlt `datenanbindung` ganz → keine Mängel → kein Falsch-Block (additiv).
for (const m of verifyDatenanbindung(snap).mangel) fail(m.text);

// ── 3) SCHEMA-FRISCHE ─────────────────────────────────────────────────────────
// Das Gate nach dem Muster von `check:docs-manifest` (emit + Byte-Vergleich), aber INNERHALB dieses
// Pruefers: er ist der Eigentuemer der Pflicht-Form, also haelt er auch ihre Projektion frisch. So
// haengt das Frische-Gate an einer Kette, die es schon gibt (precommit:check, check:agent-domain).
const SCHEMA_URL = new URL(
  "../schemas/leistung-config.schema.json",
  import.meta.url,
);
const schemaFrisch = JSON.stringify(zuJsonSchema(), null, 2) + "\n";
let schemaCommitted = "";
try {
  schemaCommitted = readFileSync(SCHEMA_URL, "utf8");
} catch {
  fail(
    "schemas/leistung-config.schema.json fehlt — `node --experimental-strip-types scripts/emit-leistung-schema.mts` ausfuehren.",
  );
}
if (schemaCommitted && schemaCommitted !== schemaFrisch)
  fail(
    "schemas/leistung-config.schema.json ist NICHT frisch (Pflicht-Form geaendert oder Schema von Hand editiert) — " +
      "`node --experimental-strip-types scripts/emit-leistung-schema.mts` ausfuehren und committen.",
  );

// ── Ergebnis ──────────────────────────────────────────────────────────────────
if (fehler.length > 0) {
  console.error("leistung-contract-Verstöße:");
  for (const f of fehler) console.error(`- ${f}`);
  process.exitCode = 1;
} else {
  console.log(
    `leistung-contract ok — ${snap.id} · ${steps.length} Schritte · ${snap.statusMachine.states.length} Status · ${snap.detailSektionen.length} Detail-Sektionen · frisch · Schema frisch.`,
  );
}
