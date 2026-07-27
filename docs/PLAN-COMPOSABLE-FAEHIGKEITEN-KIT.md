# S6 — Beide Fähigkeits-Seiten im erzeugten Fachverfahren

**Stand 2026-07-27.** Teil des Umbaus, dessen Gesamtplan in CHOS-CODE liegt
(`docs/PLAN-COMPOSABLE-FAEHIGKEITEN-UMBAU.md`). Hier steht nur, was **dieses** Repo zu tun hat.

## Der Auftrag

Ein Composable besteht **immer** aus strukturierten und unstrukturierten Fähigkeiten — Tarif, Regel, Formel,
Prüfung neben Lesen, Verstehen, Erklären. Beide **gleichrangig**. Die Wissensseite *benutzt* die strukturierten
wie Werkzeuge und kann neue *erzeugen*. Stromaufwärts (CHOS-CODE, fertig) trägt die versiegelte
Composable-Verfassung jetzt beide Seiten:

```ts
faehigkeiten.strukturiert?: { id; ergebnis; klasse?; programm?; grundlagen?[]; evalSuite?; erzeugtVon?; freigegebenVon? }[]
faehigkeiten.benutzt?:      { wissen: string; werkzeug: string }[]
```

## Was hier zu tun ist — vier Nähte, zwei davon blind

| # | Datei | Warum sie blind ist |
|---|---|---|
| 1 | `packages/public-sector-sdk/src/composable-cert-verify.ts:167` — Manifest-Typ `faehigkeiten?: { ki?; autonomie? }` | Neues fällt in die **Index-Signatur** und verschwindet aus der Typ-Sicht. Belegte Klasse: derselbe Fehler passierte an `befugnis` (Kommentar Zeilen 182–189) |
| 2 | `packages/public-sector-sdk/src/composable-manifest.ts:211` — `mapManifestToComposable` | Mappt ins `AgenticComposable`; was hier fehlt, existiert flussabwärts nicht |
| 3 | `packages/app-bff-contracts/src/composables.ts:81` — `ComposableDetailDto` | **`additionalProperties: false`** ⇒ Fastify wirft Undeklariertes **still** weg |
| 4 | `packages/app-bff-fastify/src/routes/composables.ts:81` — `toDetail` | |

Für Nähte 3 und 4 gibt es **keine** generelle Zusicherung — sie brauchen je einen eigenen Roundtrip-Test.

## Die IP-Grenze

Es reist der **Anspruch** (id, klasse, ergebnis, grundlagen, Programm-**Kennung**, Erzeugungs-Provenienz), nie
der **Körper**. Die Darstellung (Tarif-Tabelle, DMN-Entscheidungstabelle, Formel, Code) liegt lokal unter
`.chos/business-logic` und wird weder beim Publish noch beim Mount noch im Container-Payload transportiert.
Eine lokale Route analog zur CHOS-Route `/flow/composable-programme` liest sie über `resolveProjectRoot`
(Muster: `apps/fachverfahren/server/composables-mounted.ts:164`).

Bei einem **gemounteten** Composable gibt es die Darstellung nicht — die Fläche zeigt dann den Anspruch **plus**
den ausdrücklichen Satz, dass der Rechenweg beim Herausgeber liegt. Nie eine stumme leere Fläche: die sähe aus
wie ein Defekt und wäre eine Governance-Entscheidung.

## Die Fläche

`apps/fachverfahren/src/…/amt-assistent.tsx` (Composable-Auswahl + Chat) um die Fähigkeits-Sicht der gewählten
Stelle erweitern. Das Composable-Wiki dockt an die bestehende Wiki-Mechanik (`amt-verfahren-wiki.tsx`) an,
gefiltert auf die Stelle — **kein UI-Neubau, kein Zweitspeicher**: das Wiki ist eine Projektion.

**Offene Fachfrage vor der Umsetzung:** zeigt die KIT-Detailfläche die Darstellung überhaupt, oder nur den
Anspruch? Die Betreiber-Perspektive ist eine andere als die des Herausgebers.

## Abnahme

Mount-Test: Manifest mit `strukturiert` ⇒ das Detail-DTO trägt es.
**Gegenproben (nicht optional):**
- DTO-Deklaration entfernen ⇒ das Feld verschwindet auf dem Draht (beweist die Fastify-Strip-Naht).
- Manifest mit manipuliertem `strukturiert`-Block ⇒ `verifyMeshGovernanceProjektion` verwirft fail-closed
  (`composables-mounted.ts:274–277`).

---

## Was in diesem Repo dazu schon fertig ist

- **Rechen-Hoheit am Bescheid** (`eec0e85`): der Server rechnet den Tenor gegen den Tarif des Verfahrens nach,
  bevor er ihn einfriert; Divergenz ⇒ 422, kein eingefrorener VA. Ohne
  `verwaltungsaktInhalt.tenorNachrechnung` unverändertes Verhalten.
- **Tarif-Kongruenz** (`cbb7cc2`): Bescheid-Tenor (EUR) und Sollstellung (Cent) werden gegeneinander gehalten,
  samt Dropdown-Label und Rückfall-Maschine.
