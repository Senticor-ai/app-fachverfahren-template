import { describe, it, expect, beforeAll } from "vitest";
import {
  type AppAuditEvent,
  type AppCase,
  type CaseStore,
  InMemoryCaseStore,
  PostgresCaseStore,
} from "./case-store.js";
import {
  type AppTask,
  type AppTaskActivity,
  type AppTaskComment,
  type TaskStore,
  InMemoryTaskStore,
  PostgresTaskStore,
} from "./task-store.js";

// integrai-Dossier VON HAND (Dual-Mode Phase 1.5) — der MODELLIERUNGS-BEWEIS: das DOSSIER-Fachverfahren
// (Klient:innen-Akte + Integrationsziele + geordnete Checkliste + Notizen + Termine, siehe integrai-slice1) ist
// VOLLSTAENDIG ueber die BESTEHENDEN Traeger abbildbar — OHNE ein `SubCollectionDef`-Framework (Rule of Three):
//   • Akte            = app_cases (caseKind 'dossier', data = Stammfelder), Mutation via patchCaseDataWithAudit
//   • Integrationsziel = app_tasks (taskKind 'ziel', caseId → Akte, data = Kategorie/Zieltermin/Status)
//   • Checkliste-Item  = app_tasks (taskKind 'checkliste-item', parentTaskId → Ziel, data = { erledigt, position })
//   • Notiz            = app_task_comments (append-only, chronologisch)
//   • Termin/Frist     = app_tasks.dueAt (Termine = das bestehende Frist-Feld)
//   • Fortschritt %    = compute-on-read (hier im Test projiziert; Phase 3 macht daraus eine dedizierte Aggregat-
//                        Methode) — NIE redundant persistiert.
// Jede `data`-Mutation laeuft ueber den auditierten DossierPort → hinterlaesst ein append-only-Protokoll. Laeuft
// gegen InMemory (immer) UND Postgres (skipIf), damit die PROD-Laufzeit den Beweis mit-traegt.

const uid = () => globalThis.crypto.randomUUID();
const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];

const T = "t-integrai";
const B = "amt-teilhabe";
const J = "de";
const P = "integrai-fallmanagement";

const impls: {
  name: string;
  make: () => { cases: CaseStore; tasks: TaskStore };
  enabled: boolean;
}[] = [
  {
    name: "InMemory",
    make: () => {
      const cases = new InMemoryCaseStore();
      const tasks = new InMemoryTaskStore({
        caseStore: cases,
        now: () => "2026-06-02T00:00:00.000Z",
      });
      return { cases, tasks };
    },
    enabled: true,
  },
  {
    name: "Postgres",
    make: () => ({
      cases: new PostgresCaseStore(pgUrl!),
      tasks: new PostgresTaskStore(pgUrl!),
    }),
    enabled: Boolean(pgUrl),
  },
];

function macheAkte(over: Partial<AppCase> = {}): AppCase {
  return {
    caseId: `akte-${uid()}`,
    tenantId: T,
    authorityId: B,
    jurisdictionId: J,
    procedureId: P,
    procedureVersion: "1",
    state: "aktiv",
    version: 1,
    subjectIds: [],
    openedAt: "2026-01-05T00:00:00.000Z",
    closedAt: null,
    caseKind: "dossier",
    data: {},
    ...over,
  };
}

function macheTask(over: Partial<AppTask> = {}): AppTask {
  return {
    taskId: `task-${uid()}`,
    tenantId: T,
    authorityId: B,
    jurisdictionId: J,
    procedureId: P,
    caseId: null,
    title: "Aufgabe",
    priorityKey: null,
    assigneeActorId: null,
    labels: [],
    dueAt: null,
    sortRank: "V",
    parentTaskId: null,
    boardColumn: null,
    version: 1,
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    taskKind: "aufgabe",
    data: {},
    ...over,
  };
}

function macheAudit(
  caseId: string,
  eventType: string,
  over: Partial<AppAuditEvent> = {},
): AppAuditEvent {
  return {
    auditEventId: `audit-${uid()}`,
    caseId,
    tenantId: T,
    authorityId: B,
    jurisdictionId: J,
    actorId: "sb.beraterin",
    eventType,
    purpose: "case-management",
    legalBasisId: "§ SGB IX",
    requestId: `req-${uid()}`,
    payload: {},
    occurredAt: "2026-06-02T00:00:00.000Z",
    ...over,
  };
}

function macheActivity(
  taskId: string,
  activityType: string,
  over: Partial<AppTaskActivity> = {},
): AppTaskActivity {
  return {
    activityId: `act-${uid()}`,
    taskId,
    tenantId: T,
    authorityId: B,
    actorId: "sb.beraterin",
    activityType,
    payload: {},
    occurredAt: "2026-06-02T00:00:00.000Z",
    ...over,
  };
}

function macheNotiz(
  taskId: string,
  body: string,
  over: Partial<AppTaskComment> = {},
): AppTaskComment {
  return {
    commentId: `note-${uid()}`,
    taskId,
    tenantId: T,
    authorityId: B,
    authorActorId: "sb.beraterin",
    body,
    createdAt: "2026-06-02T00:00:00.000Z",
    ...over,
  };
}

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `integrai-Dossier VON HAND — ${impl.name}`,
    () => {
      let cases: CaseStore;
      let tasks: TaskStore;
      beforeAll(() => {
        const s = impl.make();
        cases = s.cases;
        tasks = s.tasks;
      });

      it("modelliert Klient-Akte + Ziele + Checkliste + Notizen + Termine ueber bestehende Traeger; jede data-Mutation ist auditiert", async () => {
        // ── 1) Klient:innen-Akte anlegen (Dossier-Fall mit Stammfeldern in case.data) ──
        const akte = macheAkte({
          data: {
            name: "Amina Youssef",
            geburtsdatum: "1990-04-12",
            stufe: "Orientierung",
            sprachen: ["ar", "en"],
          },
        });
        await cases.insertCase(akte);

        // ── 2) Akte fortschreiben via DossierPort (Stufe wechselt) — auditiert, OHNE Statuswechsel ──
        const nachStufe = await cases.patchCaseDataWithAudit({
          tenantId: T,
          caseId: akte.caseId,
          expectedVersion: 1,
          dataPatch: { stufe: "Integration" },
          auditEvent: macheAudit(akte.caseId, "dossier.stufe.geaendert", {
            payload: { von: "Orientierung", nach: "Integration" },
          }),
        });
        expect(nachStufe.data).toMatchObject({
          name: "Amina Youssef",
          stufe: "Integration",
        });
        expect(nachStufe.state).toBe("aktiv"); // Akte lebt fort, kein Statuswechsel
        expect(nachStufe.version).toBe(2);

        // ── 3) Integrationsziel als Task (taskKind 'ziel', caseId → Akte) ──
        const ziel = macheTask({
          caseId: akte.caseId,
          taskKind: "ziel",
          title: "Deutschkurs B1 abschliessen",
          dueAt: "2026-12-01T00:00:00.000Z", // Termin/Frist = bestehendes dueAt-Feld
          data: { kategorie: "Sprache", status: "offen" },
        });
        await tasks.insertTask(ziel);

        // ── 4) Geordnete Checkliste als Sub-Tasks (parentTaskId → Ziel, taskKind 'checkliste-item') ──
        const checkliste = [
          macheTask({
            caseId: akte.caseId,
            parentTaskId: ziel.taskId,
            taskKind: "checkliste-item",
            title: "Kurs A2 bestanden",
            sortRank: "a",
            data: { erledigt: false, position: 0 },
          }),
          macheTask({
            caseId: akte.caseId,
            parentTaskId: ziel.taskId,
            taskKind: "checkliste-item",
            title: "Kurs B1 begonnen",
            sortRank: "b",
            data: { erledigt: false, position: 1 },
          }),
          macheTask({
            caseId: akte.caseId,
            parentTaskId: ziel.taskId,
            taskKind: "checkliste-item",
            title: "B1-Pruefung angemeldet",
            sortRank: "c",
            data: { erledigt: false, position: 2 },
          }),
        ];
        for (const item of checkliste) await tasks.insertTask(item);

        // ── 5) Zwei Checkliste-Items abhaken via DossierPort — jede data-Mutation hinterlaesst eine Aktivitaet ──
        for (const item of checkliste.slice(0, 2)) {
          await tasks.patchTaskDataWithActivity({
            tenantId: T,
            taskId: item.taskId,
            expectedVersion: 1,
            dataPatch: { erledigt: true },
            activity: macheActivity(item.taskId, "checkliste.item.erledigt"),
          });
        }

        // ── 6) Notiz an der Akte-Wurzel (chronologisch, append-only) ──
        await tasks.insertTaskComment(
          macheNotiz(
            ziel.taskId,
            "Klientin sehr motiviert; B1 realistisch bis Q4.",
          ),
        );

        // ═══ VERIFIKATION ═══
        // Akte-Mutation ist im Audit-Protokoll (revisionssicher).
        const auditProtokoll = await cases.listAuditEvents({
          tenantId: T,
          caseId: akte.caseId,
        });
        expect(
          auditProtokoll.some((e) => e.eventType === "dossier.stufe.geaendert"),
        ).toBe(true);

        // Checkliste liest sich als geordnete Sub-Sammlung des Ziels zurueck; Fortschritt ist COMPUTE-ON-READ.
        const alleTasks = await tasks.listTasks({
          tenantId: T,
          authorityId: B,
          procedureId: P,
        });
        const items = alleTasks
          .filter(
            (t) =>
              t.parentTaskId === ziel.taskId &&
              t.taskKind === "checkliste-item",
          )
          .sort((a, b) => a.sortRank.localeCompare(b.sortRank));
        expect(items).toHaveLength(3);
        // Fortschritt % NICHT persistiert, sondern via dedizierter compute-on-read-Aggregation (Phase 3a) projiziert
        // — LIMIT-frei, NIE ueber listTasks (das bei 200 kappt).
        const [fortschritt] = await tasks.aggregateChildFlag({
          tenantId: T,
          parentTaskIds: [ziel.taskId],
          taskKind: "checkliste-item",
          flagKey: "erledigt",
        });
        expect(fortschritt).toEqual({
          parentTaskId: ziel.taskId,
          total: 3,
          gesetzt: 2,
        });
        expect(
          Math.round((fortschritt!.gesetzt / fortschritt!.total) * 100),
        ).toBe(67);

        // Jede abgehakte Position traegt ihr Aktivitaets-Protokoll.
        for (const item of checkliste.slice(0, 2)) {
          const akt = await tasks.listTaskActivity({
            tenantId: T,
            taskId: item.taskId,
          });
          expect(
            akt.some((a) => a.activityType === "checkliste.item.erledigt"),
          ).toBe(true);
          const g = await tasks.getTask({ tenantId: T, taskId: item.taskId });
          expect(g?.data?.["erledigt"]).toBe(true);
        }

        // Notiz + Termin liegen an ihren Traegern.
        const notizen = await tasks.listTaskComments({
          tenantId: T,
          taskId: ziel.taskId,
        });
        expect(notizen).toHaveLength(1);
        const zielGelesen = await tasks.getTask({
          tenantId: T,
          taskId: ziel.taskId,
        });
        expect(zielGelesen?.dueAt).toBe("2026-12-01T00:00:00.000Z");
        expect(zielGelesen?.taskKind).toBe("ziel");
        expect(zielGelesen?.data).toMatchObject({ kategorie: "Sprache" });

        // Die Dossier-Ansicht listet die Ziele GENAU DIESER Akte ueber den caseId+taskKind-Filter — hier 1 Ziel,
        // die Checkliste-Items bleiben aussen vor.
        const zieleDerAkte = await tasks.listTasks({
          tenantId: T,
          authorityId: B,
          caseId: akte.caseId,
          taskKind: "ziel",
        });
        expect(zieleDerAkte.map((z) => z.taskId)).toEqual([ziel.taskId]);
      });
    },
  );
}
