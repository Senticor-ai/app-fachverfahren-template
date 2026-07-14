---
name: governance-vier-augen
description: Attach monotone four-eyes / governance opt-in to a Fachverfahren by adding LeistungConfig.governance.zusaetzlicheVierAugen — it only ever turns four-eyes ON over the declared statusMachine transitions and reaches the committed contract and the server-authoritative PROD path through effektiveLeistungConfig, never creating a second precedence-less truth.
---

# Governance Vier-Augen

Diese Capability baut ein zusätzliches Vier-Augen-/Governance-Opt-in an ein
bestehendes Verfahren an — additiv, strikt MONOTON, und so, dass die
verschärfte Regel den committeten Vertrag UND den server-autoritativen
PROD-Pfad erreicht (nie nur die DEV-Sicht). Sie ist für automatisierte
Build-Agenten (chos-code/gtc-builder) genauso gedacht wie für
Entwickler:innen. Der Verfahrens-Grundbau selbst entsteht über
`.agents/skills/fachverfahren-app/SKILL.md`; diese Capability erweitert nur
dessen Governance. Root-Policy und Pfad-Karte: `AGENTS.md`.

## Kernprinzip

Governance wird über GENAU EINEN additiven Block an der bestehenden
Austausch-Naht ausgedrückt — kein neuer Server, keine zweite Regel-Quelle:

```text
apps/fachverfahren/src/leistung.config.ts → LeistungConfig.governance.zusaetzlicheVierAugen
```

`governance.zusaetzlicheVierAugen` ist eine Liste von `{ from, to }`-Paaren.
Jedes nennt eine BEREITS in `statusMachine.transitions` deklarierte Transition,
die ZUSÄTZLICH Vier-Augen-pflichtig werden soll. Die effektive
Vier-Augen-Menge ist damit die OBERMENGE der deklarierten: Governance schaltet
Vier-Augen NUR AN, NIE ab (Opt-in-Monotonie).

Die EINE Ableitung dieser Obermenge ist die reine Funktion
`abgeleiteteTransitions(config)` in
`packages/fachverfahren-kit/src/lib/governance.ts`. Sie ist bewusst
self-contained (nur `import type`), deterministisch (kein Datum/Random) und
gibt ohne `governance`-Block die deklarierte Liste UNVERÄNDERT per Referenz
zurück — dann ist das Verhalten byte-identisch. Genau dieselbe Funktion speist
den DEV-Store, den PROD-Contract und das Gate: Es entsteht keine zweite,
präzedenzlose Governance-Wahrheit.

## Wie ein Build-Agent (chos-code/gtc-builder) es nutzt

1. **Zielübergänge bestimmen.** In `statusMachine.transitions` die kritischen
   Übergänge identifizieren, die das Fachkonzept vier-augen-pflichtig macht
   (z. B. eine Festsetzung, eine Ablehnung, ein Widerruf). Bereits mit
   `vierAugen: true` deklarierte Übergänge müssen NICHT erneut genannt werden
   (die Ableitung ist idempotent) — der Opt-in ist für Übergänge, die das
   Fachkonzept nachträglich/zusätzlich unter Governance stellt.
2. **Den `governance`-Block an die Config schreiben** (einzige Datei:
   `apps/fachverfahren/src/leistung.config.ts`):
   `governance.zusaetzlicheVierAugen` mit den `{ from, to }`-Paaren. `from`/`to`
   MÜSSEN exakt vorhandene Transitions-Schlüssel treffen — ein Opt-in auf eine
   nicht existierende Transition wird still ignoriert (kein Phantom, kein
   Crash), erzwingt aber auch nichts. Keine neuen Zustände/Übergänge hier
   erfinden; das ist Aufgabe der `statusMachine`.
3. **Den Vertrags-Snapshot NEU erzeugen** — er trägt danach die abgeleitete
   Vier-Augen-Menge, weil `emit:contract` die Config vor der Projektion durch
   `effektiveLeistungConfig(config)` schickt:

   ```bash
   pnpm --filter @senticor/fachverfahren emit:contract
   ```

4. **Verifizieren und im Loop korrigieren** (siehe „Gates & Verifikation"):

   ```bash
   pnpm run check:leistung-contract
   pnpm run typecheck
   pnpm run test
   ```

Was den PROD-Pfad schließt: Der committete `leistung.contract.json` trägt die
abgeleiteten `vierAugen`-Flags; der Server (`apps/fachverfahren/server`) liest
diese Contracts ein und baut daraus über `catalogFromStatusMachines` seinen
`ProcedureCatalog`. Jede Transition mit `vierAugen: true` wird dort zu
`requiredPermission: "case.decide"` + `requiresFourEyes: true` — server-seitig
erzwungen. Der Build-Agent muss dafür nichts am Server ändern: Der `governance`-
Block an der Naht plus `emit:contract` reicht bis in die PROD-Policy durch.

## Vertrag & Leitplanken

Was diese Capability ERZWINGT (nicht nur anbietet):

- **Strikt MONOTON (nur AN, nie ab).**
  `governanceMonotonieVerletzungen(config)` ist die positive Assertion: Sie
  liefert jede deklarierte Vier-Augen-Transition, die in der abgeleiteten Menge
  NICHT mehr vier-augen-pflichtig ist. Diese Liste MUSS leer sein — eine
  Ableitung, die Governance abschwächt, ist ein Fehler. Der Test verriegelt
  das; store.ts sieht nie schwächere Regeln als die Config.
- **EINE Wahrheit über drei Laufzeiten.** Der DEV-Store
  (`createFachverfahrenStore`) löst alle Übergänge über
  `abgeleiteteTransitions(config)` auf; `emit:contract` und das Gate projizieren
  über `effektiveLeistungConfig(config)`; der PROD-Server liest den daraus
  gebauten Contract. Alle drei leiten aus DERSELBEN reinen Funktion ab — keine
  zweite Governance-Quelle.
- **Server-autoritativ / HITL.** Die Vier-Augen-Pflicht ist eine Server-Policy
  (Contract → `ProcedureCatalog` → `case.decide`/`requiresFourEyes`), nicht nur
  eine Client-Anzeige. „Vier Augen" heißt ZWEI VERSCHIEDENE Personen: Der
  Vorbereiter ist der `akteur` des LETZTEN fachlichen Übergangs
  (`art: "uebergang"`, siehe `letzterVorbereiter`/`HISTORIE_ART_UEBERGANG`),
  nicht ein beliebiger History-Akteur — Metadaten-/Automations-Vermerke
  vergiften die Prüfung nicht.
- **Append-only Audit.** Die Prüfung stützt sich auf die revisionssichere,
  append-only `VorgangHistorie` (`art`/`akteur` load-bearing). Governance ändert
  nur, WELCHE Übergänge Vier-Augen brauchen — nie die Append-only-Natur des
  Logs.
- **Kollisionssicher (fail-closed).** Der Schlüssel eines `{ from, to }`-Paares
  nutzt den Trenner `U+0000`, damit keine zwei verschiedenen Paare denselben
  Schlüssel erzeugen (z. B. `"x"→"y z"` vs. `"x y"→"z"`). Ein Kollisions-Match
  würde die falsche Transition gaten — sicherheitsrelevant, daher eindeutig.
- **Additiv / rückwärtskompatibel.** Fehlt `governance` (oder ist die Liste
  leer), ist die effektive gleich der deklarierten Menge und der Contract bleibt
  byte-identisch (kein Snapshot-Diff). Der Block darf nur ergänzt, nie als
  Ersatz für `statusMachine`-Vier-Augen missbraucht werden.

## Gates & Verifikation

- `pnpm --filter @senticor/fachverfahren emit:contract` — regeneriert
  `leistung.contract.json` über `effektiveLeistungConfig` NACH jeder
  Config-Änderung. Vergessen ⇒ das Freshness-Gate schlägt fehl.
- `pnpm run check:leistung-contract` — Freshness (der frisch aus
  `effektiveLeistungConfig(leistungConfig)` gebaute Snapshot MUSS byte-gleich
  zum committeten `leistung.contract.json` sein) plus generische Struktur der
  StatusMachine. Fängt „Governance geändert, aber `emit:contract` vergessen".
- `pnpm run test` — führt `packages/fachverfahren-kit/src/lib/governance.test.ts`
  aus: Monotonie (`governanceMonotonieVerletzungen` bleibt leer), Idempotenz,
  Referenz-Identität ohne `governance`, kollisionssicherer Trenner und die
  Contract-Projektion durch `effektiveLeistungConfig`. Zusätzlich prüfen die
  Server-Tests, dass `vierAugen` zu `requiresFourEyes`/`case.decide` wird.
- `pnpm run typecheck` — verankert `LeistungConfig.governance` typisiert.
- `pnpm run check:agent-discovery` — verlangt für diesen kanonischen Skill den
  `.claude/skills/governance-vier-augen/`-Shim; nach dem Anlegen einmalig
  `pnpm run skills:shims` ausführen.

Diese Checks sind Teil der `precommit:check`-Kette; lokal vor dem Commit grün
ziehen.

## Minimalbeispiel

Generisch — die Zustands-/Übergangsschlüssel stammen aus der `statusMachine`
des jeweiligen Verfahrens, hier neutral gehalten (`leistung`/`vorgang`-Vokabular,
kein konkretes Fachverfahren):

```ts
import type { LeistungConfig } from "@senticor/fachverfahren-kit";

const leistungConfig: LeistungConfig = {
  // ... id, label, kommune, antrag, statusMachine (mit den Übergängen), ...
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "pruefung", label: "In Pruefung", tone: "info" },
      { key: "beschieden", label: "Beschieden", tone: "ok", terminal: true },
      { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "pruefung",
        label: "Zur Pruefung",
        rollen: ["sachbearbeitung"],
      },
      // bereits deklarierte Vier-Augen-Pflicht:
      {
        from: "pruefung",
        to: "beschieden",
        label: "Bescheiden",
        rollen: ["sachbearbeitung"],
        vierAugen: true,
      },
      // NUR deklariert, noch OHNE Vier-Augen — der Opt-in unten schaltet es zusaetzlich an:
      {
        from: "pruefung",
        to: "abgelehnt",
        label: "Ablehnen",
        rollen: ["sachbearbeitung"],
        detailPflicht: true,
      },
    ],
  },

  // GOVERNANCE-OPT-IN (additiv, strikt monoton): stellt die Ablehnung ZUSAETZLICH
  // unter Vier-Augen. Ohne diesen Block verhielte sich alles byte-identisch.
  governance: {
    zusaetzlicheVierAugen: [{ from: "pruefung", to: "abgelehnt" }],
  },

  // ... register, detailSektionen, ki, seed ...
};
```

Nach dem Schreiben `pnpm --filter @senticor/fachverfahren emit:contract`
laufen lassen: `leistung.contract.json` trägt dann `vierAugen: true` auch am
Übergang `pruefung → abgelehnt`, und der PROD-Server erzwingt es
(`case.decide`/`requiresFourEyes`). Kein Domänen-Wert wird dafür hart kodiert —
die Paare sind Referenzen auf die vorhandenen Übergänge des Verfahrens.
