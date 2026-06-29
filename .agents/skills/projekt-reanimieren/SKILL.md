# Projekt reanimieren (Template-Drift heilen)

Nutze diese Anleitung, wenn ein **bestehendes Build-Projekt blockiert** ist, weil sich das **Template-Repo
seit dem Klonen verändert hat** (ein Bug-Fix in der Basis — z.B. Kit/Infra). Typisches Signal: die App
**bundlet/rendert nicht** (`bundles-clean`-Probe ROT, Vite/esbuild PARSE_ERROR in `packages/fachverfahren-kit/...`),
obwohl `tsc` grün ist; oder eine Phase blieb hängen. Du heilst das **selbst mit nativen Befehlen** (git/rsync/Datei) —
KEIN Spezial-Tool nötig.

## Prinzip
Bis zu einer Phase **zurückrollen** → Template frisch in ein **Temp** synchronisieren → **Diff** ermitteln →
die **Basis** ins Projekt re-syncen, dabei die **generierten Artefakte erhalten** → Build ab der Phase fortsetzen.
Die Governance/Vorgaben bleiben bindend — du machst nur den Weg + die Basis frisch.

## Schritte (nativ)

1. **Template-Quelle bestimmen.** Lies `.chos/project.json` → `templateId` (Default `fachverfahren-kommune`).
   Git-Quelle: `https://github.com/Senticor-ai/app-fachverfahren-template.git` (Branch `main`).

2. **Frisch ins Temp klonen** (CLI):
   ```bash
   TMP=$(mktemp -d)
   git clone --depth 1 --single-branch --branch main \
     https://github.com/Senticor-ai/app-fachverfahren-template.git "$TMP"
   rm -rf "$TMP/.git"
   ```

3. **Details ermitteln (Diff).** Welche Basis-Dateien ändert der Re-Sync? (Trockenlauf, mit den Erhalt-Excludes):
   ```bash
   rsync -rin \
     --exclude=node_modules --exclude=.git --exclude=dist --exclude=.turbo --exclude=.DS_Store \
     --exclude='leistung.config.ts' --exclude=modules \
     --exclude='FACHKONZEPT.md' --exclude='EPIC.md' --exclude='PRD.md' --exclude='ARCHITEKTUR.md' \
     --exclude=fachkonzept --exclude='runtime-config.json' --exclude=.chos \
     "$TMP/" ./
   ```
   Prüfe die Liste: erwartet sind Basis-Dateien (z.B. `packages/fachverfahren-kit/src/...`), NICHT die generierten.

4. **Basis re-syncen — generierte Artefakte ERHALTEN** (gleiche Excludes, OHNE `--delete`):
   ```bash
   rsync -a \
     --exclude=node_modules --exclude=.git --exclude=dist --exclude=.turbo --exclude=.DS_Store \
     --exclude='leistung.config.ts' --exclude=modules \
     --exclude='FACHKONZEPT.md' --exclude='EPIC.md' --exclude='PRD.md' --exclude='ARCHITEKTUR.md' \
     --exclude=fachkonzept --exclude='runtime-config.json' --exclude=.chos \
     "$TMP/" ./
   rm -rf "$TMP"
   ```
   **ERHALTE** (nie überschreiben): die EINE Austausch-Naht `apps/*/src/leistung.config.ts`, das generierte
   `modules/<domain>/`, die Planungs-Artefakte (`FACHKONZEPT.md`/`EPIC.md`/`PRD.md`/`ARCHITEKTUR.md`/`docs/fachkonzept/`),
   die App-Identität (`runtime-config.json`) und den Laufzeit-Status (`.chos/`).

5. **Bis zur Ziel-Phase zurückrollen.** Phasen-Reihenfolge steht in `governance.yaml` (`phases[].id`). Entferne aus
   `.chos/project.json` `completed[]` alle Phasen **ab** der Ziel-Phase (z.B. `preview` bei reinem Render-Bruch;
   `fachkonzept` wenn nichts generiert wurde) und setze `status: "awaiting-prompt"`, `lastError: null`. Beispiel
   (Render-Bruch → ab `preview` neu, frühere Phasen behalten):
   ```bash
   node -e 'const f=".chos/project.json";const m=JSON.parse(require("fs").readFileSync(f));const y=require("js-yaml");const ph=y.load(require("fs").readFileSync("governance.yaml","utf8")).phases.map(p=>p.id);const from="preview";const keep=ph.slice(0,ph.indexOf(from));m.completed=(m.completed||[]).filter(c=>keep.includes(c));m.status="awaiting-prompt";m.lastError=null;require("fs").writeFileSync(f,JSON.stringify(m,null,2)+"\n");console.log("rollback ab",from,"→ completed:",m.completed)'
   ```

6. **Verifizieren + fortsetzen.** Build der App prüfen, dann den governten Build ab der Ziel-Phase weiterlaufen lassen
   (Resume „aus dem Chat"). Die `bundles-clean`-Probe muss jetzt GRÜN sein:
   ```bash
   npx vite build apps/fachverfahren   # EXIT 0, kein PARSE_ERROR
   ```

## Wann welche Ziel-Phase
- **Nur Render/Bundle-Bruch** (Config gut, Kit-Basis kaputt): zurück bis `preview` (oder `build`) — frühere
  Generierung bleibt, nur Verifikation/Vorschau läuft neu.
- **Generierung unvollständig/leer** (Phase produzierte kein Artefakt): zurück bis zur betroffenen Phase
  (z.B. `fachkonzept`) — sie wird mit der frischen Basis neu erbracht.

## Regeln
- Idempotent: mehrfaches Reanimieren ist sicher (kein `--delete`, generierte Artefakte bleiben).
- Niemals die generierte `leistung.config.ts`/`modules/<domain>` mit dem Template-Default überschreiben.
- Governance/Vorgaben/Grounding bleiben bindend — Reanimieren macht nur Basis + Weg frisch.
