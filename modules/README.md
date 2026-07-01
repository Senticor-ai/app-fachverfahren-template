# Domain-Module

Konkrete Fachverfahren werden hier als Domain-Module angelegt.

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

Vor der Implementierung eines Screens gehört ein Screen Contract in das Modul,
zum Beispiel:

```text
modules/<domain>/ui/<screen>.contract.yaml
```

Nutze `docs/ux-ui/screen-contract.template.yaml` als Vorlage. Schreibe zuerst
Tests und Storybook-Zustände für Loading, Empty, Error, Ready,
Rollen-/Rechte-Sichtbarkeit und Accessibility.

Formulare beginnen mit `forms/*.form.schema.json`. Die UI soll unterstützte
Schema-Constraints wie Pflichtfeld, `minLength`, `maxLength` und `pattern` in
native Eingabeattribute und Inline-Fehler übersetzen. Der Serververtrag bleibt
verbindlich; wenn eine Regel nur serverseitig geprüft wird, steht diese Lücke im
Screen Contract.

Mehrschritt-Formulare definieren React-Hilfskomponenten auf Modulebene. Kleine
Render-Helfer innerhalb des Formulars werden als `{renderStep()}` aufgerufen und
nicht als verschachtelte Komponenten gerendert.

Der BFF-Server-Build umfasst nur `apps/fachverfahren-template/server/` und
`apps/fachverfahren-template/shared/`. Domain-Module dürfen ihre fachliche
Serverlogik unter `modules/<domain>/server/` modellieren, aber nicht ad hoc in
den Template-Server importieren. Gemeinsame DTOs gehören in den expliziten
Shared- oder Paketvertrag; die spätere Serveranbindung muss bewusst registriert
werden.

## Vorlagen und Beispiele

Dieses Verzeichnis ist der Zielort fuer generierte Fachverfahren-Module, nicht
die Quelle fuer wiederverwendbare Komponenten. Coding Agents erzeugen hier nur
das konkrete `modules/<domain>/` aus App-Spezifikation, Screen Contracts,
Permissions, Events, Tests und Compliance-Profil.

Wiederverwendbare UI-Bausteine liegen im GitHub-Template unter
`packages/fachverfahren-kit/src/components/`; shadcn/Radix/Tailwind-Primitive
unter `packages/fachverfahren-kit/src/ui/`. Der Katalog steht in
`docs/reference/fachverfahren-kit-components.md`.

Prüfung:

```bash
pnpm run check:domain-contracts
```

Der Template-Runtime-Code bleibt domain-neutral. Fachspezifische Beispiele
dürfen hier in einem separaten Modul entstehen, aber nicht in die
Plattformpakete zurückkopiert werden.
