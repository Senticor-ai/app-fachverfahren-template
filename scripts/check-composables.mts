// check:composables — validiert die Composable-Naht (apps/fachverfahren/server/composables.config.ts) gegen
// das Metamodell (public-sector-sdk/composable.ts) GENERISCH, ohne Domänen-Literal. Das governte Gate für die
// Agentic Composables (CHOS Blueprint v5.0): ein extern gebautes, domänen-spezifisches Composable erbt es.
//
// Drei Prüfungen:
//  1) WOHLGEFORMT: jedes deklarierte Composable besteht assertComposable — inkl. der Spine-Governance
//     (AAL ≤ AAL-3 global; bei rechtsnaher Aufgabe ≤ AAL-2 „Advise" — die KI berät, entscheidet nie).
//  2) ZERTIFIZIERT-VOLLSTÄNDIG: jedes `certified`/`active` (enabled) Composable ist auch zertifizierungsreif
//     (certificationReadiness.fehlend = []) — kein Composable darf produktiv „enabled" sein, ohne alle
//     tragenden Vertragsebenen (Owner/Outcome/Modul/Evals/Spine-Knowledge) zu erfüllen (Blueprint §19/§28).
//  3) EINDEUTIG: keine doppelte (id,version) — die Registry-Auflösung bliebe sonst mehrdeutig.
//
// Läuft ohne Bundler via `node --experimental-strip-types` — direkt auf die .ts-Quellen.
import {
  assertComposable,
  certificationReadiness,
  istEnabled,
} from "../packages/public-sector-sdk/src/composable.ts";
import { composables } from "../apps/fachverfahren/server/composables.config.ts";

const fehler: string[] = [];
const fail = (m: string) => fehler.push(m);

// ── 1) WOHLGEFORMT (inkl. Spine-Governance) ─────────────────────────────────
for (const c of composables) {
  try {
    assertComposable(c);
  } catch (e) {
    fail(`${c.id}@${c.version}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── 2) ZERTIFIZIERT-VOLLSTÄNDIG (enabled ⇒ certifiable) ──────────────────────
let enabledCount = 0;
for (const c of composables) {
  if (!istEnabled(c)) continue;
  enabledCount++;
  const { certifiable, fehlend } = certificationReadiness(c);
  if (!certifiable)
    fail(
      `${c.id}@${c.version} ist enabled (${c.status}), aber nicht vollständig — fehlend: ${fehlend.join(", ")}`,
    );
}

// ── 3) EINDEUTIGE (id,version) ──────────────────────────────────────────────
const gesehen = new Set<string>();
for (const c of composables) {
  const key = `${c.id}@${c.version}`;
  if (gesehen.has(key)) fail(`doppeltes Composable: ${key}`);
  gesehen.add(key);
}

if (fehler.length > 0) {
  console.error("check:composables FEHLGESCHLAGEN:");
  for (const f of fehler) console.error(`  - ${f}`);
  process.exit(1);
}

const spines = composables.filter((c) => c.spine).length;
console.log(
  `composables ok — ${composables.length} deklariert · ${enabledCount} enabled · ${spines} mit Spine-Agent · alle wohlgeformt + zertifiziert-vollständig.`,
);
