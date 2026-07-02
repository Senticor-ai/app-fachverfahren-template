# ADR-Vorlage: NNNN-kurzer-entscheidungs-slug

<!--
GOLDEN PATTERN fuer Architecture Decision Records (ADRs) dieses Projekts.

Konventionen (werden im Review erzwungen):
- Dateiname:   docs/adr/NNNN-<slug>.md  (vierstellige laufende Nummer + kleingeschriebener kebab-Slug,
               z.B. 0001-status-machine-als-config-daten.md)
- GENAU EINE Entscheidung je ADR: eine Datei = ein H1-Titel = eine signifikante Entscheidung.
  KEINE Sammel-ADRs ("alle Architektur-Entscheidungen") — die sind nicht einzeln revidierbar.
- Jede im Loesungsdesign (ARCHITEKTUR.md) referenzierte ADR-ID (ADR-NNNN) MUSS auf eine existierende
  Datei in diesem Verzeichnis aufloesen — keine toten Referenzen.
- Pflichtabschnitte: Kontext · Entscheidung · Alternativen · Konsequenzen.
- Nach Annahme (Status: accepted) ist das ADR unveraenderlich; eine Revision ist ein NEUES ADR,
  das das alte ersetzt (Status des alten: superseded by ADR-NNNN).

Zum Anlegen: Datei kopieren, umbenennen, Platzhalter ersetzen, diesen Kommentarblock loeschen.
-->

- Status: proposed | accepted | superseded by ADR-NNNN
- Datum: JJJJ-MM-TT

## Kontext

Welche Kraft/Anforderung erzwingt eine Entscheidung? Fachlicher und technischer Hintergrund,
Randbedingungen (z.B. Vorgaben aus Fachkonzept, Plattform, Barrierefreiheit, Betrieb), was passiert,
wenn nicht entschieden wird.

## Entscheidung

Die getroffene Entscheidung in 1-3 Saetzen, aktiv formuliert ("Wir verwenden ...", "Die Status-Uebergaenge
leben als Config-Daten in ...").

## Alternativen

| Alternative | Vorteile | Nachteile | Warum verworfen |
| ----------- | -------- | --------- | --------------- |
| Option B    | ...      | ...       | ...             |
| Option C    | ...      | ...       | ...             |

## Konsequenzen

Was wird dadurch leichter, was schwerer? Folgekosten, Migrationspfad, betroffene Module/Vertraege,
neue Pflichten (Tests, Betrieb, Dokumentation).
