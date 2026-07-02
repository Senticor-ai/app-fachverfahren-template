# Domain-Module (PLAN)

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: PLAN — beschreibt das Modul-Layout des Generator-Pfads (`app:new`).
> Im Scaffold existiert keine Modul-Instanz, und die laufende App bindet
> Module nicht ein; der kanonische IST-Weg ist die Austausch-Naht
> (`AGENTS.md`, `modules/README.md`).
> Quellen: `tooling/template/lib/agent-platform.ts`,
> `schemas/module-contract.schema.json`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

Ein Fachverfahren kann als Domain-Modul geliefert werden:

```text
modules/<domain>/
  domain.module.yaml
  contracts/
  server/
  ui/
  forms/
  permissions/
  events/
  migrations/
  i18n/
  tests/
  compliance/
```

Beispielmanifest:

```yaml
id: example-procedure
version: 1.0.0
displayName: Beispielverfahren

routes:
  - path: /cases/example-procedure
    surface: caseworker

requiredCapabilities:
  - identity-and-trust
  - data-exchange

permissions:
  - permission: example.case.read
    description: Fälle lesen

events:
  publishes:
    - eventType: example.case-created
      version: v1
  consumes: []

dataCategories:
  - confidential

retentionPolicies:
  - example-case-records

migrations:
  database: migrations/
  documents: document-migrations/
```

Das Manifest ist die Schnittstelle für Generatoren, Coding Agents und
Conformance-Prüfungen.
