---
name: dossier-fallmanagement
description: Build a long-lived Dossier / case-management procedure (accumulating subject file with goals, checklists, notes, appointments) from THIS template instead of a one-shot application, by flipping the single LeistungConfig.kind discriminator to "dossier" and modelling sub-collections onto the existing value-neutral carriers via the audited DossierPort.
---

# Dossier-Fallmanagement

Der Einstieg, wenn das freigegebene Fachkonzept KEIN Einmal-Antrag ist, sondern
eine LANGLEBIGE, akkumulierende Akte: eine Klient:innen-/Subjekt-Akte mit
Zielen, geordneten Checklisten, Notizen und Terminen, die über viele
Bearbeitungsschritte fortlebt (interne Sachbearbeitung, Case-Management). Für
automatisierte Build-Agenten wie für Entwickler:innen. Baut auf
`.agents/skills/fachverfahren-app/SKILL.md` auf — dieselbe EINE Naht, nur ein
zusätzliches Feld. Root-Policy und Pfad-Karte: `AGENTS.md`.

## Kernprinzip

Antrag/Vorgang-Verfahren und Dossier/Fall-Verfahren entstehen aus DEMSELBEN
Template über GENAU EINEN Diskriminator in der bekannten Naht
(`apps/fachverfahren/src/leistung.config.ts`):

```ts
kind?: "vorgang" | "dossier"; // in LeistungConfig — Default-Semantik "vorgang"
```

- `"vorgang"` (oder fehlend) = das heutige antrag-/vorgang-zentrierte Verfahren
  (Antrag → StatusMachine → Vier-Augen → Bescheid). Fehlt das Feld, ist der
  Vertrag BYTE-IDENTISCH zu bisher — reine Additivität.
- `"dossier"` = eine langlebige, akkumulierende Subjekt-/Fall-Akte mit
  Sub-Sammlungen an EINER Akte.

Der Store bleibt WERTNEUTRAL: dieselbe Vorgang-/Task-/Case-Zustandsmaschine +
append-only-Historie + Once-Only-Register trägt BEIDE Modi
(`packages/fachverfahren-kit/src/store.ts`, `createFachverfahrenStore` ist
config-gesteuert und modus-agnostisch). `kind` treibt lediglich die
Modell-Diskriminatoren `case_kind`/`task_kind` und später die UI-Komposition.
Es gibt KEIN `SubCollectionDef`-Framework (Rule of Three): eine Dossier-Struktur
wird auf die BESTEHENDEN Träger abgebildet, nicht mit einer zweiten,
präzedenzlosen Wahrheit überbaut.

## Wie ein Build-Agent (chos-code/gtc-builder) es nutzt

1. Die Naht `apps/fachverfahren/src/leistung.config.ts` wie in
   `fachverfahren-app` füllen (`id`/`label`/`kommune`, `rechtsgrundlagen`,
   `antrag.steps` = Stamm-/Ersterhebung der Akte, `statusMachine`,
   `register`, `detailSektionen`, `seed`) und dann den Modus setzen:

   ```ts
   kind: "dossier",
   ```

2. Die Sub-Sammlungen des Dossiers auf die BESTEHENDEN Träger modellieren
   (der Modellierungs-Beweis lebt in
   `packages/app-store-postgres/src/dossier-modeling.test.ts`):

   | Fachliches Element        | Träger                                    | Diskriminator / Feld                      |
   | ------------------------- | ----------------------------------------- | ----------------------------------------- |
   | Akte (Stammfelder)        | `app_cases`                               | `case_kind: "dossier"`, `data` = Nutzlast |
   | Sub-Eintrag (z. B. Ziel)  | `app_tasks`, `caseId` → Akte              | `task_kind: "<typ>"`, `data` = Nutzlast   |
   | Untereintrag (Checkliste) | `app_tasks`, `parentTaskId` → Sub-Eintrag | `task_kind: "<typ>"`, `data` = Nutzlast   |
   | Notiz                     | `app_task_comments` (append-only)         | chronologisch, nie editier-/löschbar      |
   | Termin / Frist            | `app_tasks.dueAt`                         | speist den `frist-erreicht`-Trigger       |
   | Fortschritt (%)           | compute-on-read                           | `aggregateChildFlag` — NIE persistiert    |

3. Die Sub-Sammlung EINER Akte über den `TaskStore` ziehen — die neuen,
   additiven Query-Felder `ListTasksQuery.caseId` (auf eine Akte einschränken)
   und `ListTasksQuery.taskKind` (auf einen Sub-Typ einschränken), z. B. „alle
   Ziele genau dieser Akte, ohne Checkliste-Items/Termine".

4. JEDE `data`-Mutation läuft über den auditierten DossierPort — nie direkt:
   - Akten-Stammfeld: `CaseStore.patchCaseDataWithAudit`
   - Sub-Eintrag: `TaskStore.patchTaskDataWithActivity`

   Beide patchen die `data`-Nutzlast (flacher jsonb-`||`-Merge auf oberster
   Ebene, NICHT ersetzen) UND schreiben in DERSELBEN Transaktion einen
   append-only-Audit-/Aktivitäts-Eintrag. Kern-Invariante: KEINE `data`-Mutation
   ohne Protokoll.

5. NACH jedem Naht-Write den Vertrags-Snapshot erzeugen und verifizieren:

   ```bash
   pnpm --filter @senticor/fachverfahren emit:contract
   pnpm run typecheck
   pnpm run test
   ```

## Vertrag & Leitplanken

Was der Vertrag ERZWINGT (Typen: `packages/fachverfahren-kit/src/types.ts`,
Ports: `packages/app-store-postgres/src/case-store.ts` +
`.../task-store.ts`):

- **Additiv & monoton.** `kind` fehlt ⇒ „vorgang", byte-identisches Verhalten.
  `caseKind`/`taskKind`/`data` fehlen beim Schreiben ⇒ der Store defaultet
  (`"vorgang"` / `"aufgabe"` / `{}`) — InMemory==Postgres-Parität. Eine
  bestehende `LeistungConfig` bleibt ohne Änderung gültig.
- **Der DossierPort ist die EINZIGE auditierte Naht für `data`-Mutationen.**
  Append-only: KEINE `data`-Mutation ohne Protokoll. Der Vor-Lade-Guard
  (`assertDossierAuditShape` / `assertDossierActivityShape`) läuft VOR jeder
  Mutation und ist FAIL-CLOSED: fehlt die Behörde (`missing-authority`) oder
  referenziert der begleitende Eintrag einen anderen Mandanten/Fall/Aufgabe
  (`case-mismatch` / `task-mismatch`), wirft er sofort (`DossierAuditInvalidError`
  / `DossierActivityInvalidError`, → HTTP 422). Die Behörden-Gleichheit gegen die
  geladene Aufgabe (`authority-mismatch` — NUR der Task-Pfad; das Audit-Event
  kennt diesen Grund nicht) wird erst NACH dem Laden geprüft, aber weiterhin VOR
  jedem Write — also fail-closed OHNE zu schreiben (Rollback-Parität
  InMemory==Postgres).
- **Optimistic-Locking.** `expectedVersion` erzwingt Konfliktprüfung; die
  Version steigt bei jedem Patch (Konflikt → `CaseVersionConflictError`, HTTP
  409).
- **Multi-Tenancy überall.** `tenant_id`/`authority_id`/`jurisdiction_id`
  scopen jeden Träger; in PROD kommt der Scope IMMER aus der Server-Session, nie
  vom Client.
- **Trennung Management ↔ Fachlichkeit.** Task und Case sind GETRENNTE
  Entitäten: ein Metadaten-/`data`-Patch löst NIE einen fachlichen
  Vier-Augen-Übergang aus. Zustandswechsel laufen ausschließlich über die
  guard-geprüfte `transitionCase`/`uebergang`-Kette (Rolle/Detail/Vier-Augen,
  server-autoritativ). HITL bleibt: die KI ist strukturell nie eines der zwei
  Augen.
- **Fortschritt = compute-on-read.** `aggregateChildFlag` aggregiert je
  Eltern-Aufgabe die Kinder eines `taskKind` (Gesamt + gesetztes `data`-Flag),
  LIMIT-frei — NIE über `listTasks` (das kappt) und NIE redundant persistiert.
- **Keine zweite Wahrheit.** Kein `SubCollectionDef`-Framework; die
  Dossier-Struktur ist vollständig auf `app_cases`/`app_tasks`/
  `app_task_comments`/`dueAt` abbildbar (Rule of Three).

## Gates & Verifikation

- **`pnpm run typecheck`** — der diskriminierte `LeistungConfig.kind` sowie die
  additiven `AppCase.caseKind`/`data` und `AppTask.taskKind`/`data`
  typechecken (strict/NodeNext); ein Modus-Fehler bricht hier.
- **`pnpm run test`** — enthält den tragenden
  `packages/app-store-postgres/src/dossier-modeling.test.ts`: den
  MODELLIERUNGS-BEWEIS, dass ein Dossier-Verfahren vollständig über die
  bestehenden Träger abbildbar ist und jede `data`-Mutation ein append-only-
  Protokoll hinterlässt. Läuft gegen InMemory (immer) UND Postgres
  (`skipIf` `APP_PG_URL`) — die PROD-Laufzeit trägt den Beweis mit.
- **`pnpm --filter @senticor/fachverfahren emit:contract` +
  `pnpm run check:leistung-contract`** — der Vertrags-Snapshot bleibt synchron
  (`emit:contract` NACH dem Naht-Write, nie davor); der fail-closed
  Prozess-/Governance-Graph wird mitgeprüft.
- **`pnpm run check:schema-invariants`** — die DB-seitige Append-only-Invariante
  der Audit-/Aktivitäts-Tabellen (REVOKE + Trigger) bleibt gewahrt.
- **`pnpm run test:migration`** — Store-Parität + Migrationen (InMemory vs.
  Postgres) für die Dual-Mode-Spalten.
- **`pnpm run check:docs-language`** — diese SKILL.md ist Deutsch mit Umlauten
  (ä/ö/ü/ß); die Frontmatter-Beschreibung ist die Discovery-Auswahl.
- **`pnpm run precommit:check`** vereint die relevanten Gates.

## Minimalbeispiel

GENERISCH — Platzhalter statt eines konkreten Verfahrens; der einzige Unterschied
zum Antrag-Modus ist `kind: "dossier"`:

```ts
// apps/fachverfahren/src/leistung.config.ts — DIESELBE Naht, EIN Feld schaltet den Modus:
export const leistung: LeistungConfig = {
  id: "<leistung-slug>",
  label: "<Anzeigename der Leistung>",
  kommune: "<Zuständige Stelle>",
  kind: "dossier", // ← der EINE Diskriminator: langlebige Akte statt Einmal-Antrag
  rechtsgrundlagen: [/* nur belegte Normen — sonst Annahme-DATEN-Konvention */],
  antrag: { steps: [/* Stamm-/Ersterhebung der Akte */] },
  statusMachine: {
    initial: "aufgenommen",
    states: [
      { key: "aufgenommen", label: "Aufgenommen", tone: "neu" },
      { key: "in-betreuung", label: "In Betreuung", tone: "info" },
      {
        key: "abgeschlossen",
        label: "Abgeschlossen",
        tone: "ok",
        terminal: true,
      },
    ],
    transitions: [/* rollen/vierAugen wie im vorgang-Modus */],
  },
  register: { suchfelder: [] },
  detailSektionen: [/* … */],
};
```

```ts
// Server-autoritativ: EINE Stammfeld-Änderung der Akte — NUR über den auditierten DossierPort:
await caseStore.patchCaseDataWithAudit({
  tenantId,
  caseId,
  expectedVersion: aktuelleVersion, // Optimistic-Locking
  dataPatch: { "<stammfeld>": "<wert>" }, // flacher jsonb-Merge, NICHT ersetzen
  auditEvent: {
    /* actorId, purpose, legalBasisId, requestId … */
    tenantId, // muss == caseStore-tenantId
    caseId, // muss == mutierte Akte (sonst case-mismatch → 422)
    authorityId, // Pflicht (sonst missing-authority → 422)
    /* jurisdictionId, eventType, payload, occurredAt … */
  } as AppAuditEvent,
});

// Ein Sub-Sammlungs-Eintrag (z. B. ein Ziel) = eine Aufgabe AN der Akte:
await taskStore.insertTask({
  tenantId,
  authorityId,
  jurisdictionId,
  procedureId,
  caseId, // → verknüpft mit der Akte
  taskKind: "<sub-typ>", // z. B. "ziel"
  data: {/* frei-formige Nutzlast des Eintrags */},
  /* title, sortRank, version, … */
} as AppTask);

// Genau die Ziele DIESER Akte listen — additive Query-Felder:
const ziele = await taskStore.listTasks({
  tenantId,
  authorityId,
  caseId,
  taskKind: "<sub-typ>",
});

// Fortschritt NIE persistieren — compute-on-read:
const fortschritt = await taskStore.aggregateChildFlag({
  tenantId,
  parentTaskIds: ziele.map((z) => z.taskId),
  taskKind: "<unter-typ>", // z. B. "checkliste-item"
  flagKey: "erledigt",
});
```
