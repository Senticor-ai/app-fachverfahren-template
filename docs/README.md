# Dokumentation

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST — Navigationsseite für den realen Dokumentationsbestand.
> Quellen: `AGENTS.md`, `agent.discovery.json`, `package.json`, `docs/`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

`AGENTS.md` ist die kanonische Arbeitsanweisung. Diese Seite ordnet die
vertiefende Dokumentation nach Aufgabe; sie wiederholt keine Agenten- oder
Produktregeln.

## Einstieg

| Aufgabe                              | Kanonische Dokumentation                                                  |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Repository und Architektur verstehen | `docs/architecture/overview.md`                                           |
| Coding Agent starten                 | `docs/agents/bootstrap.md`                                                |
| Fachverfahren konfigurieren          | `AGENTS.md`, `.agents/skills/fachverfahren-app/SKILL.md`                  |
| Komponenten auswählen                | `docs/reference/fachverfahren-kit-components.md`                          |
| UI oder Screen Contract ändern       | `docs/ux-ui/fachverfahren-ux-contract.md`                                 |
| Storybook abnehmen                   | `docs/reference/storybook.md`                                             |
| Fastify-Backend erweitern            | `docs/reference/backend-fastify.md`                                       |
| Template erzeugen oder aktualisieren | `docs/reference/template-lifecycle.md`                                    |
| Web oder Kubernetes ausliefern       | `docs/reference/web-delivery.md`, `docs/reference/kubernetes-delivery.md` |
| Evidence erzeugen                    | `docs/compliance/evidence.md`                                             |

## Verzeichnisse

- `agents/`: vendor-neutraler Agenten-Einstieg. Tool-spezifische Regeln leben
  nicht hier, sondern ausschließlich in Shims auf `AGENTS.md` und
  `.agents/skills/`.
- `architecture/`: aktueller Aufbau und ausdrücklich markierte Zielbilder.
- `capabilities/`: kurze, maschinenreferenzierte Capability-Verträge aus
  `platform/capabilities.json`.
- `compliance/`: Evidence-Anforderungen und Beispielprofil.
- `examples/`: fachliche Beispiele; niemals Quelle für Template-Runtime-Code.
- `reference/`: operative Verträge für Entwicklung, Delivery und Lifecycle.
- `ux-ui/`: verbindlicher UX/UI-Vertrag, Screen-Contract-Vorlage und aktueller
  Konformitätsstand.

## Status und Pflege

- `IST` beschreibt vorhandenen Code, reale Package-Scripts und bestehende
  Routen.
- `PLAN` beschreibt noch nicht implementierte Zielarchitektur und darf nicht
  wie eine vorhandene Funktion formuliert werden.
- Neue Dokumente beginnen mit dem Kopfblock aus `AGENTS.md`.
- Eine Regel hat genau eine kanonische Quelle. Andere Dokumente verlinken
  dorthin, statt Varianten zu kopieren.
- Veraltete Upgrade-Pläne und abgeschlossene Audit-Zwischenstände werden nicht
  als dauerhafte Referenz aufbewahrt; relevante Regeln wandern in den
  kanonischen Vertrag, der aktuelle Nachweis in ein Konformitätsdokument.
