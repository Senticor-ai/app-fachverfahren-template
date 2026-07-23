# ADR-0007: Rückforderung/Erstattung als Fach-Fluss — Rückforderungsbescheid + Sollstellung auf dem PaymentPort

- Status: proposed
- Datum: 2026-07-21
- Bezug: Issue #62; baut auf dem PaymentPort (`packages/platform-contracts/src/ports.ts`, BFF-Naht `/api/payment`, ePayBL/XBezahldienste-Muster), dem eingefrorenen Bescheid/VA (#60), dem Widerspruchs-Fall-Zweig (ADR-0006) und dem Fristen-Scanner (#58) auf.

## Kontext

Der PaymentPort deckt heute die Richtung **Bürger zahlt Gebühr** ab (`createPayment` → `PaymentStatus`, `getPaymentStatus`). Die **Rückforderung** (§ 50 SGB X / § 49a VwVfG: Erstattung zu Unrecht erbrachter Leistungen nach Aufhebung/Widerruf) ist rechtlich UND fachlich verschieden:

1. Sie beginnt mit einem **Verwaltungsakt** (Rückforderungs-/Erstattungsbescheid), der die Forderung dem Grunde und der Höhe nach festsetzt — ein VA wie jeder andere.
2. Daraus entsteht eine **Sollstellung** (die offene Forderung des Trägers gegen den Bürger).
3. Der Bürger zahlt (oder nicht) → **Zahlungseingang-Abgleich**, bei Überfälligkeit **Mahnung**, ggf. **Vollstreckung**/Niederschlagung/Stundung.

Naiv „den PaymentPort einfach umdrehen" greift zu kurz: `createPayment` bleibt die richtige Naht für den EINZUG (der Bürger zahlt die Rückforderung genauso über ePayBL/XBezahldienste), aber die **Forderung selbst** (Sollstellung, Fälligkeit, Mahnstufen, Restbetrag) ist ein DOMÄNEN-Modell, das der PaymentPort nicht trägt.

## Entscheidung

Rückforderung wird als **Fach-Fluss auf der bestehenden Naht** gebaut, NICHT als neuer Port:

### 1. Rückforderungsbescheid = VA über die #60/#61-Maschinerie

Die Festsetzung der Rückforderung ist ein `erlaesstBescheid`-Übergang mit eigenem `verwaltungsakt`-Override (ADR-0006 §3): Rechtsbehelf = Widerspruch/§ 68 ff. VwGO, Tenor = Rückforderungsbetrag + Rechtsgrund. Er wird eingefroren (Hash), ist owner-scoped abrufbar (`/bescheid`, `.pdf`) und bekanntgabe-/fristanker-fähig — KEINE neue Freeze-Logik. Damit ist die Rückforderung von Anfang an rechtsbehelfsfähig (der Bürger kann widersprechen → ADR-0006 greift unverändert).

### 2. Sollstellung als append-only Forderungs-Ereignisse (Fall-Audit), nicht als neue Tabelle

Die Forderung + ihr Lebenszyklus werden als append-only Ereignisse im Fall-Audit geführt (Rule of Three — keine neue Tabelle, bis ein dritter Bedarf sie rechtfertigt):

- `forderung.gestellt` (Sollstellung: Betrag, Fälligkeit, Rechtsgrund = Bescheid-Referenz).
- `forderung.zahlung.eingegangen` (Teil-/Vollzahlung; Restbetrag ergibt sich aus der Summe — der Server rechnet, der Client nicht).
- `forderung.gemahnt` (Mahnstufe + neue Frist).
- `forderung.erledigt` (vollständig gezahlt/verrechnet) bzw. `forderung.niedergeschlagen` / `forderung.gestundet`.

Der offene Restbetrag ist eine **reine Ableitung** aus den Ereignissen (`Sollstellung − Σ Zahlungen`) — eine testbare Funktion, keine gespeicherte, driftende Zweitwahrheit (Muster wie die N-Augen-Zählung #56 + die Restbetrag-freie Bescheid-Herkunft #60).

### 3. Der Einzug läuft über den PaymentPort (wiederverwendet)

Zahlt der Bürger die Rückforderung, wird `createPayment` mit `purpose="rueckforderung"` + der Forderungs-/Fall-Referenz aufgerufen (dieselbe ePayBL-Naht wie die Gebühr). `getPaymentStatus`/Webhook bucht den Eingang als `forderung.zahlung.eingegangen`. Der PaymentPort bleibt unverändert — nur ein neuer `purpose` + die fachliche Verbuchung darüber.

### 4. Mahnwesen über den Fristen-Scanner (#58)

Der zeitgetriebene Scanner (#58, CronJob) findet überfällige `forderung.gestellt` ohne ausreichende Zahlung und legt einen `frist.mahnung`-Task/`forderung.gemahnt`-Ereignis an (deterministisch, injizierte Zeit). Keine neue Worker-Infrastruktur — der Motor `runDeadlineScanForTenants` wird um die Forderungs-Fälligkeit erweitert.

## Konsequenzen / betroffene Flächen (bewusst benannt)

- **Zustandsmaschine**: optionaler Rückforderungs-Zweig (z. B. `festgesetzt → rueckforderung_festgesetzt → erstattet | niedergeschlagen`) als DATEN in `leistung.config` + Spiegel (Drift-Gate) — analog ADR-0006.
- **PaymentPort**: unverändert; nur neuer `purpose`-Wert + fachliche Verbuchung im BFF (harness-nahe `/api/payment`/`cases` — Koordination).
- **Restbetrag-Ableitung**: reine Funktion + Tests (keine gespeicherte Zweitwahrheit).
- **Fristen-Scanner (#58)**: Erweiterung um Forderungs-Fälligkeit → Mahnung.
- **Bürger-Sicht**: „offene Forderung + zahlen"-Panel (reuse `EPaymentPanel`), Rückforderungsbescheid im Bescheid-Abruf.

## Nicht-Ziele (spätere Stufen)

- Vollstreckung/Amtshilfe (Vollstreckungsersuchen) als eigener Außen-Port.
- Verrechnung mit laufenden Leistungen (Aufrechnung § 51 SGB I) als automatischer Buchungslauf.
- Stundung/Ratenplan-Rechner (zunächst: Ereignisse als DATEN, Rechenlogik minimal).
- Doppelte Buchführung / Haushalts-/Kassensystem-Anbindung (eigener Port, wenn ein dritter Bedarf ihn rechtfertigt).
