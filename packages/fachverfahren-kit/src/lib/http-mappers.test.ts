import { describe, expect, it } from "vitest";
import {
  aktivitaetVonApp,
  aufgabeVonAppTask,
  beziehungVonApp,
  inboxVonAppIntake,
  kommentarVonApp,
  vorgangVonAppCase,
  type AppCaseDTO,
  type AppIntakeDTO,
  type AppTaskActivityDTO,
  type AppTaskCommentDTO,
  type AppTaskDTO,
  type AppTaskRelationDTO,
} from "./http-mappers.js";

const vollTask: AppTaskDTO = {
  taskId: "task.1",
  tenantId: "t1",
  authorityId: "a1",
  jurisdictionId: "j1",
  procedureId: "musterantrag",
  caseId: "case.1",
  title: "Vorgang X",
  priorityKey: "hoch",
  assigneeActorId: "sb.eins",
  labels: ["eilt"],
  dueAt: "2026-07-20T10:00:00.000Z",
  sortRank: "V",
  parentTaskId: "task.0",
  boardColumn: "in_pruefung",
  version: 3,
};

describe("aufgabeVonAppTask", () => {
  it("bildet alle Felder ab (caseId→vorgangId, title→titel, priorityKey→prioritaet)", () => {
    const a = aufgabeVonAppTask(vollTask);
    expect(a).toEqual({
      id: "task.1",
      vorgangId: "case.1",
      procedureId: "musterantrag",
      tenantId: "t1",
      authorityId: "a1",
      jurisdictionId: "j1",
      titel: "Vorgang X",
      prioritaet: "hoch",
      zugewiesenAn: "sb.eins",
      labels: ["eilt"],
      faelligIso: "2026-07-20T10:00:00.000Z",
      sortRank: "V",
      parentAufgabeId: "task.0",
      boardSpalte: "in_pruefung",
      version: 3,
    });
  });

  it("LÄSST optionale Felder WEG, wenn der Server null/leer liefert (exactOptionalPropertyTypes)", () => {
    const a = aufgabeVonAppTask({
      ...vollTask,
      caseId: null,
      procedureId: null,
      priorityKey: null,
      assigneeActorId: null,
      dueAt: null,
      parentTaskId: null,
      boardColumn: null,
    });
    // Die weggelassenen Schlüssel dürfen NICHT als `undefined`-Property auftauchen.
    expect(Object.keys(a).sort()).toEqual(
      [
        "authorityId",
        "id",
        "jurisdictionId",
        "labels",
        "sortRank",
        "tenantId",
        "titel",
        "version",
      ].sort(),
    );
    expect("vorgangId" in a).toBe(false);
    expect("procedureId" in a).toBe(false);
    expect("prioritaet" in a).toBe(false);
  });

  it("behandelt fehlendes parentTaskId (undefined) wie null — kein parentAufgabeId", () => {
    const ohneParent: AppTaskDTO = { ...vollTask };
    delete (ohneParent as { parentTaskId?: unknown }).parentTaskId;
    const a = aufgabeVonAppTask(ohneParent);
    expect("parentAufgabeId" in a).toBe(false);
  });
});

describe("inboxVonAppIntake", () => {
  const voll: AppIntakeDTO = {
    intakeId: "intake.1",
    tenantId: "t1",
    authorityId: "a1",
    jurisdictionId: "j1",
    procedureId: "musterantrag",
    source: "antrag",
    triageStatus: "pending",
    subject: "Neuer Antrag",
    rawData: { name: "Muster" },
    taskId: "task.9",
    caseId: "case.9",
    receivedAt: "2026-07-09T08:00:00.000Z",
  };

  it("bildet source→quelle, receivedAt→eingangIso, rawData→rohdaten ab", () => {
    expect(inboxVonAppIntake(voll)).toEqual({
      id: "intake.1",
      procedureId: "musterantrag",
      tenantId: "t1",
      authorityId: "a1",
      jurisdictionId: "j1",
      quelle: "antrag",
      eingangIso: "2026-07-09T08:00:00.000Z",
      triageStatus: "pending",
      rohdaten: { name: "Muster" },
      betreff: "Neuer Antrag",
      aufgabeId: "task.9",
      vorgangId: "case.9",
    });
  });

  it("lässt betreff/aufgabeId/vorgangId weg, wenn null", () => {
    const i = inboxVonAppIntake({
      ...voll,
      subject: null,
      taskId: null,
      caseId: null,
    });
    expect("betreff" in i).toBe(false);
    expect("aufgabeId" in i).toBe(false);
    expect("vorgangId" in i).toBe(false);
  });
});

describe("vorgangVonAppCase", () => {
  const c: AppCaseDTO = {
    caseId: "case.1",
    tenantId: "t1",
    authorityId: "a1",
    jurisdictionId: "j1",
    procedureId: "musterantrag",
    procedureVersion: "1",
    state: "in_pruefung",
    version: 2,
    subjectIds: [],
    openedAt: "2026-07-09T08:00:00.000Z",
    closedAt: null,
  };

  it("optionale antragsdaten werden übernommen (Detail-Load), sonst leer", () => {
    expect(vorgangVonAppCase(c).antragsdaten).toEqual({});
    expect(
      vorgangVonAppCase(c, { antragsteller: { name: "Muster" } }).antragsdaten,
    ).toEqual({ antragsteller: { name: "Muster" } });
  });

  it("projiziert state→status und behält version (für Optimistic-Locking beim Übergang)", () => {
    const v = vorgangVonAppCase(c);
    expect(v.id).toBe("case.1");
    expect(v.status).toBe("in_pruefung");
    expect(v.eingangIso).toBe("2026-07-09T08:00:00.000Z");
    expect(v.antragsdaten).toEqual({});
    expect(v.ki).toEqual({ confidence: 0, flags: [] });
    expect(v.nachweise).toEqual([]);
    expect(v.history).toEqual([]);
  });
});

describe("Detail-Mapper", () => {
  it("kommentarVonApp: commentId→id, body→text, authorActorId→autorAkteurId", () => {
    const dto: AppTaskCommentDTO = {
      commentId: "comment.1",
      taskId: "task.1",
      authorActorId: "sb.eins",
      body: "Vermerk",
      createdAt: "2026-07-09T09:00:00.000Z",
    };
    expect(kommentarVonApp(dto)).toEqual({
      id: "comment.1",
      aufgabeId: "task.1",
      autorAkteurId: "sb.eins",
      text: "Vermerk",
      erstelltIso: "2026-07-09T09:00:00.000Z",
    });
  });

  it("aktivitaetVonApp: activityType→typ, payload durchgereicht", () => {
    const dto: AppTaskActivityDTO = {
      activityId: "activity.1",
      taskId: "task.1",
      actorId: "sb.eins",
      activityType: "task.commented",
      payload: { commentId: "comment.1" },
      occurredAt: "2026-07-09T09:00:00.000Z",
    };
    expect(aktivitaetVonApp(dto)).toEqual({
      id: "activity.1",
      aufgabeId: "task.1",
      akteurId: "sb.eins",
      typ: "task.commented",
      payload: { commentId: "comment.1" },
      zeitpunktIso: "2026-07-09T09:00:00.000Z",
    });
  });

  it("beziehungVonApp: relationType→typ, relatedTaskId→verknuepfteAufgabeId", () => {
    const dto: AppTaskRelationDTO = {
      relationId: "relation.1",
      taskId: "task.1",
      relatedTaskId: "task.2",
      relationType: "blocks",
      createdAt: "2026-07-09T09:00:00.000Z",
    };
    expect(beziehungVonApp(dto)).toEqual({
      id: "relation.1",
      aufgabeId: "task.1",
      verknuepfteAufgabeId: "task.2",
      typ: "blocks",
      erstelltIso: "2026-07-09T09:00:00.000Z",
    });
  });
});
