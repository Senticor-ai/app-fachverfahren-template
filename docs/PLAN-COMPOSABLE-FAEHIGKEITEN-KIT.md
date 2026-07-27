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

## STAND: S6 ist umgesetzt (Commit `a8e8420`)

Alle vier Nähte sind gezogen — und die entscheidende Frage war nicht, OB die Seite ankommt, sondern **WOHER**.

**Rangfolge der Quellen** (`mapManifestToComposable`, neuer Parameter `opts.governance`):
- Projektion da **und** Siegel nachgerechnet intakt ⇒ **sie** ist die Quelle.
- Projektion da, Siegel gebrochen **oder ungeprüft** ⇒ die Seite bleibt **leer**. Ein Rückfall auf den
  unversiegelten Manifest-Block wäre der Umweg, der das Siegel wertlos machte.
- **Gar keine** Projektion (Alt-Bestand) ⇒ der Manifest-Block trägt — dieselbe Quelle, aus der derselbe Mapper
  auch `ki`/`befugnis`/`leistungen` liest.

Der Mount-Pfad (`composables-mounted.ts`) reicht sein bereits nachgerechnetes `gov`-Verdikt jetzt durch. Ohne
diese eine Zeile wäre das Feld vorgesehen, typisiert und nie gefüllt.

**Die offene Fachfrage ist gemessen beantwortet, nicht entschieden:** `.chos/business-logic` existiert in diesem
Kit nicht. Es gibt hier keinen Programm-Körper zu projizieren, also zeigt die Betreiber-Sicht den **Anspruch**
(Kennung, Klasse, Grundlagen, Erzeugungs-Provenienz). Eine lokale Darstellungs-Route hätte den Zweitspeicher
gebaut, den der Plan verbietet — die Fläche im Kit bleibt damit ein reiner Konsument.

**Beweis, 13 Zusicherungen:** `composable-faehigkeiten-quelle.test.ts` (8/8, u.a. Parität zuerst · gebrochenes
Siegel ⇒ leer trotz untergeschobenem Manifest-Block · ein Composable ohne `ki` trägt trotzdem seine strukturierte
Seite) · `composables-faehigkeiten-naht.test.ts` (5/5, u.a. **Gegenprobe zur Strip-Naht**: ein nicht deklariertes
Feld verschwindet im selben Aufruf).

Offen bleibt bewusst die **Fläche** (`amt-assistent.tsx` / `amt-verfahren-wiki.tsx`): die Daten liegen jetzt am
Detail-DTO an. Kein UI-Neubau — das Wiki dockt an die bestehende Mechanik an, wenn es gebraucht wird.

---

## Was in diesem Repo dazu schon fertig ist

- **Rechen-Hoheit am Bescheid** (`eec0e85`): der Server rechnet den Tenor gegen den Tarif des Verfahrens nach,
  bevor er ihn einfriert; Divergenz ⇒ 422, kein eingefrorener VA. Ohne
  `verwaltungsaktInhalt.tenorNachrechnung` unverändertes Verhalten.
- **Tarif-Kongruenz** (`cbb7cc2`): Bescheid-Tenor (EUR) und Sollstellung (Cent) werden gegeneinander gehalten,
  samt Dropdown-Label und Rückfall-Maschine.
