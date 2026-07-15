> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für die genannten Repo-Anknüpfungen; PLAN für Modellierung,
> Prüfung und organisatorische Umsetzung. Dieses Dokument ist eine vorläufige
> Arbeitsgrundlage und ausdrücklich keine Konformitätsaussage.
> Quellen: [BSI IT-Grundschutz-Kompendium, Edition 2023](https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Grundschutz/IT-GS-Kompendium/IT_Grundschutz_Kompendium_Edition2023.pdf?__blob=publicationFile&v=4),
> [Errata zur Edition 2023, Stand 5. Mai 2025](https://www.bsi.bund.de/SharedDocs/Downloads/DE/BSI/Grundschutz/IT-GS-Kompendium/errata_2023.pdf?__blob=publicationFile&v=8)
> sowie die in der Tabelle genannten Dateien.
> Pflicht-Lektüre vorher: `AGENTS.md`,
> `.agents/skills/deutschland-plattform-anforderungen/SKILL.md`.

# Vorläufiges IT-Grundschutz-Mapping

Version: 0.1.0 · Stand: 2026-07-15

## Aussagegrenze

Die Tabelle identifiziert mögliche technische Anknüpfungspunkte des Templates für
eine spätere Modellierung nach BSI IT-Grundschutz. Sie bewertet weder einzelne
Anforderungen eines Bausteins noch deren Umsetzungsgrad. Ein vorhandener Codepfad
ist kein Wirksamkeitsnachweis und wird nicht an generierte Fachverfahren vererbt.

Vor einer belastbaren Zuordnung müssen Verantwortliche mindestens den
Informationsverbund, die Zielobjekte, den Schutzbedarf, die anzuwendenden Bausteine
und Anforderungen sowie die organisatorischen und betrieblichen Nachweise festlegen.
Die abschließende Bewertung gehört in den Grundschutz-Check und das
Sicherheitskonzept der konkreten Betriebsumgebung.

Bewertungswerte in dieser Arbeitsliste:

- `zu bestätigen`: Im Repository existiert ein technischer Anknüpfungspunkt; Relevanz,
  Vollständigkeit und Wirksamkeit sind noch zu prüfen.
- `offen`: Das Template enthält keinen hinreichenden Anknüpfungspunkt für das Thema.

## Kandidaten für die spätere Modellierung

| Baustein-Kandidat                                     | Möglicher Bezug                                   | Bewertung     | Repo-Anknüpfung                                                                                                                                     | Erforderliche Bestätigung                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| ORP.4 Identitäts- und Berechtigungsmanagement         | Rollen, Permissions und Policy-Auswertung         | zu bestätigen | `packages/public-sector-sdk/src/authorization.ts` · `packages/public-sector-sdk/src/rbac.ts`                                                        | Rollenmodell, Identitätsquelle, Joiner-Mover-Leaver-Prozess, Rezertifizierung und produktive Durchsetzung prüfen.    |
| APP.3.1 Webanwendungen und Webservices                | HTTP-Sicherheitsheader und Session-Auflösung      | zu bestätigen | `packages/app-runtime-fastify/src/security-headers.ts` · `packages/app-runtime-fastify/src/session-resolver.ts`                                     | Bedrohungsmodell, sichere Konfiguration, Authentisierung, Eingabeprüfung, Tests und Betriebsparameter prüfen.        |
| CON.1 Kryptokonzept                                   | Kryptografische Verfahren und Schlüsselverwaltung | offen         | —                                                                                                                                                   | Kryptokonzept, TLS-Endpunkte, Verschlüsselung ruhender Daten, KMS-Verantwortung und Rotation festlegen.              |
| CON.2 Datenschutz                                     | deklarierbare Datenkategorien und Aufbewahrung    | zu bestätigen | `packages/public-sector-sdk/src/module-manifest.ts`                                                                                                 | Rechtsgrundlage, Zweckbindung, Löschung, Auskunft, Datenschutz-Folgenabschätzung und operative Umsetzung prüfen.     |
| CON.3 Datensicherungskonzept                          | Backup, Restore, RPO und RTO                      | offen         | —                                                                                                                                                   | Plattform- und Betreiberverantwortung, Sicherungsumfang, Wiederherstellungstests sowie RPO/RTO dokumentieren.        |
| CON.8 Software-Entwicklung                            | automatisierte Qualitäts- und Lieferprüfungen     | zu bestätigen | `scripts/ci-validate.sh` · `docs/compliance/evidence.md`                                                                                            | Entwicklungsrichtlinie, Review, Schwachstellenmanagement, Geheimnisschutz und Wirksamkeitsnachweise prüfen.          |
| OPS.1.1.5 Protokollierung                             | strukturierte Laufzeit- und Audit-Ereignisse      | zu bestätigen | `packages/app-runtime-fastify/src/logging.ts` · `packages/app-runtime-fastify/src/audit-sink.ts` · `packages/app-store-postgres/src/audit-store.ts` | Ereigniskatalog, Datenschutz, Zeitsynchronisation, Aufbewahrung, Manipulationsschutz und zentrale Auswertung prüfen. |
| DER.1 Detektion von sicherheitsrelevanten Ereignissen | Erkennung, Alarmierung und Reaktion               | offen         | —                                                                                                                                                   | Detektionsregeln, SIEM-Anbindung, Alarmwege, Zuständigkeiten und Tests definieren.                                   |
| SYS.1.6 Containerisierung                             | Container-Build und Laufzeitgrenzen               | zu bestätigen | `Dockerfile`                                                                                                                                        | Image-Härtung, Registry-Vertrauen, Signaturen, Laufzeit-Policies, Netzwerk und Patchprozess prüfen.                  |

## Pflege und Verwendung

Das Gate `scripts/check-bsi-grundschutz.mjs` prüft nur die mechanische Qualität
dieser Arbeitsliste: Disclaimer, Mindestumfang, zulässige Bewertungswerte und
existierende Repo-Pfade. Es prüft keine BSI-Anforderung und keine technische oder
organisatorische Wirksamkeit.

Jede Nutzung in einem Sicherheitskonzept muss Edition und Errata erneut prüfen und
die Kandidaten gegen den konkret modellierten Informationsverbund bestätigen,
streichen oder präzisieren.
