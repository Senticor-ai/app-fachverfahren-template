// check:antrag-procedure — Drift-Gate zwischen der ANTRAGS-Zustandsmaschine (Client-Wahrheit,
// apps/fachverfahren/src/leistung.config.ts) und ihrer server-seitigen Spiegelung
// (apps/fachverfahren/server/procedure.config.ts → `antragProcedure`).
//
// WARUM: leistung.config.ts liegt ausserhalb des Server-rootDir (server/ vs. src/) — der Server KANN sie
// nicht importieren. Damit ein eingereichter Antrag zur server-persistierten Akte werden kann, ist die
// Maschine in procedure.config.ts dupliziert. Ohne dieses Gate könnten Client- und Server-Kopie
// stillschweigend auseinanderdriften (ein neuer Zustand/Übergang im Antrag, den der Server nicht kennt →
// „unknown procedure"/kaputte Übergänge). Das Gate leitet aus BEIDEN Quellen ab und vergleicht — exakt der
// Mechanismus von check:bpmn-example (BPMN ↔ config.yaml).
//
// Läuft ohne Bundler via `node --experimental-strip-types`. leistung.config.ts importiert aus dem Kit NUR
// Typen (import type) → sauber strip-bar; procedure.config.ts + die Ableitung kommen aus dem SDK.
import { leistungConfig } from "../apps/fachverfahren/src/leistung.config.ts";
import { antragProcedure } from "../apps/fachverfahren/server/procedure.config.ts";
import {
  statusMachineToProcedureVersion,
  type StatusMachineSource,
} from "../packages/public-sector-sdk/src/procedure-from-status-machine.ts";

const fehler: string[] = [];
const fail = (m: string) => fehler.push(m);

const sm = leistungConfig.statusMachine;

// procedureId MUSS übereinstimmen — der Client sendet leistungConfig.id beim Einreichen; kennt der Server
// ihn nicht unter genau diesem Schlüssel, scheitert jeder Antrag.
if (leistungConfig.id !== antragProcedure.procedureId) {
  fail(
    `procedureId-Drift: leistung.config.id="${leistungConfig.id}" ≠ antragProcedure.procedureId="${antragProcedure.procedureId}"`,
  );
}

// Die Metadaten (version/effectiveFrom/Permission) sind server-seitige Angaben, die NICHT in leistung.config
// stehen — sie werden aus der committeten antragProcedure übernommen. Struktur (Zustände/Übergänge/
// Rechtsgrundlagen/id) kommt aus leistung.config. Weicht die Struktur ab, kann die Ableitung nicht mehr
// die committete antragProcedure ergeben → das Gate schlägt an.
const permission =
  antragProcedure.allowedTransitions[0]?.requiredPermission ??
  "case.decision.prepare";

// Verwaltungsakt-Fachlichkeit aus leistung.config.zustellung ableiten (Rechtsbehelf-Regime + Fiktion).
// Nur wenn ein Rechtsbehelf deklariert ist — sonst erlässt das Verfahren keinen förmlichen Bescheid.
const rb = leistungConfig.zustellung?.rechtsbehelf;
const verwaltungsakt = rb
  ? {
      rechtsbehelf: {
        art: rb.art,
        fristWert: rb.fristWert,
        fristEinheit: rb.fristEinheit,
        stelle: rb.stelle,
        norm: rb.norm,
      },
      fiktionTage: leistungConfig.zustellung?.fiktionTage ?? 4,
      fiktionNorm:
        leistungConfig.zustellung?.fiktionNorm ?? "§ 41 Abs. 2 VwVfG",
    }
  : undefined;

const quelle: StatusMachineSource = {
  procedureId: leistungConfig.id,
  version: antragProcedure.version,
  effectiveFrom: antragProcedure.effectiveFrom,
  legalBasisIds: leistungConfig.rechtsgrundlagen.map((r) => r.norm),
  requiredPermission: permission,
  ...(verwaltungsakt ? { verwaltungsakt } : {}),
  states: sm.states.map((s) => ({
    key: s.key,
    ...(s.terminal ? { terminal: true } : {}),
  })),
  transitions: sm.transitions.map((t) => ({
    from: t.from,
    to: t.to,
    label: t.label,
    ...(t.vierAugen ? { vierAugen: true } : {}),
    ...(t.erlaesstBescheid ? { erlaesstBescheid: true } : {}),
  })),
};

let abgeleitet;
try {
  abgeleitet = statusMachineToProcedureVersion(quelle);
} catch (e) {
  fail(
    `Ableitung aus leistung.config wirft: ${e instanceof Error ? e.message : String(e)}`,
  );
}

if (abgeleitet) {
  const erwartet = JSON.stringify(abgeleitet);
  const tatsaechlich = JSON.stringify(antragProcedure);
  if (erwartet !== tatsaechlich) {
    fail(
      "antragProcedure weicht von der Ableitung aus leistung.config ab (Drift). " +
        "Entweder die Server-Kopie in procedure.config.ts oder die statusMachine in leistung.config.ts wurde " +
        "geändert, ohne die andere nachzuziehen.\n" +
        `  abgeleitet:   ${erwartet}\n` +
        `  antragProc.:  ${tatsaechlich}`,
    );
  }
}

if (fehler.length > 0) {
  console.error("check:antrag-procedure FEHLGESCHLAGEN:");
  for (const m of fehler) console.error(`  - ${m}`);
  process.exit(1);
}

console.log(
  `antrag-procedure ok — ${antragProcedure.procedureId} · ${antragProcedure.allowedStates.length} Zustände · ` +
    `${antragProcedure.allowedTransitions.length} Übergänge · deckungsgleich mit leistung.config.`,
);
