// fachverfahren-kit/lib/http-mappers — die REINEN Server↔Client-Abbildungen für den HTTP-WorkspacePort (PROD).
//
// Die Domain-API liefert die Management-Daten in ihrer eigenen (snake-nahen, server-seitigen) Form. Diese reinen,
// deterministisch testbaren Funktionen bilden sie auf die verfahrens-neutralen Kit-Typen (`Aufgabe`, `InboxItem`) ab.
// Ausgelagert, weil das Mapping die intrikateste Fehlerquelle des HTTP-Ports ist (Server-`caseId` ↔ Client-`vorgangId`,
// exactOptionalPropertyTypes: fehlende Werte werden WEGGELASSEN, nie als `undefined` gesetzt). Kein Netz, kein React.
import type {
  Aufgabe,
  AufgabeAktivitaet,
  AufgabeBeziehung,
  AufgabeKommentar,
  BeziehungsTyp,
  InboxItem,
  Prioritaet,
  TriageStatus,
  Vorgang,
} from "../types.js";

/** Die Aufgaben-Repräsentation, wie die Domain-API sie liefert (`GET /api/tasks`, `PATCH /api/tasks/:id` → `{ task }`). */
export interface AppTaskDTO {
  taskId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  procedureId: string | null;
  caseId: string | null;
  title: string;
  priorityKey: string | null;
  assigneeActorId: string | null;
  labels: string[];
  dueAt: string | null;
  sortRank: string;
  parentTaskId?: string | null;
  boardColumn: string | null;
  version: number;
}

/** Der Inbox-Eingang, wie die Domain-API ihn liefert (`GET /api/inbox` → `{ items }`). */
export interface AppIntakeDTO {
  intakeId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  procedureId: string;
  source: InboxItem["quelle"];
  triageStatus: TriageStatus;
  subject: string | null;
  rawData: Record<string, unknown>;
  taskId: string | null;
  caseId: string | null;
  receivedAt: string;
}

/** Server-Aufgabe → Kit-`Aufgabe`. `caseId` ist der fachliche Vorgang (Client: `vorgangId`); fehlt ein optionaler
 *  Wert, wird das Feld WEGGELASSEN (exactOptionalPropertyTypes). Eine Aufgabe ohne `procedureId` ist verfahrens-frei. */
export function aufgabeVonAppTask(t: AppTaskDTO): Aufgabe {
  return {
    id: t.taskId,
    ...(t.caseId ? { vorgangId: t.caseId } : {}),
    ...(t.procedureId ? { procedureId: t.procedureId } : {}),
    tenantId: t.tenantId,
    authorityId: t.authorityId,
    jurisdictionId: t.jurisdictionId,
    titel: t.title,
    ...(t.priorityKey ? { prioritaet: t.priorityKey as Prioritaet } : {}),
    ...(t.assigneeActorId ? { zugewiesenAn: t.assigneeActorId } : {}),
    labels: t.labels ?? [],
    ...(t.dueAt ? { faelligIso: t.dueAt } : {}),
    sortRank: t.sortRank,
    ...(t.parentTaskId ? { parentAufgabeId: t.parentTaskId } : {}),
    ...(t.boardColumn ? { boardSpalte: t.boardColumn } : {}),
    version: t.version,
  };
}

/** Der Fall, wie die Domain-API ihn liefert (`GET /api/cases` → `{ cases }`, `POST …/transitions` → `{ case }`). */
export interface AppCaseDTO {
  caseId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  procedureId: string;
  procedureVersion: string;
  state: string;
  version: number;
  subjectIds: string[];
  openedAt: string;
  closedAt: string | null;
}

/** Interner Vermerk, wie die Domain-API ihn liefert (`GET /api/tasks/:id/comments` → `{ comments }`). */
export interface AppTaskCommentDTO {
  commentId: string;
  taskId: string;
  authorActorId: string;
  body: string;
  createdAt: string;
}

/** Aktivitäts-Eintrag, wie die Domain-API ihn liefert (`GET /api/tasks/:id/activity` → `{ activity }`). */
export interface AppTaskActivityDTO {
  activityId: string;
  taskId: string;
  actorId: string;
  activityType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/** Aufgaben-Beziehung, wie die Domain-API sie liefert (`GET /api/tasks/:id/relations` → `{ relations }`). */
export interface AppTaskRelationDTO {
  relationId: string;
  taskId: string;
  relatedTaskId: string;
  relationType: BeziehungsTyp;
  createdAt: string;
}

/** Server-Fall → Kit-`Vorgang` — eine STATUS-Projektion: `state`→`status`, `version` bleibt (für Optimistic-Locking
 *  beim Übergang). Die API liefert KEINE Antragsdaten am Fall (die stecken im Wurzel-Audit `payload.rohdaten`), daher
 *  ist `antragsdaten` leer. Das genügt der verfahrensübergreifenden Liste/Board (`portFor().get().status`); die
 *  vertiefte Vorgangs-/Prüfsicht (ReviewWorkspace) über HTTP ist ein Folgeschritt, sobald die API die Antragsdaten
 *  strukturiert ausliefert. */
export function vorgangVonAppCase<T = Record<string, unknown>>(
  c: AppCaseDTO,
): Vorgang<T> {
  return {
    id: c.caseId,
    vorgangsnummer: c.caseId,
    eingangIso: c.openedAt,
    antragsdaten: {} as T,
    status: c.state,
    ki: { confidence: 0, flags: [] },
    nachweise: [],
    history: [],
  };
}

/** Server-Vermerk → Kit-`AufgabeKommentar`. */
export function kommentarVonApp(c: AppTaskCommentDTO): AufgabeKommentar {
  return {
    id: c.commentId,
    aufgabeId: c.taskId,
    autorAkteurId: c.authorActorId,
    text: c.body,
    erstelltIso: c.createdAt,
  };
}

/** Server-Aktivität → Kit-`AufgabeAktivitaet`. */
export function aktivitaetVonApp(a: AppTaskActivityDTO): AufgabeAktivitaet {
  return {
    id: a.activityId,
    aufgabeId: a.taskId,
    akteurId: a.actorId,
    typ: a.activityType,
    ...(a.payload ? { payload: a.payload } : {}),
    zeitpunktIso: a.occurredAt,
  };
}

/** Server-Beziehung → Kit-`AufgabeBeziehung`. */
export function beziehungVonApp(r: AppTaskRelationDTO): AufgabeBeziehung {
  return {
    id: r.relationId,
    aufgabeId: r.taskId,
    verknuepfteAufgabeId: r.relatedTaskId,
    typ: r.relationType,
    erstelltIso: r.createdAt,
  };
}

/** Server-Eingang → Kit-`InboxItem`. */
export function inboxVonAppIntake(i: AppIntakeDTO): InboxItem {
  return {
    id: i.intakeId,
    procedureId: i.procedureId,
    tenantId: i.tenantId,
    authorityId: i.authorityId,
    jurisdictionId: i.jurisdictionId,
    quelle: i.source,
    eingangIso: i.receivedAt,
    triageStatus: i.triageStatus,
    rohdaten: i.rawData ?? {},
    ...(i.subject ? { betreff: i.subject } : {}),
    ...(i.taskId ? { aufgabeId: i.taskId } : {}),
    ...(i.caseId ? { vorgangId: i.caseId } : {}),
  };
}
