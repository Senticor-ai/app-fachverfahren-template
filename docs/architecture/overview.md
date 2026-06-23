# Architekturuebersicht

Dieses Repository liefert keinen grossen Anwendungsfork, sondern eine
versionierte Plattformbasis fuer Fachverfahren. Die zentrale Regel lautet:

```text
Domain module
  -> public-sector capability contracts
  -> jurisdiction/provider adapters
  -> managed infrastructure services
```

## Ebenen

**Domain module**

Enthaelt Fachlogik, Fachbegriffe, Formulare, Berechtigungen, Events,
Migrationen und Compliance-Angaben eines konkreten Verfahrens. Ein Domain-Modul
liegt unter `modules/<domain>/` und wird durch `domain.module.yaml`
beschrieben.

**Public-sector capability contracts**

Sind stabile Ports fuer wiederverwendbare Verwaltungsfaehigkeiten:
Identitaet und Vertrauen, Datenaustausch, Nachweisabruf, Zahlung, Postfach,
Signatur/Siegel, Behoerdenverzeichnis, Records Management, Benachrichtigung,
Workflow und Audit.

**Jurisdiction/provider adapters**

Jurisdiction-Packs beschreiben Rechtsraum, Sprache, Fristen, Semantik,
Barrierefreiheitsprofil und passende Verwaltungsstandards. Provider-Packs
beschreiben die konkrete Infrastrukturbindung.

**Managed infrastructure services**

PostgreSQL, Object Storage, Valkey, RabbitMQ, OpenSearch und vergleichbare
Dienste werden ueber Service-Bindings angebunden. Domain-Code sieht diese
Dienste nicht direkt.

## Warum keine reine Template-Kopie?

Kopierte Templates werden schnell dauerhafte Forks. Sicherheitsfixes,
Accessibility-Verbesserungen, neue Plattform-APIs und Providerwechsel muessten
dann in jede App manuell gemerged werden. Deshalb liegt wiederverwendbare Logik
in versionierten Paketen und die konkrete Anwendung bleibt duenn.

## Runtime-Rollen

- `web`: HTTP, SPA, BFF, Runtime-Konfiguration
- `worker`: Queue-Consumer, Dokumentverarbeitung, asynchrone Jobs
- `scheduler`: Fristen, Erinnerungen, wiederkehrende Arbeit
- `migrator`: kontrollierte Datenbank- und Datenmigrationen

Alle Rollen koennen anfangs dasselbe Image nutzen, haben aber eigene
Kubernetes-Workloads, Service Accounts, Skalierung und Netzwerkrechte.
