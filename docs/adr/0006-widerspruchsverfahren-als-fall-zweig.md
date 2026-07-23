# ADR-0006: Widerspruchs-/Rechtsbehelfs-Verfahren als wiederaufnehmbarer Fall-Zweig (Verfahren = DATEN)

- Status: proposed
- Datum: 2026-07-21
- Bezug: Issue #61; baut auf ADR-0001 (server-seitige Fallverwaltung über SDK-domain-kernel), der Antrags-Zustandsmaschine (`apps/fachverfahren/src/leistung.config.ts` → gespiegelt in `apps/fachverfahren/server/procedure.config.ts` `antragProcedure`, Drift-Gate `check:antrag-procedure`) und dem eingefrorenen Bescheid/VA (#60) auf.

## Kontext

Das **Einlegen** eines Rechtsbehelfs existiert bereits: `POST /api/buerger/antraege/:id/widerspruch` schreibt ein einmaliges append-only `case.objection`-Ereignis (Art + optionale Begründung aus dem eingefrorenen Regime, regime-neutral widerspruch/einspruch/klage; 409 bei Doppeleinlegung). Was FEHLT, ist das **Verfahren danach** — die behördliche Bearbeitung:

1. **Abhilfe** (§ 72 VwGO): Die erlassende Behörde hilft dem Widerspruch ab → neuer, begünstigender Verwaltungsakt (Abhilfebescheid).
2. **Nicht-Abhilfe / Vorlage** (§ 73 VwGO): Die Behörde hilft nicht ab → Widerspruchsbehörde entscheidet → **Widerspruchsbescheid** (zurückweisend oder teilweise stattgebend), der ein EIGENES Rechtsbehelfsregime trägt (regelmäßig **Klage**, § 74 VwGO / § 68 ff. VwGO), NICHT erneut Widerspruch.

Heute ist der Antrags-Endzustand `festgesetzt` als `terminal: true` modelliert — ein terminaler Zustand hat DEFINITIONSGEMÄSS keine ausgehenden Übergänge. Ein Widerspruch **öffnet den Fall wieder**; das steht im direkten Konflikt mit `terminal`.

## Entscheidung

Das Widerspruchs-Verfahren wird als **Fall-Zweig in der Zustandsmaschine** modelliert (Verfahren = DATEN) und reitet auf der **bestehenden generischen** Übergangs-Maschinerie (`POST /api/cases/:id/transitions`, SDK `transitionCase` mit RBAC + Vier-Augen + append-only Audit). KEINE neue BFF-Route, KEINE Sonderlogik im Fall-Handler — nur DATEN in `leistung.config` (Quelle) + Spiegel in `procedure.config` (Drift-Gate grün).

### 1. Neuer Zustandstyp: WIEDERAUFNEHMBARER Abschluss (resumable-closed)

`festgesetzt` wird von `terminal: true` auf einen **abschließenden, aber wiederaufnehmbaren** Zustand umgestellt — dieselbe Kategorie, die die Dossier-Naht bereits kennt (BPMN leitet `closesCase` aus zwei Auslösern ab: `endEvent`-Ziel ODER `senticor:closesCase="true"`, weil ein wiederaufnehmbarer Abschluss KEIN `endEvent` sein darf; siehe procedure.config `dossierProcedure`). Konkret:

- Der Übergang NACH `festgesetzt` (Festsetzen) trägt `closesCase: true` (er schließt den Fall — Bescheid erlassen), aber `festgesetzt` ist NICHT `terminal`.
- Damit hat `festgesetzt` ausgehende Widerspruchs-Übergänge, ohne eine „Sackgasse" (contract-Gate) zu sein und ohne den Abschluss-Charakter zu verlieren.

Das Antrags-Modell erhält damit denselben resumable-closed-Begriff, den die Dossier-Naht schon nutzt — EINE konsistente Idee statt zweier Abschluss-Modelle.

### 2. Zustände + Übergänge (Zusatz zur Antrags-Zustandsmaschine)

Neue Zustände: `widerspruch_in_pruefung` (Widerspruch in Bearbeitung), `abgeholfen` (terminal), `widerspruch_zurueckgewiesen` (terminal).

| from | to | label | vierAugen | erlaesstBescheid |
| --- | --- | --- | --- | --- |
| festgesetzt | widerspruch_in_pruefung | „Widerspruch bearbeiten" | – | – |
| widerspruch_in_pruefung | abgeholfen | „Abhilfe (Abhilfebescheid)" | ✓ | ✓ (Abhilfebescheid) |
| widerspruch_in_pruefung | widerspruch_zurueckgewiesen | „Widerspruch zurückweisen (Widerspruchsbescheid)" | ✓ | ✓ (Widerspruchsbescheid) |

`abgeholfen` + `widerspruch_zurueckgewiesen` sind terminal (endgültiger Abschluss des Rechtsbehelfs; ein weiterer Rechtsbehelf gegen den Widerspruchsbescheid ist die **Klage** vor dem Verwaltungsgericht — außerhalb des Verwaltungsverfahrens, daher terminal).

### 3. Der Widerspruchsbescheid trägt ein EIGENES Rechtsbehelfsregime (Modell-Erweiterung)

Ein `erlaesstBescheid`-Übergang friert heute den VA aus dem EINEN `procedure.verwaltungsakt` (Rechtsbehelf-Regime) ein. Der Widerspruchsbescheid braucht ein ANDERES Regime (Klage/§ 74 VwGO) als der Ausgangsbescheid (Widerspruch/§ 68 ff. VwGO). Deshalb: **optionales `verwaltungsakt`-Override je Übergang** (`transition.verwaltungsakt?: VerwaltungsaktConfig`). Fehlt es, gilt weiter `procedure.verwaltungsakt` (rückwärtskompatibel). Der Freeze-Handler (buerger/cases) nimmt das Override, wenn gesetzt. So bleibt „ein Verfahren = ein Regime" der Default, und der Rechtsbehelf-gegen-Rechtsbehelf-Fall ist sauber als DATEN ausgedrückt.

### 4. Bekanntgabe/Fristen + Bürger-Sicht

Abhilfe-/Widerspruchsbescheid werden — wie der Ausgangsbescheid (#60) — beim Übergang eingefroren (Hash über kanonische Bytes), owner-scoped abrufbar (`/bescheid` + `.pdf`), und der erste Abruf verankert die Bekanntgabe (`case.disclosed`). Die Bürger-Seite (`buerger-bescheid.tsx`) zeigt den JEWEILS gültigen (jüngsten) eingefrorenen Bescheid — `findVerwaltungsakt` nimmt bereits den jüngsten.

## Konsequenzen / betroffene Gates + Tests (bewusst benannt, nicht versteckt)

- **`leistung.config.ts`** (Quelle) + **`procedure.config.ts` `antragProcedure`** (Spiegel): neue Zustände/Übergänge + `festgesetzt` resumable-closed. Danach `check:antrag-procedure` (Drift) grün halten.
- **contract-/closesCase-Gate**: mind. ein schließender Übergang (Festsetzen behält `closesCase`), keine Sackgasse (`widerspruch_in_pruefung` hat Ausgänge), kein verwaister Zustand (alle neuen sind erreichbar).
- **`status-mermaid.test.ts`**: Diagramm-Erwartung um die neuen Kanten erweitern.
- **`buerger-widerspruch.test.ts`** (BFF-Paket): Bestand bleibt (Einlegen unverändert); neue Verfahrens-Übergänge werden über `/api/cases/:id/transitions`-Tests abgedeckt.
- **Vier-Augen**: Abhilfe/Zurückweisung sind `vierAugen` — Vorbereiter ≠ Freigeber (bestehende server-autoritative Prüfung, #56).
- **RBAC**: die Widerspruchs-Übergänge nutzen `requiredPermission` der Procedure (Back-Office); kein neues Permission-Vokabular nötig.

## Nicht-Ziele (spätere Stufen)

- Fristenüberwachung der Widerspruchsfrist als automatischer Trigger (der Fristen-Scanner #58 kann später einen `frist.widerspruch`-Task anlegen).
- Devolutiveffekt/echte getrennte Widerspruchsbehörde als eigener Mandant (heute: dieselbe Behörde, Regime als DATEN).
- Teil-Abhilfe als eigener Zustand (zunächst: Abhilfe vs. Zurückweisung; Teil-Abhilfe = Zurückweisung mit angepasstem Tenor).
