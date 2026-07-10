# Katalog kommunaler Fachverfahren

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für das generische Modell + die 6 Muster-Taxonomie; die im Abschnitt „Roadmap" gelisteten
> Modell-Erweiterungen sind ausdrücklich `(PLAN)` — sie existieren noch NICHT und würden je einen versionierten
> Template-Change (mit `emit:contract` + Fleet-Migration) erfordern.
> Quellen: `packages/fachverfahren-kit/src/types.ts` (`LeistungConfig`/`Vorgang`/`statusMachine`/`tarif`/`codelisten`/
> `nachweise`/`fristenTypen`/`registerRefs`/`fimRefs`), `.../src/lib/interpreter.ts`, `platform/capabilities.json`,
> `tests/simulation/archetypes.ts` (belegte, lauffähige Archetypen), `docs/examples/hundesteuer/`.
> Pflicht-Lektüre vorher: `AGENTS.md`, `.agents/skills/fachverfahren-app/SKILL.md`.

Diese Referenz generalisiert das Template über EIN Beispiel hinaus zu einer **Wissensbasis für ALLE kommunalen
Fachverfahren**: welche wiederkehrenden Verfahrensmuster es gibt, wie das generische Datenmodell sie abbildet, wo
heute Primitive fehlen — und ein lauffähiger Beweis, dass die Architektur die Muster-Vielfalt generisch trägt.

Leitprinzip (aus `AGENTS.md`): Ein Fachverfahren ist DATEN in EINER Naht (`leistung.config.ts`), ausgewertet vom
reinen Interpreter. Neue Muster kommen als OPTIONALE, additive, rückwärtskompatible Config-Felder — nie als
Kit-Interna-Umbau.

## 1. Taxonomie: sechs Verfahrensmuster

Jedes kommunale Fachverfahren lässt sich einem (oder einer Kombination) dieser Muster zuordnen. Das Muster bestimmt
das `statusMachine`-Skelett, die Pflicht-Primitive und die typischen Capability-Ports.

| Muster                    | Kürzel | Wesen                                                                                              | Endprodukt                       | Beispiele                             |
| ------------------------- | ------ | -------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------- |
| **Antrag/Bescheid**       | A      | Bürger:in beantragt eine begünstigende Leistung; Behörde entscheidet gebunden/mit Ermessen         | Bescheid (Bewilligung/Ablehnung) | Wohngeld, Elterngeld, Personalausweis |
| **Anzeige**               | Az     | Bürger:in ZEIGT eine Tätigkeit AN (keine Genehmigung nötig); Behörde nimmt zur Kenntnis + verteilt | Bestätigung + Meldungen          | Gewerbeanmeldung, Ummeldung           |
| **Erlaubnis/Genehmigung** | E      | Präventives Verbot mit Erlaubnisvorbehalt; Prüfung von Voraussetzungen, oft Beteiligung + Auflagen | Erlaubnis mit Nebenbestimmungen  | Bauantrag, Gaststätte, Sondernutzung  |
| **Register**              | R      | Eintragung/Änderung in einem Register; Once-Only-Abruf + Outbound-Fan-out                          | Registereintrag + Nachweis       | KFZ-Zulassung, Melderegister          |
| **Veranlagung/Abgabe**    | V      | Behörde setzt eine Abgabe FEST (oft wiederkehrend/jährlich); Selbst-/Amtsveranlagung               | Abgabenbescheid                  | Hundesteuer, Grundsteuer, Gebühren    |
| **Beteiligung/Anhörung**  | B      | KEIN Einzelantrag: öffentliche Auslegung → N Stellungnahmen → Abwägung → Beschluss                 | Beschluss + Abwägungsdoku        | Bauleitplanung, Planfeststellung      |

Belegte, lauffähige Archetypen (verfahrens-neutral, in `tests/simulation/archetypes.ts`): **gebuehr** (V-nah: Tarif +
Codelisten-Ableitung + ePayment + Automation), **erlaubnis** (E: Vier-Augen + Begründungspflicht), **anzeige** (Az/R:
Register-once-only, 2-State), **leistung** (A: `berechne`-Hatch + verzweigte Entscheidung). Sie treiben in
`tests/simulation/simulation.test.ts` den gesamten Stack (Interpreter → Workspace → Backend gegen In-Memory UND echtes
Postgres) und beweisen die generische Vollständigkeit.

## 2. Was das generische Modell HEUTE trägt (IST)

| Belang                      | Primitiv (Config/Typ)                                                                                                              | Interpreter/Baustein                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Geführter Antrag            | `antrag.steps` · `FeldDef` (14 Typen, `regeln`/`hinweise`/`sichtbarWenn`/`abgeleitet`, Leichte Sprache)                            | `AntragStepper`, `lib/antrag-felder`, `lib/interpreter`                                |
| Subsumtion/Berechnung       | `tarif` (Staffeln + `Bedingung`) · `berechne` (Escape-Hatch)                                                                       | `interpretTarif`, `effektiveBerechnung`                                                |
| Nachweise (inkl. Once-Only) | `codelisten.belege` · `nachweise` · `Nachweis.bezugsweg`/`register`                                                                | `interpretNachweise`, `NachweisBrowser`                                                |
| Statuslauf + Guards         | `statusMachine` (states/`terminal`, transitions `rollen`/`vierAugen`/`detailPflicht`)                                              | `lib/status-machine` (`findeUebergang`/`erlaubteUebergaenge`/`validiereStatusMachine`) |
| Fristen                     | `fristenTypen`/`FristDauer` mit `anker`                                                                                            | `lib/frist` (kalendergenau)                                                            |
| Interop                     | `registerRefs` (inbound/outbound) · `fimRefs`/`fimLeistung`                                                                        | data-exchange / evidence-retrieval Ports                                               |
| Zustellung/Zahlung/Termin   | `zustellung` (AO §122 vs. VwVfG §41, Fiktion) · `ePayment` · `termin` · `adressValidierung`                                        | `BescheidView`/`EPaymentPanel`/`TerminFristPanel`                                      |
| KI (transparent)            | `ki` (`assist`/`chat`/`voice`, `humanOversight` fix)                                                                               | `KiAssistPanel`, `lib/ki-steuerung`                                                    |
| PM-Klammer (übergreifend)   | `WorkspaceConfig` (N Verfahren) · `Aufgabe`/`InboxItem` · `BoardConfig`/`ViewConfig` · `AutomationRule` · `PriorityDef`/`LabelDef` | `createWorkspaceStore`, `lib/automation`, `boardSpalten`                               |
| Server-Autorität            | `CaseStore`/`TaskStore` (append-only Audit, atomar) · `executeCaseTransition` (RBAC+Vier-Augen+Locking)                            | `@senticor/app-store-postgres`, `@senticor/public-sector-sdk`                          |

## 3. Deckungsmatrix (13 reale Verfahren)

Deckung: ✅ voll · 🟠 teilweise · ❌ Primitiv fehlt.

| Verfahren                  | Muster | Deckung | Fehlende Primitive (Wurzel) `(PLAN)`                                                               |
| -------------------------- | ------ | ------- | -------------------------------------------------------------------------------------------------- |
| Hundesteuer / Grundsteuer  | V      | ✅      | Jahres-Veranlagung/wiederkehrend, Verjährung                                                       |
| Wohngeld                   | A      | 🟠      | Bewilligungszeitraum/Weiterleistung, Haushalt = N Personen, Vorschuss                              |
| Elterngeld                 | A      | 🟠      | mehrere Antragsteller (Partnermonate), Bezugszeitraum                                              |
| Personalausweis            | A/R    | 🟠      | Produktions-/Aushändigungsphase, persönliche Vorsprache (Ortstermin)                               |
| Gewerbeanmeldung           | Az/R   | 🟠      | Anzeige-Charakter, Outbound-Fan-out (IHK/Finanzamt/HwK), Änderung/Abmeldung                        |
| Ummeldung/Melderecht       | Az/R   | 🟠      | Multi-Personen (Sammel-Ummeldung), Outbound-Meld-Fan-out                                           |
| KFZ-Zulassung              | R/E    | 🟠      | mehrere Rollen (Halter/Eigentümer/eVB), Outbound (KBA), Amtshilfe                                  |
| Bewohnerparkausweis        | E      | 🟠      | Befristung (gültig von–bis), Verlängerung/Folgeantrag                                              |
| Sondernutzung öff. Grund   | E      | 🟠      | Ortstermin, Befristung, Beteiligung Straßenbaulastträger                                           |
| Bauantrag                  | E      | 🟠      | TÖB-/Nachbar-Beteiligung, Ortstermin+Protokoll, Nebenbestimmungen, mehrere Beteiligte, Widerspruch |
| Gaststättenerlaubnis       | E      | ❌      | Nebenbestimmungen/Auflagen, Beteiligung (Gesundheits-/Ordnungsamt), Anhörungsphase                 |
| Bauleitplanung-Beteiligung | B      | ❌      | ganzes Muster: N-zu-1 Stellungnahmen, öffentliche Auslegung, Abwägungsdoku                         |

Muster-Deckungsgrad: **V ✅ · A 🟠 · Az/R 🟠 · E 🟠→❌ · B ❌.** Der PM-Layer (Board/Priorität/Views/Automationen) ist
bereits verfahrensübergreifend generisch (orthogonal zum fachlichen `Vorgang`).

## 4. Roadmap: additive Modell-Erweiterungen `(PLAN)`

Alle Erweiterungen sind OPTIONAL, additiv, als DATEN, vom reinen Interpreter auszuwerten — bestehende Configs bleiben
gültig. **Jede Feld-Ergänzung, die in `toContractSnapshot` einfließt, churnt `leistung.contract.json` fleet-weit** und
gehört daher hinter einen versionierten Template-Change (`emit:contract` + `tooling/template/migrations/<datum>-<slug>/`

- Consumer-Update), NICHT in ein lokales Edit. Reihenfolge nach Hebel:

**P0 — schließt die meisten 🟠 und verdrahtet vorhandene, aber unverankerte UI-Bausteine (`VertretungPanel`, `BescheidView`):**

1. `verfahrensart: "antrag"|"anzeige"|"erlaubnis"|"register"|"veranlagung"|"beteiligung"` — erdet die Taxonomie im Modell; steuert Copy + Default-Skelett + Rechtsbehelfstext.
2. `beteiligte: BeteiligtenRolle[]` — hebt das Single-`antragsdaten`-Blob auf (antragsteller/vertreter/eigentuemer/dritter/mit-antragsteller); verdrahtet `VertretungPanel`; deckt Mehr-Antragsteller.
3. `nebenbestimmungen: Nebenbestimmung[]` (Auflage/Bedingung/Befristung/Widerrufsvorbehalt) — rendert in `BescheidView`; deckt Erlaubnis-Muster.
4. `bescheid: BescheidConfig` — Bescheid-Varianten als DATEN (bewilligung/teilbewilligung/ablehnung/ruecknahme/widerruf) + `gueltigVon/Bis`.

**P1 — Verfahrenstiefe (Erlaubnis/Register):** `beteiligungen` (TÖB/Anhörung, neuer Trigger `beteiligung-eingegangen` +
Aktion `beteiligung-anfordern`) · `ortstermine` (interne Aufgabe mit Protokoll, Trigger `ortstermin-durchgefuehrt`) ·
`gueltigkeit`+`folgeverfahren` (Befristung/Verlängerung/wiederkehrend) · Outbound `meldungen: MeldungRegel[]` (Ereignis
→ Empfängerkreis, verallgemeinert `registerRefs.richtung:"outbound"`).

**P2 — rechtsstaatliche Vollständigkeit:** `rechtsbehelf: RechtsbehelfConfig` (Widerspruchsphase, kontrollierter
Wiedereintritt aus terminalem State — ACHTUNG: eine falsche Rechtsbehelfsbelehrung hemmt die Frist nicht,
materiell-rechtliche Folge, kein reines Refactoring) · Gebühr `vorschuss` vs. Festsetzung · Fristenketten + Verjährung ·
`akteneinsicht`/`zustaendigkeitWechsel` (§29 VwVfG / Amtshilfe).

**P2 — Beteiligungs-Muster (B, größte strukturelle Lücke):** `beteiligungsverfahren` — kein Einzelantragsteller,
sondern öffentliche Auslegung (Frist) → N Stellungnahmen (Inbox-artig, `InboxItem`/`Aufgabe` wiederverwenden) →
Abwägung (append-only) → Beschluss. Eigenes Muster; braucht zusätzlich eine Persona-Lockerung (die drei kanonischen
Personas `buerger`/`sachbearbeitung`/`aufsicht` sind heute hartverdrahtet).

**PM-Ergänzungen (additiv, orthogonal):** neue `AutomationTrigger`/`AutomationAktion`-Union-Mitglieder je P1/P2-Feature
(nur einführen, WENN ein ausführender Pfad existiert — heute läuft `beim-eingang` im DEV-Store, weitere Trigger folgen
mit der Server-Engine) · optionale Board-Achse „Frist-/SLA-Ampel" aus `PriorityDef.slaStunden` + `faelligIso`.

## 5. Verankerung im Repo

- **Diese Referenz** ist die Wissensbasis; sie wird pro neuem Muster/Verfahren fortgeschrieben.
- **Lauffähiger Beweis**: `tests/simulation/` — die Archetypen sind der Regressionsanker, dass die Architektur die
  Muster-Vielfalt generisch trägt (Interpreter + Workspace + Backend, In-Memory UND Postgres).
- **Beispiele**: `docs/examples/<muster>/` — heute `hundesteuer` (Muster V); je Muster ≥1 belegtes Beispiel ist das Ziel.
- **Skill**: `.agents/skills/fachverfahren-app/SKILL.md` — vor der Config-Generierung „Verfahrenstyp wählen → Muster
  laden" als Schritt (folgt mit den P0-Primitiven).
