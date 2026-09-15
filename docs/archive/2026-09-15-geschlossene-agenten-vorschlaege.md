# Die dreizehn geschlossenen Agenten-Vorschläge vom Juli — ihre Befunde

**Stand: 2026-09-15.** Am 2026-09-15 wurden dreizehn offene Pull Requests
(#38 #39 #40 #41 #42 #43 #45 #46 #47 #48 #49 #50 #52) aus dem Juli geschlossen,
ohne dass ihr Code übernommen wurde. Der Grund ist mechanisch und nicht
inhaltlich: seit ihrem gemeinsamen Vorfahren (`cacb907`) sind **216 Commits**
auf `main` gelandet (Audit-Messung gegen GitHub `main`; lokal gegen denselben
Vorfahren nachgemessen: 190 Commits) — **neun** der dreizehn Zweige meldeten
`CONFLICTING`, sie sind nicht mehr mergebar. Ein Rebase über 216 Commits wäre
eine Neuschreibung, kein Merge.

**Dieses Dokument trägt die BEFUNDE, nicht den Code.** Ein Vorschlag kann
falschen Code und trotzdem eine richtige Beobachtung enthalten; der Code stirbt
mit dem PR, die Beobachtung darf es nicht. Ein Audit hat die dreizehn Zweige
einzeln gegen den heutigen Baum vermessen und in drei Klassen sortiert:
**überholt** (die Fähigkeit gibt es heute, oder besser), **gegenstandslos**
(die Frage stellt sich so nicht mehr) und **trägt noch** — sechs Sachen, die im
heutigen Kit offen sind. Nur die dritte Klasse ist Arbeit; sie steht unten mit
einer Zeile «die Abhilfe stände in: `<Datei>`» je Punkt.

Die Belege wurden am 2026-09-15 gegen den Arbeitsbaum nachgemessen (Zweig
`feat/integrationsmanagement-dossier`). Zeilennummern driften — der
Bezeichner, nicht die Zahl, ist der Anker.

---

## Überholt — die Fähigkeit existiert heute, oder besser

### #40 · docs-consolidation

`docs/README.md` ist der kanonische Doku-Einstieg; er trägt selbst den Vermerk
«Baum geordnet und gegen das Repository verifiziert am 2026-09-11». Der
Vorschlag wollte herstellen, was danach entstanden ist.

### #42 · config-inspector

Dieselben Strukturprüfungen laufen heute als **Build-Gate** statt als
Inspektor-Ansicht:

- `packages/fachverfahren-kit/src/leistung-contract-form.ts:556` `checkStateMachine`
- `packages/fachverfahren-kit/src/leistung-contract-form.ts:379` `checkApplicationForm`
- gerufen von `scripts/check-leistung-contract.mts:82` / `:89`, und das Skript
  hängt in `check:leistung-contract` innerhalb von `precommit:check`
  (`package.json:22`).

Ein Gate ist die stärkere Form: es kann nicht übersehen werden.

> ⚠️ **Rest, den es nicht gibt:** die Kennzahlen-Aggregation aus dem Vorschlag
> (wie viele Verfahren welche Struktur tragen) hat heute keine Entsprechung.

### #43 · knowledge-panel

Statt eines Panels gibt es das volle **Verfahrens-Wiki**:

- Route `/amt/verfahren/:procedureId/:version/wiki` — `apps/fachverfahren/src/app/routes.tsx:53`
- Seite `apps/fachverfahren/src/pages/amt-verfahren-wiki.tsx`
- BFF-Route `packages/app-bff-fastify/src/routes/verfahren-wissen.ts` (+ Zeuge `verfahren-wissen.test.ts`)
- Vertrag `packages/app-bff-contracts/src/verfahren-wissen.ts`, Client `apps/fachverfahren/src/verfahren-wissen-client.ts`
- Speicher `packages/app-store-postgres/src/wissen-store.ts`

### #46 · bpmn-process-model

`docs/adr/0002-bpmn-workflow-engine-als-capability.md:19` verwirft die PR-Form
wörtlich — «Ein früher app-lokaler ‚BPMN-Editor/-Runtime' wurde als
überzeichnete Reife verworfen (PR #37)» — und setzt statt dessen BPMN-2.0-XML
als EINE Wahrheit, abgeleitet über eine reine Funktion:
`packages/workflow-bpmn-stub/src/bpmn-to-procedure-version.ts`
(`bpmnToProcedureVersion`), Drift-Gate `check:bpmn-example`.

> ⚠️ **Korrektur an der ersten Lesart des Audits:** ADR-0002 verwirft nicht
> «einen Editor», sondern den app-lokalen Editor **mit eigener Runtime**. Als
> Punkt 4 der Entscheidung (`:42-44`) steht ausdrücklich ein **BPMN-Editor als
> Kit-Komponente (a11y-primär)**, der die DEFINITION bearbeitet und **nicht**
> die Engine ist. Er ist heute nicht gebaut — er ist gewollt und offen, nicht
> abgelehnt.

### #48 · accessibility-gaps

Barrierefreiheit wird heute gemessen, nicht nur behauptet:

- Axe fährt auf `test: "error"` — `.storybook/preview.ts:72`: Verstöße lassen
  Story-Tests fehlschlagen.
- Echte Kontrastmessung nach WCAG-Relativluminanz —
  `scripts/check-pwa-browser.mjs:869` (`contrastRatio`).
- Vordergrundwahl aus WCAG-Luminanz statt aus einem gesetzten Wert —
  `packages/fachverfahren-kit/src/components/KommuneTheme.tsx:78` (`pickForeground`).

> ⚠️ **UNSICHER — bewusst so festgehalten:** die 23 Einzeldateien, die der
> Vorschlag nannte, sind bei 216 Commits Drift **nicht einzeln nachgemessen**.
> Ein **statisches Token-Gate** (Kontrast der Design-Tokens ohne Browser) gibt
> es heute nicht; gemessen wird im laufenden Browser bzw. in Storybook.

### #52 · chos-persistence

Die Persistenz-Naht ist gebaut und dreifach bedient:

- `packages/app-store-postgres/src/case-store.ts:139` — Interface `CaseStore`;
  Implementierungen `PostgresCaseStore` (`:180`), `InMemoryCaseStore` (`:368`),
  dazu der Unavailable-Fall.
- `createCaseStoreFromEnv` (`case-store.ts:529`), konsumiert u. a. in
  `apps/fachverfahren/server/forderung-mahnung.ts`.
- Migration `packages/app-store-postgres/migrations/20260717000000_case_data/migration.sql`.
- `BlobStoragePort` — `packages/platform-contracts/src/ports.ts:306`.
- Die chos-Naht ist gebaut: `chos-case-store.ts`, `chos-app-store.ts`,
  `chos-kanban-store.ts` (alle in `packages/app-store-postgres/src/`).
- Entscheidung: `docs/adr/0001-server-seitige-fallverwaltung-ueber-sdk-domain-kernel.md`.

---

## Gegenstandslos

### #50 · dual-mode

Die Dualität, die der Vorschlag meinte, **gibt es** — aber als **zwei Nähte**
statt als ein Feld:

- `apps/fachverfahren/src/leistung.config.ts` — Antrag/Vorgang
- `apps/fachverfahren/server/procedure.config.ts` — Fall/Dossier

Entschieden in `docs/agents/fachverfahren-typen.md`. Ein `kind`-Diskriminator
**auf** `LeistungConfig` ist die falsche Form: er würde beide Welten in einen
Typ zwingen, den die Trennung gerade auflöst.

---

## ⛔ Trägt noch — die sechs offenen Sachen

Das ist der Teil, der nicht mit den PRs sterben darf.

### 1 · #41 kit-correctness — VIER Korrektheitsfehler stehen heute unverändert im Baum

Die betroffene Datei ist seit Juli **umgezogen, nicht repariert**.

**(a) `gleich()` ist fail-open — der teuerste der vier.**
`packages/public-sector-sdk/src/rules.ts:218`:

```ts
export function gleich(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    return alsBool(a) === alsBool(b);
  }
```

mit `alsBool` (`:250`):

```ts
function alsBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return v === "true" || v === "ja" || v === 1 || v === "1";
}
```

Ein **unbeantworteter** Tatbestand (`undefined`) wird gegen `false` verglichen
und ergibt `true` — fachlich: «mit Nein beantwortet». Der Unterschied zwischen
«der Bürger hat Nein gesagt» und «der Bürger wurde nicht gefragt» geht verloren
und kann ein **verfrühtes Ergebnis** erzeugen. Derselbe Pfad koerziert
außerdem numerisch: `"01"` und `"1"` gelten als gleich — für amtliche
Schlüssel (Bundesland, AGS) ist das falsch, dort ist die führende Null
bedeutungstragend.
→ **Die Abhilfe stände in:** `packages/public-sector-sdk/src/rules.ts`
(`gleich`/`alsBool`) — ein dreiwertiges Ergebnis oder ein expliziter
`undefined`-Riegel VOR der Bool-Koerzierung, plus eine Ausnahme für Schlüssel-Felder.

**(b) Fristanker ist zeitzonenabhängig.**
`packages/fachverfahren-kit/src/lib/frist.ts:76`: `const anker = new Date(ankerIso);`
— die Rechnung arbeitet danach in UTC (`setUTCDate`), der Anker wird aber je
nach Form des Strings lokal oder als UTC geparst. Eine Frist kann so einen Tag
springen.
→ **Die Abhilfe stände in:** `packages/fachverfahren-kit/src/lib/frist.ts` (`faelligkeitAb`).

**(c) Feldtypen ohne Validierung.**
`packages/fachverfahren-kit/src/lib/antrag-felder.ts` kennt `checkbox`,
`ja-nein`, `file`, `number`, `select` — aber **kein** `typ === "plz"`,
`"email"` oder `"tel"`. Solche Felder laufen ungeprüft durch.
→ **Die Abhilfe stände in:** `packages/fachverfahren-kit/src/lib/antrag-felder.ts`.

**(d) Statusanzeige misst die Position, nicht die Erreichbarkeit.**
`packages/fachverfahren-kit/src/components/StatusVerfolgung.tsx:195`:
`const istErledigt = aktuellerIndex >= 0 && i < aktuellerIndex;` — eine
Station gilt als erledigt, weil sie **vor** der aktuellen in der Liste steht.
Bei Verfahren mit Verzweigungen (Gateways, Wiederaufnahme) ist die Listenfolge
nicht die durchlaufene Folge.
→ **Die Abhilfe stände in:** `packages/fachverfahren-kit/src/components/StatusVerfolgung.tsx`
— gegen die tatsächlich durchlaufenen Übergänge prüfen, nicht gegen den Index.

### 2 · #39 oss-release-hygiene — Blocker vor jeder Veröffentlichung

Gemessen am 2026-09-15:

| Gemessen                         | Ergebnis                |
| -------------------------------- | ----------------------- |
| Pakete unter `packages/`         | 16                      |
| davon mit `license`-Feld         | **0**                   |
| `packages/*/LICENSE`             | **keine**               |
| `THIRD-PARTY-NOTICES.md`         | **fehlt**               |
| `.github/dependabot.yml`         | **fehlt**               |
| Lizenz-Gate in `precommit:check` | **keins**               |
| Root-`package.json:5`            | `"license": "EUPL-1.2"` |

Die Wurzel sagt EUPL-1.2, kein einziges Paket sagt es mit. Solange das so ist,
trägt ein `oss-public`-Spiegel Pakete ohne erklärte Lizenz nach außen.
→ **Die Abhilfe stände in:** jedem `packages/*/package.json` (`license`-Feld)
plus einem neuen Gate in `package.json` (`precommit:check`) und
`.github/dependabot.yml`.

### 3 · #45 bsi-grundschutz — eine offene ROTE Pflichtzeile

Der Evidenz-Plan **verlangt** das Mapping:

- `packages/conformance-kit/src/evidence.ts:58` — `evidenceId: "bsi-grundschutz-map"`, `required: true`
- `scripts/evidence-build.mjs:24` — derselbe Bezeichner

und `find docs -iname "*grundschutz*"` liefert **0 Treffer**.

Das ist keine Lücke im Anspruch, sondern eine rote Zeile im eigenen
Evidenzplan: die Pflicht ist erklärt, der Beleg fehlt.
→ **Die Abhilfe stände in:** `docs/compliance/` (ein Dokument, das
`bsi-grundschutz-map` erfüllt) — der Bezeichner ist bereits vergeben.

### 4 · #49 automation-engine — kein Vertrag bildet Auslöser auf Absicht ab

`automationsregeln` / `AutomationRule` / `AutomationTrigger` → **0 Dateien**
im Baum. Was es gibt: `packages/app-store-postgres/src/deadline-scan.ts`
scannt Fristen. Was fehlt: ein Vertrag, der einen **AUSLÖSER** (Frist gerissen,
Zustand erreicht, Eingang) auf eine **AKTIONS-Absicht** abbildet. Heute endet
der Scan in einer Liste; was daraufhin geschehen soll, sagt niemand als Daten.
→ **Die Abhilfe stände in:** `packages/platform-contracts/src/ports.ts` (der
Vertrag) neben den vorhandenen Ports; die Auswertung neben
`packages/app-store-postgres/src/deadline-scan.ts`.

### 5 · #47 ai-data-governance — der DSGVO-relevante Teil, nicht der Adapter

`AiAssistPort` ist kanonisch vorhanden und lehnt high-risk-Nutzung ab (Zeuge:
`packages/platform-contracts/src/ai-assist-chos.test.ts`). Aber:
`allowedTasks` / `allowedPurposes` / `allowedLegalBasisIds` / `allowedInputKeys`
→ **0 Treffer** im gesamten Baum.

Das heißt: **WELCHE FELDER** ein KI-Anbieter sehen darf, entscheidet heute
NIEMAND. Der Port regelt, _ob_ assistiert wird, nicht _womit_. Das ist der
datenschutzrelevante Teil — der OpenAI-Adapter aus dem Vorschlag ist es nicht.
→ **Die Abhilfe stände in:** `packages/platform-contracts/src/ports.ts`
(`AiAssistPort` um eine Feld-Allowlist erweitern) und an der Aufrufstelle, die
den Kontext zusammenstellt.

### 6 · #38 public-service-experience — die Pflichtseite ist gebaut und unerreichbar

`packages/fachverfahren-kit/src/components/Barrierefreiheitserklaerung.tsx`
existiert (die Datei nennt sich selbst «BITV §7 Barrierefreiheitserklärung +
Feedback») und wird in `packages/fachverfahren-kit/src/index.ts:84`
exportiert — und hat **NULL Konsumenten**: der einzige weitere Treffer im Baum
ist ein abgrenzender Kommentar in `BarrierefreiheitsPanel.tsx:3`
(«NICHT die Barrierefreiheits-ERKLÄRUNG»).

`apps/fachverfahren/src/app/routes.tsx` listet **21 Pfade** und **keinen**
`/barrierefreiheit`. Nach **§ 12a BGG / BITV 2.0** ist genau das die
Pflichtseite eines öffentlichen Angebots — sie ist gebaut, bezahlt und nicht
aufrufbar.
→ **Die Abhilfe stände in:** `apps/fachverfahren/src/app/routes.tsx` (ein
öffentlicher Pfad `/barrierefreiheit`, erreichbar OHNE Anmeldung wie `/` und
`/hilfe`) plus eine Seite, die die Komponente montiert.

---

## Was dieses Dokument nicht ist

Es ist **keine Aufgabenliste mit Zusage**. Es hält fest, was dreizehn
geschlossene Vorschläge an Beobachtung getragen haben, damit der Umzug nach
GitLab sie nicht mit den Zweigen verliert. Wer eine der sechs offenen Sachen
angeht, fängt bei der Datei an, die in ihrer Zeile «die Abhilfe stände in»
steht — und misst zuerst nach, ob der Befund noch gilt.
