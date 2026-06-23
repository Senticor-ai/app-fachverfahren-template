# Domain-Module

Ein Fachverfahren wird als Domain-Modul geliefert:

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
