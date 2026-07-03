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
import { toContractSnapshot } from "../packages/fachverfahren-kit/src/contract-snapshot.ts";
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
  fail(
    "leistung.contract.json ist NICHT frisch (Config geändert?) — `pnpm --filter @senticor/fachverfahren emit:contract` ausführen und committen.",
  );
}

// ── 2) STRUKTUR (generisch) ───────────────────────────────────────────────────
if (!snap.id || typeof snap.id !== "string") fail("contract.id fehlt/leer.");
if (!snap.label || typeof snap.label !== "string")
  fail("contract.label fehlt/leer.");
if (!snap.kommune || typeof snap.kommune !== "string")
  fail("contract.kommune fehlt/leer.");

if (!Array.isArray(snap.rechtsgrundlagen) || snap.rechtsgrundlagen.length < 1)
  fail("contract.rechtsgrundlagen muss mind. 1 Norm enthalten (Geerdet-Prinzip).");

const steps = snap.antrag?.steps ?? [];
if (!Array.isArray(steps) || steps.length < 1)
  fail("contract.antrag.steps muss mind. 1 Schritt enthalten.");

// StatusMachine — widerspruchsfrei.
const sm = snap.statusMachine;
if (!sm || !Array.isArray(sm.states) || sm.states.length < 1) {
  fail("contract.statusMachine.states muss mind. 1 Zustand enthalten.");
} else {
  const keys = new Set(sm.states.map((s) => s.key));
  if (!sm.initial || !keys.has(sm.initial))
    fail(
      `contract.statusMachine.initial ("${sm.initial}") ist kein definierter Zustand.`,
    );
  const terminals = sm.states.filter((s) => s.terminal);
  if (terminals.length < 1)
    fail("contract.statusMachine hat keinen Endzustand (terminal: true).");

  const transitions = Array.isArray(sm.transitions) ? sm.transitions : [];
  for (const t of transitions) {
    if (!keys.has(t.from))
      fail(`Übergang referenziert unbekannten from-Zustand "${t.from}".`);
    if (!keys.has(t.to))
      fail(`Übergang referenziert unbekannten to-Zustand "${t.to}".`);
    if (!Array.isArray(t.rollen) || t.rollen.length < 1)
      fail(`Übergang ${t.from}→${t.to} trägt keine Rollen (rollen[]).`);
  }
  // Keine Sackgasse: jeder NICHT-terminale Zustand hat mind. einen ausgehenden Übergang.
  const hatAusgang = new Set(transitions.map((t) => t.from));
  for (const s of sm.states) {
    if (!s.terminal && !hatAusgang.has(s.key))
      fail(
        `Zustand "${s.key}" ist nicht terminal, hat aber keinen ausgehenden Übergang (Sackgasse).`,
      );
  }
  // Erreichbarkeit: alle Zustände vom Initial aus erreichbar (kein Orphan).
  const adj = new Map<string, string[]>();
  for (const t of transitions) {
    if (!adj.has(t.from)) adj.set(t.from, []);
    adj.get(t.from)!.push(t.to);
  }
  const gesehen = new Set<string>([sm.initial]);
  const stapel = [sm.initial];
  while (stapel.length) {
    const cur = stapel.pop()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!gesehen.has(nxt)) {
        gesehen.add(nxt);
        stapel.push(nxt);
      }
    }
  }
  for (const s of sm.states) {
    if (!gesehen.has(s.key))
      fail(`Zustand "${s.key}" ist vom Initialzustand aus nicht erreichbar.`);
  }
}

if (!Array.isArray(snap.detailSektionen) || snap.detailSektionen.length < 1)
  fail("contract.detailSektionen muss mind. 1 Sektion enthalten (SB-Detailsicht).");

const suchfelder = snap.register?.suchfelder;
if (!Array.isArray(suchfelder) || suchfelder.length < 1)
  fail("contract.register.suchfelder muss mind. 1 Once-Only-Suchfeld enthalten.");

// ── Ergebnis ──────────────────────────────────────────────────────────────────
if (fehler.length > 0) {
  console.error("leistung-contract-Verstöße:");
  for (const f of fehler) console.error(`- ${f}`);
  process.exitCode = 1;
} else {
  console.log(
    `leistung-contract ok — ${snap.id} · ${steps.length} Schritte · ${snap.statusMachine.states.length} Status · ${snap.detailSektionen.length} Detail-Sektionen · frisch.`,
  );
}
