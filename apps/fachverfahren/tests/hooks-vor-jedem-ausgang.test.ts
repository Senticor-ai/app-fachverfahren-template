// hooks-vor-jedem-ausgang — KEIN React-Hook steht hinter einem bedingten `return`.
//
// ## Der Anlass, gemessen 2026-09-08
//
// `LandingPage.tsx` rief `useDokumentTitel(store.config)` NACH `if (view === "loading") return null;`.
// React zaehlt Hooks je Render: beim Uebergang `loading` -> geladen sprang die Zahl von 3 auf 4, React warf
// «Rendered more hooks than during the previous render», und die Fehlergrenze zeigte
// «Die App konnte nicht geladen werden» — auf der ERSTEN Seite, die ein Buerger sieht.
//
// ⛔ ES TRAF JEDE ERZEUGTE ANWENDUNG. Die Vorlage wird geklont; der Fehler reiste mit. In drei gleichzeitig
// vermessenen Verfahren stand er im `_devserver.log`, und `.chos/preview-thumbnails/buerger.png` ist in allen
// dreien ein FOTO dieser Fehlerseite — aufgenommen von der Preview-Phase, die den Lauf danach `done` und
// `appUsable: true` gemeldet hat. Kein Gate sah es: 0 Treffer fuer «more hooks» in builder-summary,
// evidence, run-errors und boot-smoke. Ein Zeuge, der die SEITE rendert, haette ihn gefunden; es gab keinen.
//
// ## Warum ein QUELLTEXT-Riegel und kein Render-Zeuge
//
// Ein Render-Zeuge findet den Fall nur fuer die Komponente, die er montiert — und die Klasse trifft JEDE.
// Dieser Riegel liest die Aufrufregel selbst: ein Hook steht vor jedem bedingten Ausgang, ausnahmslos.
// Er ist bewusst SYNTAKTISCH und damit grob; seine Positiv- und Negativkontrollen unten sagen, was er
// wirklich kann.
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..", "..", "..");
const REVIERE = ["apps", "packages"];

/** ⛔ BEIDE MUSTER VERLANGEN GENAU ZWEI LEERZEICHEN EINRUECKUNG — und das ist der ganze Riegel.
 *
 *  Der erste Wurf liess 0–4 Leerzeichen zu und meldete daraufhin ACHT Stellen in `amt-akte.tsx` sowie
 *  `Arbeitsvorrat.tsx` und `CameraCapture.tsx`. Nachgesehen: jedes dieser `if (…) return` steht INNERHALB
 *  eines `useCallback(async () => { … })`, also in einer geschachtelten Funktion — dort ist ein frueher
 *  Ausgang voellig richtig und beruehrt die Hook-Reihenfolge der Komponente nicht.
 *  ⛔ Ein Tor mit Falsch-Positiven blockiert richtige Arbeit und sieht dabei aus wie Sorgfalt. Auf der
 *  ERSTEN Ebene einer Komponente stehen Anweisungen mit genau zwei Leerzeichen; alles Tiefere gehoert
 *  einer inneren Funktion. Das ist eine Konvention, keine Grammatik — und deshalb sagt die Negativ-
 *  Kontrolle unten ausdruecklich, was der Riegel NICHT kann. */
const HOOK = /^ {2}(?:const\s+[^=]+=\s*)?(use[A-Z]\w*)\s*\(/;
const BEDINGTER_AUSGANG = /^ {2}if\s*\(.*\)\s*(?:\{\s*)?return\b/;
/** Der Beginn einer neuen Funktion/Komponente setzt die Zaehlung zurueck. */
const FUNKTIONS_BEGINN =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+|^(?:export\s+)?const\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?\(|^\s{0,2}(?:export\s+)?function\s+\w+/;

/** Hooks, die KEINE sind: Namen, die zufaellig mit `use` beginnen, aber nichts registrieren. */
const KEINE_HOOKS = new Set(["useState", "useRef"].filter(() => false));

type Fund = { datei: string; zeile: number; hook: string; ausgang: number };

function sammle(): {
  funde: Fund[];
  dateien: number;
  hooks: number;
  ausgaenge: number;
} {
  const funde: Fund[] = [];
  let dateien = 0,
    hooks = 0,
    ausgaenge = 0;
  const gehe = (dir: string): void => {
    let e: fs.Dirent[];
    try {
      e = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const x of e) {
      if (x.name === "node_modules" || x.name === "dist" || x.name === ".git")
        continue;
      const p = path.join(dir, x.name);
      if (x.isDirectory()) {
        gehe(p);
        continue;
      }
      if (!/\.tsx$/.test(x.name) || /\.test\.tsx$/.test(x.name)) continue;
      dateien++;
      let ausgangZeile = 0;
      fs.readFileSync(p, "utf8")
        .split("\n")
        .forEach((z, i) => {
          if (FUNKTIONS_BEGINN.test(z)) {
            ausgangZeile = 0;
            return;
          }
          if (BEDINGTER_AUSGANG.test(z)) {
            ausgaenge++;
            if (!ausgangZeile) ausgangZeile = i + 1;
            return;
          }
          const m = HOOK.exec(z);
          if (!m || KEINE_HOOKS.has(m[1])) return;
          hooks++;
          if (ausgangZeile)
            funde.push({
              datei: path.relative(WURZEL, p),
              zeile: i + 1,
              hook: m[1],
              ausgang: ausgangZeile,
            });
        });
    }
  };
  for (const r of REVIERE) gehe(path.join(WURZEL, r));
  return { funde, dateien, hooks, ausgaenge };
}

test("VORBEDINGUNG: der Scan hat wirklich Komponenten gelesen", () => {
  const { dateien, hooks, ausgaenge } = sammle();
  // TAUTOLOGIE-SPERRE: ohne Material waere jede Zusicherung darunter leer-wahr.
  assert.ok(dateien >= 10, `nur ${dateien} .tsx gelesen`);
  assert.ok(
    hooks >= 20,
    `nur ${hooks} Hook-Aufrufe gefunden — die Suchform trifft nicht`,
  );
  assert.ok(
    ausgaenge >= 3,
    `nur ${ausgaenge} bedingte Ausgaenge gefunden — die Suchform trifft nicht`,
  );
});

test("POSITIV-KONTROLLE: die Suchform erkennt den gemessenen Fall", () => {
  const quelle = [
    "export function Landing() {",
    "  const store = useStore();",
    '  if (view === "loading") return null;',
    "  useDokumentTitel(store.config);",
    "}",
  ];
  let ausgang = 0;
  const treffer: string[] = [];
  quelle.forEach((z) => {
    if (FUNKTIONS_BEGINN.test(z)) {
      ausgang = 0;
      return;
    }
    if (BEDINGTER_AUSGANG.test(z)) {
      ausgang = 1;
      return;
    }
    const m = HOOK.exec(z);
    if (m && ausgang) treffer.push(m[1]);
  });
  assert.deepEqual(
    treffer,
    ["useDokumentTitel"],
    "der Riegel wuerde den historischen Fall nicht finden",
  );
});

test("NEGATIV-KONTROLLE: ein frueher Ausgang in einer INNEREN Funktion ist kein Fund", () => {
  // ⛔ DER GEMESSENE FALSCH-POSITIV: `if (!caseSummary) return …` steht in `amt-akte.tsx` innerhalb eines
  // `useCallback` — vier Leerzeichen tief. Der Riegel darf ihn NICHT sehen.
  const innen = [
    "  const fetchAkte = useCallback(async () => {",
    '    if (!caseSummary) return { kind: "notFound" };',
    "  }, []);",
    "  const x = useMemo(() => 1, []);",
  ];
  let ausgang = 0;
  const treffer: string[] = [];
  innen.forEach((z) => {
    if (FUNKTIONS_BEGINN.test(z)) {
      ausgang = 0;
      return;
    }
    if (BEDINGTER_AUSGANG.test(z)) {
      ausgang = 1;
      return;
    }
    const m = HOOK.exec(z);
    if (m && ausgang) treffer.push(m[1]);
  });
  assert.deepEqual(
    treffer,
    [],
    "der Riegel sieht einen Ausgang in einer INNEREN Funktion — Falsch-Positiv",
  );
});

test("NEGATIV-KONTROLLE: ein Hook VOR dem Ausgang ist kein Fund", () => {
  const quelle = [
    "export function Landing() {",
    "  useDokumentTitel(store.config);",
    '  if (view === "loading") return null;',
    "  return <div />;",
    "}",
  ];
  let ausgang = 0;
  const treffer: string[] = [];
  quelle.forEach((z) => {
    if (FUNKTIONS_BEGINN.test(z)) {
      ausgang = 0;
      return;
    }
    if (BEDINGTER_AUSGANG.test(z)) {
      ausgang = 1;
      return;
    }
    const m = HOOK.exec(z);
    if (m && ausgang) treffer.push(m[1]);
  });
  assert.deepEqual(
    treffer,
    [],
    "der Riegel meldet einen korrekten Aufbau als Fehler",
  );
});

test("DIE REGEL: kein Hook steht hinter einem bedingten Ausgang", () => {
  const { funde } = sammle();
  assert.deepEqual(
    funde,
    [],
    funde
      .map(
        (f) =>
          `${f.datei}:${f.zeile} ruft ${f.hook}() hinter dem bedingten Ausgang in Zeile ${f.ausgang}`,
      )
      .join("\n"),
  );
});
