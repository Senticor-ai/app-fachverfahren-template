---
name: fachverfahren-app
description: Build or extend a Fachverfahren from this template by filling the ONE exchange seam (apps/antragsservice/src/leistung.config.ts), emitting the contract snapshot, and validating with the real repo checks. Also covers full-repo scaffolding and standalone export.
---

# Fachverfahren App

Der Startpunkt für jeden Fachverfahren-Build aus diesem Template — für
automatisierte Build-Agenten genauso wie für Entwickler:innen ohne weiteres
Tooling. Root-Policy und Pfad-Karte: `AGENTS.md`.

## Kernprinzip

Dieses Repository ist die FERTIGE Startbasis. Ein neues Fachverfahren entsteht
durch das Füllen GENAU EINER Datei mit Fachdaten:

```text
apps/antragsservice/src/leistung.config.ts
```

Die App rendert drei Personas (Bürger:in `/buerger`, Sachbearbeitung `/amt`,
Aufsicht `/aufsicht`) allein aus dieser `LeistungConfig`. Es wird KEIN
`server/`, kein eigenes `index.html` und keine eigene Komponenten-Bibliothek
gebaut — die Bausteine existieren in `packages/fachverfahren-kit`.

## Workflow (Naht füllen)

1. `AGENTS.md` lesen: Naht-Vertrag, Annahme-DATEN-Konvention, Pfad-Karte.
2. Optionaler vendor-neutraler Einstieg:

   ```bash
   pnpm run agent:bootstrap -- --json
   pnpm run agent:discover -- --json
   pnpm run agent:context -- --task <app-spec> --paths <pfad>
   ```

3. `apps/antragsservice/src/leistung.config.ts` mit den Werten des
   freigegebenen Fachkonzepts füllen: `id/label/kommune`,
   `rechtsgrundlagen` (nur belegt), `antrag.steps` (Pflichtfelder mit
   Validierung), `statusMachine` (Endzustände `terminal: true`, kritische
   Übergänge `vierAugen: true`), `berechne` (rein, deterministisch, GANZE
   EURO, jede Tarifstufe/Befreiung/Ermäßigung als eigene Verzweigung,
   `status: "provisional" | "final"`), `register`, `detailSektionen` sowie
   `ki` und `seed` (im Typ optional — setzen, damit Aufsicht und
   Sachbearbeitung sofort arbeiten). Optionale Signale (`ePayment`,
   `zustellung`, `termin`, `adressValidierung`, `personas`, `fimLeistung`,
   `nachweise`) nur setzen, wenn das Fachkonzept sie vorsieht.
4. Unbekannte Satzungswerte als markierte Annahme-DATEN führen
   (`// annahme <wert> EUR — TBD-<QUELLE>`), nie als Fakt in
   Anzeige-Strings.
5. NACH jedem Naht-Write den Vertrags-Snapshot erzeugen und mitliefern:

   ```bash
   pnpm --filter @senticor/antragsservice emit:contract
   ```

6. Verifizieren und im Browser prüfen:

   ```bash
   pnpm run typecheck
   pnpm run test
   pnpm run dev
   ```

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
- `apps/antragsservice/leistung.contract.json` ist generiert — nur via
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

App-only-Export (kopiert `apps/antragsservice`, löst `catalog:`- und
`workspace:*`-Versionen auf, schreibt `standalone-export-report.json`):

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

## CI-Hinweise

- GitLab/opencode.de-Runner sind unprivilegierte Kubernetes-Pods: Kaniko statt
  Docker-in-Docker.
- pnpm-Filter stehen vor `run`:
  `pnpm --filter "./packages/**" run --if-present build`.
- Reale Build-Kette: `pnpm run build:packages`, dann `pnpm run build:app`.
  Ein `build:server` existiert nicht (PLAN, Backend-Zielarchitektur).
