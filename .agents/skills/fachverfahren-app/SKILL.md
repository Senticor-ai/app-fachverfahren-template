---
name: fachverfahren-app
description: Build or extend a Fachverfahren from this template by filling the ONE exchange seam (apps/fachverfahren/src/leistung.config.ts), emitting the contract snapshot, and validating with the real repo checks. Also covers full-repo scaffolding and standalone export.
---

# Fachverfahren App

Der Startpunkt für jeden Fachverfahren-Build aus diesem Template — für
automatisierte Build-Agenten genauso wie für Entwickler:innen ohne weiteres
Tooling. Root-Policy und Pfad-Karte: `AGENTS.md`.

## Kernprinzip

Dieses Repository ist die FERTIGE Startbasis. Ein neues Fachverfahren entsteht
durch das Füllen GENAU EINER Datei mit Fachdaten:

```text
apps/fachverfahren/src/leistung.config.ts
```

Die App rendert drei Personas (Bürger:in `/buerger`, Sachbearbeitung `/amt`,
Aufsicht `/aufsicht`) allein aus dieser `LeistungConfig`. Es wird KEIN
fachlicher Server, kein eigenes `index.html` und keine eigene
Komponenten-Bibliothek gebaut — die neutrale Fastify-Web-Runtime existiert in
`apps/fachverfahren/server`, die Bausteine existieren in
`packages/fachverfahren-kit`.

## Workflow (Naht füllen)

1. `AGENTS.md` lesen: Naht-Vertrag, Annahme-DATEN-Konvention, Pfad-Karte.
2. Optionaler vendor-neutraler Einstieg:

   ```bash
   pnpm run agent:bootstrap -- --json
   pnpm run agent:discover -- --json
   pnpm run agent:context -- --task <app-spec> --paths <pfad>
   ```

3. `apps/fachverfahren/src/leistung.config.ts` mit den Werten des
   freigegebenen Fachkonzepts füllen: `id/label/kommune`,
   `rechtsgrundlagen` (nur belegt), `antrag.steps` (Pflichtfelder mit
   Validierung; Bürger-Felder zusätzlich mit `leichteSprache`/`hintEinfach`
   im selben Schritt — siehe „Bürger-Sprache" unten), `statusMachine`
   (Endzustände `terminal: true`, kritische Übergänge `vierAugen: true`),
   `berechne` (rein, deterministisch, GANZE EURO, jede
   Tarifstufe/Befreiung/Ermäßigung als eigene Verzweigung, `status:
"provisional" | "final"`), `register`, `detailSektionen` sowie `ki` und
   `seed` (im Typ optional — setzen, damit Aufsicht und Sachbearbeitung
   sofort arbeiten). Optionale Signale (`ePayment`, `zustellung`, `termin`,
   `adressValidierung`, `personas`, `fimLeistung`, `nachweise`) nur setzen,
   wenn das Fachkonzept sie vorsieht.
4. Unbekannte Satzungswerte als markierte Annahme-DATEN führen
   (`// annahme <wert> EUR — TBD-<QUELLE>`), nie als Fakt in
   Anzeige-Strings.
5. NACH jedem Naht-Write den Vertrags-Snapshot erzeugen und mitliefern:

   ```bash
   pnpm --filter @senticor/fachverfahren emit:contract
   ```

6. Verifizieren und im Browser prüfen:

   ```bash
   pnpm run typecheck
   pnpm run test
   pnpm run dev
   ```

## Vollständigkeits-Checkliste (KRITISCH)

Der häufigste Fehl-Build ist NICHT ein Absturz — es ist ein **Demo-Klon**: die
Naht wird geschrieben, aber sie trägt weiter die Platzhalterwerte des Templates
(`id: "musterantrag"`, `DEMO_TARIF`, `berechneDemo`). Sie kompiliert, rendert
drei Sichten — und ist trotzdem falsch, weil KEIN Fachwert übernommen wurde.
Die produkt-Gates blocken das korrekt (siehe nächster Abschnitt). Diese
Checkliste verhindert es.

**Regel: JEDER normativ vorgegebene Wert des Fachkonzepts MUSS als DATEN in der
Naht erscheinen — kein Wert fehlt, keiner ist erfunden.** Konkret, vor dem
`emit:contract`:

- [ ] **Identität real.** `id`/`label`/`kommune` tragen das echte Verfahren, nie
      `musterantrag`/`Musterantrag`/`Stadt Musterstadt`/`musterbescheinigung`.
      `id` ist der Slug des Fachkonzepts.
- [ ] **Jeder Geld-/Tarifwert** aus der PRD-Parameter-Tabelle und Kap.
      `06-regeln` erscheint als Zahl in der Config — als `tarif.staffeln[].betrag`,
      als benannte Konstante in `berechne`, oder als `betrag` einer
      `Berechnung.positionen`. Grep-Test: jeder Euro-Betrag des Fachkonzepts ist
      als Literal in `leistung.config.ts` auffindbar.
- [ ] **Jede Tarif-/Staffelstufe** (erster/zweiter/weiterer Fall, Klassen,
      Mengenstufen) ist eine eigene, prüfbare Verzweigung bzw. `TarifStaffel` —
      nicht ein einziger Pauschalsatz.
- [ ] **Jeder Befreiungs-/Ermäßigungstatbestand** aus Kap. `06-regeln`
      existiert entweder als eigener `berechne`-Zweig (mit `normRef`/`norm`) oder
      als `Codeliste`-Eintrag mit `belege`/`normRef`. Kein Tatbestand fehlt.
- [ ] **Jede anteilige/zeitabhängige Berechnung** (Monatsprinzip,
      Tagesanteil, Stichtag) ist als echte Arithmetik in `berechne` ODER als
      deklarierte `fristenTypen`/`FristDauer`-Daten geführt — nie als Prosa im
      `begruendung`-String behauptet.
- [ ] **Jede Codeliste/Enumeration** (Kategorien, Klassen, Zwecke) aus Kap.
      `05-datenmodell` ist als `datenlisten`/`codelisten` oder `FeldOption[]`
      geführt — vollständig, mit Provenienz.
- [ ] **Rechtsgrundlagen belegt.** `rechtsgrundlagen`/`fimLeistung` tragen nur
      belegte Normen; unbelegte Werte folgen der Annahme-DATEN-Konvention
      (`// annahme … — TBD-<QUELLE>`), nie als Fakt.
- [ ] **`berechne` ist verfahrensspezifisch.** Kein `DEMO_TARIF`, kein
      `berechneDemo`, keine Delegation an den Kit-Default für ein Verfahren, das
      Fachkonzept-Tarife hat.

Wenn ein Wert im Fachkonzept fehlt: NICHT erfinden — als markierte Annahme
führen (`// annahme <wert> <einheit> — TBD-<QUELLE>`) und im Abschlussbericht als
offene Validierungsfrage melden. Fehlt zu viel für eine ehrliche Naht, siehe
„Agentische Arbeitsweise" Punkt (f): Bedarf signalisieren statt Demo klonen.

## produkt-Gates: was sie prüfen und wie man sie besteht

Zwei Gates der Fabrik prüfen genau die obige Vollständigkeit gegen das
Fachkonzept. Sie sind keine Schikane — sie fangen den Demo-Klon.

**`produkt-werte-geerdet`** — jeder Geldwert des Fachkonzepts findet sich als
Zahl in der Config. Bestehen: jeden Betrag aus der PRD-Parameter-Tabelle/Kap.
`06-regeln` als Literal in `leistung.config.ts` unterbringen (Tarif-Staffel,
`berechne`-Konstante oder `positionen[].betrag`). Ein im Fachkonzept genannter
Euro-Betrag, der NICHT als Zahl in der Naht steht, lässt das Gate ROT werden.
Umgekehrt: eine Zahl in der Naht, die im Fachkonzept nicht vorkommt (erfunden),
ist ebenso ein Fehler — jeder Wert braucht seine Fundstelle (`normRef`/Annahme).

**`produkt-regeln-vollstaendig`** — jeder Befreiungs-/Ermäßigungstatbestand als
Zweig oder Codelisten-Eintrag; jede anteilige Berechnung als Arithmetik ODER
deklarierte Fristen-Daten. Bestehen: für jeden Tatbestand aus Kap. `06-regeln`
eine `if`-Verzweigung in `berechne` (mit eigener `positionen`-Zeile + `norm`)
oder einen `codelisten`-Eintrag mit `belege`/`normRef` anlegen; jede
Monats-/Tagesanteil-Regel als Rechnung (siehe Beispiel unten) statt als Satz im
`begruendung`-String. Ein Tatbestand, der nur im Prosatext erwähnt, aber nicht
als Datenzweig modelliert ist, lässt das Gate ROT werden.

Beide Gates lokal vorwegnehmen: nach dem Naht-Write `emit:contract` +
`typecheck` + `test` laufen lassen (siehe Workflow Schritt 5–6) und die eigene
Naht gegen diese Checkliste durchgehen, BEVOR die Fabrik prüft.

## Reiches Beispiel: ein komplexes `berechne`

Das Demo-`berechneDemo`/`berechneBescheinigung` ist bewusst simpel (ein
Pauschalsatz je Kategorie). Ein reales Verfahren ist reicher: **mehrstufiger
Tarif + mehrere Befreiungs-/Ermäßigungstatbestände als eigene Zweige + anteilige
Arithmetik**. Dieses durchgearbeitete Beispiel (Hundesteuer-Schema, Werte
illustrativ/aus Satzung bzw. als Annahme markiert) ist typ-konform zum echten
`Berechnung` (`--strict`, `NodeNext`) und zeigt die Zielhöhe:

```ts
// Fachwerte aus dem Fachkonzept (Kap. 06-regeln + PRD-Parameter-Tabelle) — jeder
// Geldwert eine benannte, geerdete Konstante (belegt ODER als Annahme markiert):
const TARIF = {
  ersterHund: 120, // § 5 Abs. 1 HStS
  zweiterHund: 180, // § 5 Abs. 2 HStS
  jederWeitere: 200, // § 5 Abs. 2 HStS
  gefaehrlicherHund: 600, // § 6 Abs. 1 HStS (je gefährlicher Hund)
} as const;
const ERMAESSIGUNG_TIERHEIM = 0.5; // § 7 Abs. 2 HStS — 50 % im ersten Jahr

type HundesteuerAntrag = {
  hunde: { anzahl: number; gefaehrlich?: boolean; ausTierheim?: boolean };
  halter: { assistenzhund?: boolean };
  anmeldung: { monatAbDem: number }; // 1..12 — angefangener Monat der Steuerpflicht
};

function berechneHundesteuer(a: HundesteuerAntrag): Berechnung {
  const anzahl = Math.max(0, Math.trunc(a?.hunde?.anzahl ?? 0));

  // provisional, solange die für die Subsumtion nötige Kernangabe fehlt:
  if (anzahl < 1) {
    return {
      betrag: 0,
      einheit: "EUR/Jahr",
      label: "Hundesteuer",
      begruendung:
        "Bitte die Anzahl der Hunde angeben, um die Steuer zu bestimmen.",
      status: "provisional",
      positionen: [],
    };
  }

  // BEFREIUNGSTATBESTAND 1 (eigener Zweig): Blinden-/Assistenzhund → 0 €
  if (a?.halter?.assistenzhund) {
    return {
      betrag: 0,
      einheit: "EUR/Jahr",
      label: "Hundesteuer — Befreiung",
      begruendung:
        "Steuerbefreiung für einen Blinden-/Assistenzhund (§ 8 Abs. 1 HStS).",
      begruendungBuerger:
        "Für einen Assistenzhund zahlen Sie keine Hundesteuer.",
      status: "final",
      positionen: [
        { label: "Befreiung Assistenzhund", betrag: 0, norm: "HStS#§8" },
      ],
      herkunft: "deterministisch",
    };
  }

  // MEHRSTUFIGER TARIF — jede Stufe eine eigene, prüfbare Position:
  const positionen: Berechnung["positionen"] = [];
  let jahresbetrag = 0;
  const gefaehrlich = a?.hunde?.gefaehrlich === true;
  for (let n = 1; n <= anzahl; n++) {
    let satz: number;
    let norm: string;
    let label: string;
    if (gefaehrlich) {
      satz = TARIF.gefaehrlicherHund;
      norm = "HStS#§6";
      label = `Gefährlicher Hund ${n}`;
    } else if (n === 1) {
      satz = TARIF.ersterHund;
      norm = "HStS#§5";
      label = "Erster Hund";
    } else if (n === 2) {
      satz = TARIF.zweiterHund;
      norm = "HStS#§5";
      label = "Zweiter Hund";
    } else {
      satz = TARIF.jederWeitere;
      norm = "HStS#§5";
      label = `Weiterer Hund ${n}`;
    }
    jahresbetrag += satz;
    positionen.push({ label, betrag: satz, norm });
  }

  // ERMÄSSIGUNGSTATBESTAND 2 (eigener Zweig): Hund aus Tierheim → 50 % im 1. Jahr
  if (a?.hunde?.ausTierheim) {
    const abschlag = Math.round(jahresbetrag * ERMAESSIGUNG_TIERHEIM);
    jahresbetrag -= abschlag;
    positionen.push({
      label: "Ermäßigung Tierheim-Hund (50 %)",
      betrag: -abschlag,
      norm: "HStS#§7",
    });
  }

  // ANTEILIGE BERECHNUNG als ARITHMETIK (nicht als Prosa): bei unterjähriger
  // Anmeldung nur die verbleibenden angefangenen Monate (§ 4 Abs. 2 HStS):
  const startMonat = Math.min(
    12,
    Math.max(1, Math.trunc(a?.anmeldung?.monatAbDem ?? 1)),
  );
  const monate = 12 - startMonat + 1;
  const betrag = Math.round((jahresbetrag * monate) / 12); // GANZE Euro
  if (monate < 12) {
    positionen.push({
      label: `Anteilig ${monate}/12 Monate`,
      betrag: betrag - jahresbetrag,
      norm: "HStS#§4",
    });
  }

  return {
    betrag,
    einheit: "EUR/Jahr",
    label: "Hundesteuer",
    begruendung:
      `Jahressteuer ${jahresbetrag} € für ${anzahl} Hund(e)` +
      (a?.hunde?.ausTierheim
        ? " abzüglich 50 % Tierheim-Ermäßigung (§ 7 HStS)"
        : "") +
      (monate < 12
        ? `, anteilig für ${monate} von 12 Monaten (§ 4 HStS)`
        : "") +
      ".",
    begruendungRecht:
      `Festsetzung nach §§ 4–7 HStS: Staffeltarif (${anzahl} Hund(e))` +
      (a?.hunde?.ausTierheim ? ", Ermäßigung § 7 Abs. 2 HStS" : "") +
      (monate < 12 ? `, Monatsprinzip § 4 Abs. 2 HStS (${monate}/12)` : "") +
      ".",
    status: "final",
    positionen, // Summe der positionen == betrag (Prüf-Invariante des Tests)
    herkunft: "deterministisch",
  };
}
```

Merkmale, die dieses Beispiel vom Demo abhebt und die ein reales `berechne`
tragen sollte: (1) **`status: "provisional"`** solange Kernangaben fehlen, sonst
`"final"`; (2) **mehrstufiger Tarif** mit einer Position je Stufe; (3) **jeder
Befreiungs-/Ermäßigungstatbestand ein eigener Zweig** mit eigener `positionen`-
Zeile und `norm`; (4) **anteilige Logik als Arithmetik**, nicht als Satz; (5)
**`positionen` summieren sich zum `betrag`** (das ist die Invariante, gegen die
der generierte `berechnung.test.ts` prüft — mit den Beispielwerten des
Fachkonzepts); (6) **GANZE Euro** (`Math.round`), Einheit `"EUR/Jahr"`. Für rein
tabellarische Tarife ohne Sonderlogik ist `LeistungConfig.tarif` (Staffeln als
DATEN) der Escape-Hatch — `berechne` ist für die nicht-tabellarische Subsumtion.

## Agentische Arbeitsweise (wie ein Top-Coding-Agent)

Der Build-Agent ist kein Formular-Ausfüller, sondern ein fähiger Coding-Agent.
Für ein komplexes Verfahren gilt:

**(a) Erst PLAN + TASK-LISTE.** Vor dem ersten Naht-Write eine Reihenfolge
festlegen und abarbeiten:

1. **Identität** — `id`/`label`/`kommune`/`rechtsgrundlagen`/`fimLeistung` aus
   dem Fachkonzept (real, belegt).
2. **Felder** — `antrag.steps`/`FeldDef` aus Kap. `05-datenmodell`
   (Pflicht/Validierung; Bürger-Felder mit `leichteSprache`/`hintEinfach`).
3. **statusMachine** — `states` (Endzustände `terminal`), `transitions`
   (`rollen`, kritische mit `vierAugen`, `detailPflicht`).
4. **Tarif/Codelisten** — jede Staffel, Codeliste, Enumeration als DATEN.
5. **`berechne`** — mehrstufiger Tarif + jeder Befreiungs-/Ermäßigungszweig +
   anteilige Arithmetik (siehe Beispiel), plus `berechnung.test.ts` gegen die
   Fachkonzept-Beispielwerte.
6. **Verifizieren** — Loop bis grün (Punkt c).

**(b) Fachwerte selbst RETRIEVEN.** Nicht auf einen vollständigen Push warten:
die Fachkonzept-Kapitel selbst lesen (`06-regeln`, `05-datenmodell`,
PRD-Parameter-Tabelle) und die konkreten Tarife/Tatbestände/Fristen dort
herausziehen. Fehlt eine belegte Quelle, Websuche auf offizielle Fachquellen
(`fimportal.de` für Struktur, registrierte Quellen via `source:fetch`) — sonst
Annahme-DATEN-Konvention.

**(c) Nach dem Schreiben SELBST verifizieren und im LOOP korrigieren:**

```bash
pnpm run typecheck
pnpm --filter @senticor/fachverfahren emit:contract
pnpm run test
```

Bei Fehlern (tsc-Fehler, fehlgeschlagener `berechnung.test.ts`, veralteter
Contract) den Fehler lesen, die Naht korrigieren, erneut laufen — bis grün. Nicht
mit rotem Zustand abschließen und nicht die Verifikation überspringen.

**(d) Bei Bedarf CODE bauen, nicht nur Daten.** Komplexe Arithmetik gehört in
Helfer-Funktionen (`berechneHundesteuer`, `anteiligMonate(...)`) mit klaren
Namen — genau wie im Beispiel. `berechne` ist eine reine TS-Funktion; der Agent
schreibt echten, testbaren Code, wo Staffel-Daten allein nicht reichen.

**(e) NON-STANDARD-Verfahren mit eigenem Code lösen.** Sprengt ein Verfahren die
Standard-Config-Form (mehrere gekoppelte Berechnungen, verschachtelte
Fallunterscheidungen, prozessuale Sonderlogik), dann diese Logik in `berechne`
bzw. `nachweise`-Escape-Hatches und ggf. `automationen`/`prozesse` als DATEN
ausmodellieren — statt die Fachlogik wegzulassen. Kit-Interna bleiben trotzdem
tabu (siehe „Grenzen"); die Fachlogik lebt in der Naht.

**(f) Budget nicht genug? Bedarf klar signalisieren.** Reicht das Budget nicht
für eine vollständige, ehrliche Naht, dann den konkreten Rest-Bedarf benennen
(welche Werte/Tatbestände fehlen, welche Quelle) und einen sauberen
Zwischenstand mit markierten Annahmen liefern — NIEMALS eine unvollständige Naht
als fertig ausgeben oder das Demo als „das Verfahren" belassen. Eine ehrliche,
teil-annotierte Naht ist besser als ein Demo-Klon.

## Failure-Modes (explizit vermeiden)

Diese fünf Muster produzieren einen scheinbar fertigen, real falschen Build —
die produkt-Gates fangen sie, aber der Agent soll sie gar nicht erst erzeugen:

- **Demo-Klon mit Platzhaltern.** Die Naht schreiben, aber `DEMO_TARIF`/
  `berechneDemo`/Musterfelder stehenlassen. → Alle Fachwerte übernehmen.
- **`id: "musterantrag"` belassen** (oder `label`/`kommune` als Muster). →
  Identität real setzen.
- **Tarifwerte/Befreiungen weglassen.** Nur einen Pauschalsatz statt der
  Staffel, oder Befreiungstatbestände „vergessen". → Vollständigkeits-Checkliste.
- **`berechne` an den Kit-Default delegieren** für ein Verfahren, das
  Fachkonzept-Tarife hat. → Verfahrensspezifisches `berechne` schreiben.
- **Werte erfinden** statt aus dem Fachkonzept ziehen. → Nur belegte Werte;
  Unbekanntes als markierte Annahme, nie als Fakt.

## Bürger-Sprache: Leichte Sprache und Fachbegriffe

`FeldDef` trägt zwei optionale, ADDITIVE Sprachvarianten
(`packages/fachverfahren-kit/src/types.ts`), die niemals `label`/`hint`
ersetzen, sondern bei fehlendem Wert sauber darauf zurückfallen:

- `leichteSprache` — LEICHTE-SPRACHE-Fassung des Labels (DIN SPEC 33429).
- `hintEinfach` — vereinfachter Hilfetext für den Leichte-Sprache-Modus.

```ts
{
  name: "antragsteller.vorname",
  label: "Vorname",
  leichteSprache: "Ihr Vorname",
  typ: "text",
  required: true,
}
```

Das Gegenstück `labelFachlich` (Amts-/Fachbezeichnung) geht in die
ENTGEGENGESETZTE Richtung — es blendet für die Sachbearbeitung den Fachbegriff
ein, nie eine vereinfachte Fassung. Beide Felder nicht verwechseln.

**Nur Bürger-Seite.** `leichteSprache`/`hintEinfach` werden ausschließlich von
`AntragStepper` gelesen, das ausschließlich unter `/buerger*` gemountet ist
(`apps/fachverfahren/src/App.tsx`). Sachbearbeitung (`/amt*`) liest diese
Felder nie — für Fachbegriffe in der Sachbearbeitung ist `labelFachlich`
zuständig. Kein Sachbearbeitung-Anwendungsfall für Leichte Sprache erfinden.

**Reihenfolge.** `leichteSprache`/`hintEinfach` gehören in GENAU DEN
Naht-Write, der das Feld anlegt — nie in eine spätere, getrennte
Anreicherungsphase. Läuft eine Anreicherung trotzdem separat, MUSS
`emit:contract` (Schritt 5) strikt danach laufen, nie davor: sonst ist
`leistung.contract.json` gegenüber der Config veraltet und
`check:leistung-contract` schlägt fehl. Ein lokaler Git-Hook regeneriert den
Snapshot zusätzlich vor jedem Commit (`docs/reference/precommit-hooks.md`) —
das ist nur ein Sicherheitsnetz für Commits durch dieses Repo hindurch, kein
Ersatz für die richtige Reihenfolge in einer externen Generierungs-Pipeline,
die eigene Commits ohne diese Git-Hooks erzeugt.

## Quellen-Lookup

- Websuche ist für offizielle Fachquellen erlaubt; für deutsche
  Verwaltungsleistungen darf `https://fimportal.de` durchsucht und FIM-IDs,
  Namen und Hierarchie als Strukturquelle verwendet werden.
- FIM ist Strukturquelle, nicht vollständige Rechtsgrundlage. Konkrete
  Satzungen, Gebühren, Fristen und lokale Regeln brauchen die zuständige
  Quelle oder die Annahme-DATEN-Konvention aus `AGENTS.md`.
- Für in `sources/registry.yaml` registrierte Quellen `source:fetch` nutzen.
- Quell-URLs und IDs dort festhalten, wo sie Verhalten begründen
  (`rechtsgrundlagen`, `fimLeistung`, Tests, Abschlussbericht).

## Grenzen

- Kit-Interna (`packages/fachverfahren-kit/src/components|ui`) und die dünne
  App-Komposition (`App.tsx`, `store.ts`, `main.tsx`) werden für einen
  Verfahrens-Build nicht geändert.
- `apps/fachverfahren/leistung.contract.json` ist generiert — nur via
  `emit:contract`.
- Der Modul-Pfad `modules/<domain>/` (Generator `app:new`) erzeugt ein
  Artefakt-Gerüst, das die laufende App NICHT einbindet (PLAN) — siehe
  `modules/README.md`. Für eine klickbare App zählt nur die Naht.
- Bei Kit-/UI-Änderungen (Plattformarbeit) vorher
  `.agents/skills/ux-ui/SKILL.md` lesen.

## Full-Repo-Scaffold und Standalone-Export

Neues vollständiges Repository über den Template-Lifecycle:

```bash
pnpm run scaffold:domain-app -- --domain <domain> --display-name <name> --target <target-dir> --allow-existing-empty
```

Generierte Repositories tragen `.template/`-Provenienz; Updates laufen über
`template:status`, `template:diff -- --to <version>`,
`template:update -- --to <version>`. `--force` nur für bewusstes Ersetzen;
`--allow-dirty` nur mit ausdrücklicher menschlicher Freigabe.

App-only-Export (kopiert `apps/fachverfahren`, löst `catalog:`- und
`workspace:*`-Versionen auf, schreibt `standalone-export-report.json`):

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

## CI-Hinweise

- GitLab/opencode.de-Runner sind unprivilegierte Kubernetes-Pods: Kaniko statt
  Docker-in-Docker.
- pnpm-Filter stehen vor `run`:
  `pnpm --filter "./packages/**" run --if-present build`.
- Reale Build-Kette: `pnpm run build:packages`, dann `pnpm run build:app`,
  dann `pnpm run build:server`.
