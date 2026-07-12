# Hunderegister Berlin — Befund (externes Referenzbeispiel)

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST — beschreibt einen realen, produktiven Bürgerdienst außerhalb
> dieses Repositories (nicht das Template selbst).
> Quellen: https://www.hunderegister.berlin.de (öffentliche Seiten + ein
> authentifizierter Durchlauf mit einem realen Halterkonto, 2026-07-10),
> https://service.berlin.de/dienstleistung/330785/, Berliner Hundegesetz
> (HundeG).
> Pflicht-Lektüre vorher: `AGENTS.md`, `docs/examples/hundesteuer/` (verwandtes
> Beispiel), `docs/architecture/repeating-group-fields.md` (die daraus
> abgeleitete Plattform-Lücke).

Dieses Dokument ist — wie `docs/examples/hundesteuer/` — ein **externes
Beispiel**: reine Fachrecherche zu einem realen Bürgerdienst, kein
Runtime-Code und keine Vorgabe für einen konkreten Fachverfahren-Build. Es
dient als Beleg für die in `docs/architecture/repeating-group-fields.md`
vorgeschlagene Kit-Erweiterung und als Ausgangspunkt, falls später ein
Hunderegister- oder erweitertes Hundesteuer-Beispiel gebaut wird.

## Zweck der Recherche

Prüfen, was ein reales, produktives deutsches Bürgeramt-Verfahren an
Formular-/Datenmodell-Bausteinen braucht, und das mit dem heutigen
Funktionsumfang von `packages/fachverfahren-kit` abgleichen.

## Quellenlage — bestätigt vs. angenommen

Zwei Recherchephasen, sauber getrennt:

1. **Öffentlich, ohne Login** (Leistungsbeschreibung, FAQ, Halterkonto-
   Anlageformular, Login-Seite, Downloads-Seite) — als „öffentlich" markiert.
2. **Authentifiziert** (ein realer Halterkonto-Login, per Playwright-Skript,
   2026-07-10) — als „bestätigt (eingeloggt gesehen)" markiert. Es wurde
   **keine** echte Hundeanmeldung abgeschlossen und **keine** Zahlung
   ausgelöst — die Erfassung endete auf der letzten Formularseite, vor dem
   Absenden-Button. Das Konto zeigt danach weiterhin „Sie haben noch keine
   Hunde eingetragen."

Personenbezogene Daten (Name, Geburtsdatum, Anschrift) des verwendeten
Kontos wurden bewusst **nicht** in dieses Dokument übernommen — nur die
Feldstruktur (Label, Typ, technischer Name, Pflicht/optional).

## Datenmodell: Halterkonto

**Anlageformular (öffentlich, `/register/`):**

| Feld                                          | Typ                                                                                                   | Pflicht                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| E-Mail-Adresse (+ Wiederholung)               | E-Mail                                                                                                | ja                     |
| Passwort (+ Wiederholung)                     | Passwort, min. 8 Zeichen + 2 von 3 Kriterien (Groß/Klein/Ziffer/Sonderzeichen)                        | ja                     |
| Juristische Person anmelden                   | Checkbox — schaltet ein alternatives Namensfeld frei statt Anrede/Titel/Vorname/Nachname/Geburtsdatum | optional               |
| Anrede                                        | Auswahl: Herr/Frau/Divers                                                                             | ja (natürliche Person) |
| Titel                                         | Auswahl: Kein Titel/Prof./Dr./Prof. Dr.                                                               | ja (natürliche Person) |
| Vorname, Nachname                             | Text                                                                                                  | ja                     |
| Geburtsdatum                                  | Datum                                                                                                 | ja                     |
| Telefon                                       | Text                                                                                                  | optional               |
| PLZ                                           | Text (steuert Ort/Straße-Vorschläge)                                                                  | ja                     |
| Ort, Straße                                   | Text mit Autovervollständigung (PLZ-gebunden)                                                         | ja                     |
| Hausnummer                                    | Text                                                                                                  | ja                     |
| Adresszusatz                                  | Text                                                                                                  | optional               |
| Einwilligung Speicherung freiwilliger Angaben | Checkbox                                                                                              | optional               |

**Benutzerprofil (bestätigt (eingeloggt gesehen), `/profil/anzeigen`) —
zusätzlich zum Anlageformular sichtbar:**

- Ein separates **„Ortsteil"**-Feld in der Anschrift, zusätzlich zu
  Straße+Hausnummer und PLZ+Ort (Berliner Verwaltungsgliederung unterhalb der
  Postleitzahl — im öffentlichen Anlageformular nicht erkennbar).
- Metadaten: „Letzter Login", „Erstellt am", „Geändert am" (Audit-Zeitstempel
  auf Kontoebene).
- Aktionen: „Benutzerkonto bearbeiten", „Kontoauszug herunterladen (PDF)",
  „Benutzerkonto löschen" (Selbstauskunft/Selbstlöschung — DSGVO-Betroffenenrechte
  als Self-Service, nicht nur als Behördenvorgang).

## Datenmodell: Hund (pro Tier)

**Bestätigt (eingeloggt gesehen) — vollständige Feldliste der Seite
„Hund eintragen" (`/dogs/new`, technische Feldnamen `app_dogtype[...]`):**

| Feld                                          | Technischer Name          | Typ                                                                                                            | Pflicht                 |
| --------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Tag unbekannt                                 | `birthDayUnknown`         | Checkbox                                                                                                       | optional                |
| Monat unbekannt                               | `birthDayAndMonthUnknown` | Checkbox                                                                                                       | optional                |
| Geburtsdatum                                  | `birthdate`               | Datum                                                                                                          | **ja**                  |
| Transponder-Nr.                               | `transponder`             | Text, max. 15 Zeichen                                                                                          | **ja**                  |
| Nicht ISO-konforme Transpondernummer          | `nonIso`                  | Checkbox                                                                                                       | optional                |
| Beginn der Hundehaltung                       | `keepingDates[beginning]` | Datum                                                                                                          | **ja**                  |
| Rufname                                       | `name`                    | Text                                                                                                           | optional („freiwillig") |
| Mischling                                     | `hybrid`                  | Auswahl Ja/Nein                                                                                                | optional                |
| Rasse                                         | `race`                    | Auswahl (~400 FCI-/nationale Rassen + Leereintrag), plus Link „Ist die Rasse nicht dabei?" als Eskalationspfad | optional                |
| 2. Rasse                                      | `raceHybrid`              | Auswahl, identische Liste wie „Rasse"                                                                          | optional                |
| Geschlecht                                    | `sex`                     | Auswahl: Rüde/Hündin                                                                                           | optional                |
| Bild                                          | `image`                   | Datei-Upload                                                                                                   | optional                |
| Einwilligung Speicherung freiwilliger Angaben | `confirmOptional`         | Checkbox                                                                                                       | optional                |
| Zahlungsmethode                               | `payment[type]`           | Radio: SEPA-Überweisung / PayPal via pmPayment                                                                 | **ja**                  |

Anmerkungen:

- **„Hund eintragen" ist EIN einziges Formular**, kein mehrstufiger Wizard —
  Halterkonto-Anlage ist zwar mehrschrittig (Konto → Login → Hund
  eintragen), aber die Hunde-Erfassung selbst liegt komplett auf einer
  Seite, Zahlungsmethode inklusive. Das weicht vom Muster
  Review→Bezahlen→Quittung ab, das `EPaymentPanel` im Kit abbildet
  (dort folgt die Zahlungsart-Wahl NACH dem Absenden, nicht als Teil
  desselben Formulars) — ein bewusst anderer, ebenfalls valider Ablauf,
  kein Fehler in einem der beiden Systeme.
- Das FAQ hatte „Tattoo-Nummer als Alternative zum Chip" nahegelegt; das
  reale Formular hat dafür **kein separates Identifikationsart-Feld**,
  sondern nur EIN Transponder-Textfeld plus eine Checkbox „nicht
  ISO-konform" — die ursprüngliche FAQ-Lesart war also eine
  Vereinfachung/Fehlinterpretation der öffentlichen Quelle allein; der
  authentifizierte Blick korrigiert sie.
- Nicht sicher bestätigt: ob „2. Rasse" per JavaScript nur bei
  „Mischling = Ja" sichtbar geschaltet wird (das Erfassungsskript liest den
  DOM unabhängig von CSS-Sichtbarkeit) — als offene Frage markiert, nicht
  als Fakt behauptet.
- Die Rasse-Liste enthält "Mischling" selbst als einen Eintrag UND es gibt
  zusätzlich das separate `hybrid`-Ja/Nein-Feld — eine im Original leicht
  redundante/uneinheitliche Modellierung, hier nur dokumentiert, nicht zur
  Nachahmung empfohlen.
- Kein sichtbares „gefährlicher Hund"/Listenhunde-Feld auf dieser
  Formularseite — die Einstufung wird vermutlich serverseitig aus der
  gewählten Rasse abgeleitet (siehe Abgleich mit dem Kit unten).

**Öffentlich (Leistungsbeschreibung service.berlin.de/dienstleistung/330785)
— ergänzend, nicht im Formular selbst bestätigt:**

- Optionale „Markennummer" für Listenhunde (in der eingesehenen Formularseite
  nicht sichtbar — evtl. bedingt eingeblendet nach Rasse-Auswahl, nicht
  getestet).
- Foto max. 250 KB (Formular zeigt kein Limit im DOM-Attribut, nur laut FAQ-Text).

## Lebenszyklus: mehrere Hunde je Halter:in

- „Meine Hunde" (`/dogs/`) listet alle Hunde eines Kontos, durchsuchbar nach
  Transpondernummer, mit einem eigenen „+ Hund eintragen"-Button je Konto
  (nicht je Hund begrenzt).
- Laut FAQ ist jeder Hund einzeln abmeldbar (eigener Grund/eigenes Datum je
  Tier) — im authentifizierten Durchlauf nicht erreichbar, da das Testkonto
  keine Hunde enthält (nichts zum Abmelden vorhanden).
- Jeder Hund trägt eine eigene, unabhängige Transpondernummer — das ist der
  Kern-Beleg dafür, dass „mehrere Hunde" ein Array eigenständiger Entitäten
  ist, keine reine Stückzahl.

## Gebühren, Zahlung, Kanäle

- 17,50 €/Hund online, 26,50 €/Hund schriftlich/telefonisch — Kanal-abhängiger
  Tarif, beide Kanäle laufen über denselben Dienstleister (GovConnect GmbH),
  nicht direkt über die Behörde.
- Änderungen/Abmeldung stets kostenfrei.
- Zahlungsart wird IM Anmeldeformular gewählt (SEPA-Überweisung — Zahlung
  erst nach postalischem Gebührenbescheid — oder PayPal via pmPayment,
  direkte Weiterleitung).
- Zahlungsfrist 10 Tage (laut FAQ, im Formular selbst nicht sichtbar).

## Login/Identität

- Lokales E-Mail/Passwort-Konto (Standardweg).
- „Technischer Zugang" (KDO_AD) und „GovConnect-Login (intern)" als weitere,
  vermutlich für interne/Fach-Nutzer:innen gedachte Anmeldewege — Mehrfach-
  IdP-fähiges Login, nicht nur ein einzelner Provider.
- Registrierung dient seit 2024-01-01 zugleich als Steueranmeldung beim
  Finanzamt — Hunderegister und Hundesteuer sind in der Realität EIN
  verbundener Vorgang (siehe `docs/examples/hundesteuer/`).

## Abgleich mit `packages/fachverfahren-kit` (heutiger Stand)

| Bedarf aus der Realität                                                                         | Kit-Abdeckung heute                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Halter: natürliche vs. juristische Person, bedingte Felder                                      | ✅ `sichtbarWenn` deckt das ab                                                                                                  |
| PLZ-gebundene Adress-Autovervollständigung                                                      | ✅ `AdressValidierung`                                                                                                          |
| Große, datengetriebene Auswahlliste (400 Rassen) mit Eskalationspfad für Fehlende               | ✅ `datenlisten`/`Codeliste` + `optionsRef`; der „nicht dabei?"-Link selbst ist reine UX ohne Kit-Gegenstück, geringe Priorität |
| Rasse → automatisch abgeleitete Gefährlichkeits-/Sonderklasse                                   | ✅ bereits vorgesehen über `CodelistenAbleitung`/`FeldAbleitung` (M1) — bisher nur nicht an einem realen Beispiel demonstriert  |
| Datei-Upload (Foto), optional, Größenlimit                                                      | ✅ `Nachweis`/`DateiUpload`                                                                                                     |
| Zahlungsart-Wahl, Kanal-abhängiger Tarif                                                        | ✅ `EPaymentConfig`/`Tarif` (Kanal-Bedingung ist eine normale `Tarif.staffeln[].bedingung`, kein neuer Mechanismus nötig)       |
| Mehrere Hunde je Halter:in, jeder mit eigener Chip-Nr./Rasse/Status, einzeln lebenszyklus-fähig | ❌ **Lücke** — kein generisches Repeating-Group-Feld; siehe `docs/architecture/repeating-group-fields.md`                       |
| Konto-Selbstauskunft/-löschung als Self-Service                                                 | — außerhalb des Antrags-Scopes des Kits, hier nur zur Kenntnis                                                                  |

Die einzige echte Plattformlücke ist die letzte Zeile — alles andere ist im
Kit heute bereits modellierbar. Die vorgeschlagene Erweiterung dazu steht in
`docs/architecture/repeating-group-fields.md`.

## Offene Validierungsfragen

- Ist „2. Rasse" tatsächlich bedingt an `Mischling = Ja` geknüpft, oder immer
  sichtbar?
- Erscheint eine „Markennummer" bedingt nach Auswahl einer Listenhund-Rasse?
- Wie genau wird „gefährlicher Hund" serverseitig aus der Rasse-Auswahl
  abgeleitet (Codeliste/Merkmal vs. Freitext-Prüfung durch Sachbearbeitung)?
- Gilt die 250-KB-Fotogrenze clientseitig (HTML-Attribut) oder nur
  serverseitig?

Diese vier Fragen sind bewusst offen — keine der Annahmen in diesem Dokument
wird als geltendes Recht oder bestätigtes Verhalten ausgegeben, wo sie nicht
im authentifizierten Durchlauf beobachtet wurde.
