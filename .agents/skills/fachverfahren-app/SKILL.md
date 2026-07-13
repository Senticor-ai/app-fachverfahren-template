---
name: fachverfahren-app
description: Build or extend a Fachverfahren from this template by filling the ONE exchange seam (apps/fachverfahren/src/leistung.config.ts), emitting the contract snapshot, and validating with the real repo checks. Also covers full-repo scaffolding and standalone export.
---

# Fachverfahren App

Der Startpunkt für jeden Fachverfahren-Build aus diesem Template — für
automatisierte Build-Agenten genauso wie für Entwickler:innen ohne weiteres
Tooling. Root-Policy und Pfad-Karte: `AGENTS.md`.

## Kernprinzip

Dieses Repository ist die FERTIGE Startbasis. Ein neues Fachverfahren entsteht
durch das Füllen GENAU EINER Datei mit Fachdaten:

```text
apps/fachverfahren/src/leistung.config.ts
```

Die App rendert drei Personas (Bürger:in `/buerger`, Sachbearbeitung `/amt`,
Aufsicht `/aufsicht`) allein aus dieser `LeistungConfig`. Es wird KEIN
fachlicher Server, kein eigenes `index.html` und keine eigene
Komponenten-Bibliothek gebaut — die neutrale Fastify-Web-Runtime existiert in
`apps/fachverfahren/server`, die Bausteine existieren in
`packages/fachverfahren-kit`.

## Workflow (Naht füllen)

1. `AGENTS.md` lesen: Naht-Vertrag, Annahme-DATEN-Konvention, Pfad-Karte.
2. Optionaler vendor-neutraler Einstieg:

   ```bash
   pnpm run agent:bootstrap -- --json
   pnpm run agent:discover -- --json
   pnpm run agent:context -- --task <app-spec> --paths <pfad>
   ```

3. `apps/fachverfahren/src/leistung.config.ts` mit den Werten des
   freigegebenen Fachkonzepts füllen: `id/label/kommune`,
   `rechtsgrundlagen` (nur belegt), `antrag.steps` (Pflichtfelder mit
   Validierung; Bürger-Felder zusätzlich mit `leichteSprache`/`hintEinfach`
   im selben Schritt — siehe „Bürger-Sprache" unten), `statusMachine`
   (Endzustände `terminal: true`, kritische Übergänge `vierAugen: true`),
   `berechne` (rein, deterministisch, GANZE EURO, jede
   Tarifstufe/Befreiung/Ermäßigung als eigene Verzweigung, `status:
"provisional" | "final"`), `register`, `detailSektionen` sowie `ki` und
   `seed` (im Typ optional — setzen, damit Aufsicht und Sachbearbeitung
   sofort arbeiten). Optionale Signale (`ePayment`, `zustellung`, `termin`,
   `adressValidierung`, `personas`, `fimLeistung`, `nachweise`) nur setzen,
   wenn das Fachkonzept sie vorsieht.
4. Unbekannte Satzungswerte als markierte Annahme-DATEN führen
   (`// annahme <wert> EUR — TBD-<QUELLE>`), nie als Fakt in
   Anzeige-Strings.
5. NACH jedem Naht-Write den Vertrags-Snapshot erzeugen und mitliefern:

   ```bash
   pnpm --filter @senticor/fachverfahren emit:contract
   ```

6. Verifizieren und im Browser prüfen:

   ```bash
   pnpm run typecheck
   pnpm run test
   pnpm run dev
   ```

   Die Landing (`/`) ist die einzige Route ohne Anmeldung; alle Persona-
   und Workspace-Sichten (`/buerger*`, `/amt*`, `/aufsicht`, `/boards`,
   Benutzerverwaltung) liegen hinter dem Session-Gate und brauchen die
   lokale App-Runtime — der Vite-Dev-Server proxied `/auth` + `/api` an sie
   (`apps/fachverfahren/dev-proxy.ts`, Default `http://127.0.0.1:8080`):

   ```bash
   pnpm run dev:api
   ```

   `dev:api` baut Store und Server, fährt die Migrationen und startet die
   Runtime. Voraussetzung ist ein erreichbares Postgres samt Datenbank (Default
   `postgres://app:app@127.0.0.1:5432/app`, übersteuerbar via `APP_PG_URL`;
   abweichendes Proxy-Ziel via `VITE_DEV_API_PROXY_TARGET`). Beim ersten
   Start den Admin auf der Landing (`/`) mit dem Bootstrap-Token einrichten
   (Default `dev-setup`, nur lokal). Die login-freie Sichtprüfung der
   Bausteine läuft über `pnpm run storybook`.

## Bürger-Sprache: Leichte Sprache und Fachbegriffe

`FeldDef` trägt zwei optionale, ADDITIVE Sprachvarianten
(`packages/fachverfahren-kit/src/types.ts`), die niemals `label`/`hint`
ersetzen, sondern bei fehlendem Wert sauber darauf zurückfallen:

- `leichteSprache` — LEICHTE-SPRACHE-Fassung des Labels (DIN SPEC 33429).
- `hintEinfach` — vereinfachter Hilfetext für den Leichte-Sprache-Modus.

```ts
{
  name: "antragsteller.vorname",
  label: "Vorname",
  leichteSprache: "Ihr Vorname",
  typ: "text",
  required: true,
}
```

Das Gegenstück `labelFachlich` (Amts-/Fachbezeichnung) geht in die
ENTGEGENGESETZTE Richtung — es blendet für die Sachbearbeitung den Fachbegriff
ein, nie eine vereinfachte Fassung. Beide Felder nicht verwechseln.

**Nur Bürger-Seite.** `leichteSprache`/`hintEinfach` werden ausschließlich von
`AntragStepper` gelesen, das ausschließlich unter `/buerger*` gemountet ist
(`apps/fachverfahren/src/App.tsx`). Sachbearbeitung (`/amt*`) liest diese
Felder nie — für Fachbegriffe in der Sachbearbeitung ist `labelFachlich`
zuständig. Kein Sachbearbeitung-Anwendungsfall für Leichte Sprache erfinden.

**Reihenfolge.** `leichteSprache`/`hintEinfach` gehören in GENAU DEN
Naht-Write, der das Feld anlegt — nie in eine spätere, getrennte
Anreicherungsphase. Läuft eine Anreicherung trotzdem separat, MUSS
`emit:contract` (Schritt 5) strikt danach laufen, nie davor: sonst ist
`leistung.contract.json` gegenüber der Config veraltet und
`check:leistung-contract` schlägt fehl. Ein lokaler Git-Hook regeneriert den
Snapshot zusätzlich vor jedem Commit (`docs/reference/precommit-hooks.md`) —
das ist nur ein Sicherheitsnetz für Commits durch dieses Repo hindurch, kein
Ersatz für die richtige Reihenfolge in einer externen Generierungs-Pipeline,
die eigene Commits ohne diese Git-Hooks erzeugt.

## Quellen-Lookup

- Websuche ist für offizielle Fachquellen erlaubt; für deutsche
  Verwaltungsleistungen darf `https://fimportal.de` durchsucht und FIM-IDs,
  Namen und Hierarchie als Strukturquelle verwendet werden.
- FIM ist Strukturquelle, nicht vollständige Rechtsgrundlage. Konkrete
  Satzungen, Gebühren, Fristen und lokale Regeln brauchen die zuständige
  Quelle oder die Annahme-DATEN-Konvention aus `AGENTS.md`.
- Für in `sources/registry.yaml` registrierte Quellen `source:fetch` nutzen.
- Quell-URLs und IDs dort festhalten, wo sie Verhalten begründen
  (`rechtsgrundlagen`, `fimLeistung`, Tests, Abschlussbericht).

## Grenzen

- Kit-Interna (`packages/fachverfahren-kit/src/components|ui`) und die dünne
  App-Komposition (`App.tsx`, `store.ts`, `main.tsx`) werden für einen
  Verfahrens-Build nicht geändert.
- `apps/fachverfahren/leistung.contract.json` ist generiert — nur via
  `emit:contract`.
- Der Modul-Pfad `modules/<domain>/` (Generator `app:new`) erzeugt ein
  Artefakt-Gerüst, das die laufende App NICHT einbindet (PLAN) — siehe
  `modules/README.md`. Für eine klickbare App zählt nur die Naht.
- Bei Kit-/UI-Änderungen (Plattformarbeit) vorher
  `.agents/skills/ux-ui/SKILL.md` lesen.

## Full-Repo-Scaffold und Standalone-Export

Neues vollständiges Repository über den Template-Lifecycle:

```bash
pnpm run scaffold:domain-app -- --domain <domain> --display-name <name> --target <target-dir> --allow-existing-empty
```

Generierte Repositories tragen `.template/`-Provenienz; Updates laufen über
`template:status`, `template:diff -- --to <version>`,
`template:update -- --to <version>`. `--force` nur für bewusstes Ersetzen;
`--allow-dirty` nur mit ausdrücklicher menschlicher Freigabe.

App-only-Export (kopiert `apps/fachverfahren`, löst `catalog:`- und
`workspace:*`-Versionen auf, schreibt `standalone-export-report.json`):

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

## CI-Hinweise

- GitLab/opencode.de-Runner sind unprivilegierte Kubernetes-Pods: Kaniko statt
  Docker-in-Docker.
- pnpm-Filter stehen vor `run`:
  `pnpm --filter "./packages/**" run --if-present build`.
- Reale Build-Kette: `pnpm run build:packages`, dann `pnpm run build:app`,
  dann `pnpm run build:server`.
