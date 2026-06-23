# Architekturübersicht

Dieses Repository liefert keinen grossen Anwendungsfork, sondern eine
versionierte Plattformbasis für Fachverfahren. Die zentrale Regel lautet:

```text
Domain module
  -> public-sector capability contracts
  -> jurisdiction/provider adapters
  -> managed infrastructure services
```

## Ebenen

**Domain module**

Enthält Fachlogik, Fachbegriffe, Formulare, Berechtigungen, Events,
Migrationen und Compliance-Angaben eines konkreten Verfahrens. Ein Domain-Modul
liegt unter `modules/<domain>/` und wird durch `domain.module.yaml`
beschrieben.

**Public-sector capability contracts**

Sind stabile Ports für wiederverwendbare Verwaltungsfähigkeiten:
Identität und Vertrauen, Datenaustausch, Nachweisabruf, Zahlung, Postfach,
Signatur/Siegel, Behördenverzeichnis, Records Management, Benachrichtigung,
Workflow und Audit.

**Jurisdiction/provider adapters**

Jurisdiction-Packs beschreiben Rechtsraum, Sprache, Fristen, Semantik,
Barrierefreiheitsprofil und passende Verwaltungsstandards. Provider-Packs
beschreiben die konkrete Infrastrukturbindung.

**Managed infrastructure services**

PostgreSQL, Object Storage, Valkey, RabbitMQ, OpenSearch und vergleichbare
Dienste werden über Service-Bindings angebunden. Domain-Code sieht diese
Dienste nicht direkt.

## Warum keine reine Template-Kopie?

Kopierte Templates werden schnell dauerhafte Forks. Sicherheitsfixes,
Accessibility-Verbesserungen, neue Plattform-APIs und Providerwechsel müssten
dann in jede App manuell gemerged werden. Deshalb liegt wiederverwendbare Logik
in versionierten Paketen und die konkrete Anwendung bleibt dünn.

## Runtime-Rollen

- `web`: HTTP, SPA, BFF, Runtime-Konfiguration
- `worker`: Queue-Consumer, Dokumentverarbeitung, asynchrone Jobs
- `scheduler`: Fristen, Erinnerungen, wiederkehrende Arbeit
- `migrator`: kontrollierte Datenbank- und Datenmigrationen

Alle Rollen können anfangs dasselbe Image nutzen, haben aber eigene
Kubernetes-Workloads, Service Accounts, Skalierung und Netzwerkrechte.
