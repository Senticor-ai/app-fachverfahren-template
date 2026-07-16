// reference-seed.test — der DEV-Seed (nur In-Memory) legt einen anmeldbaren Sachbearbeitungs-Account
// (role admin → caseworker-RBAC) UND ein synthetisches Demo-Dossier (Fall + Ziele/Schritte/Termine +
// Eröffnungs-Audit) an, und ist idempotent (zweiter Lauf dupliziert/wirft nicht).
import { describe, expect, it } from "vitest";
import {
  InMemoryAuthStore,
  InMemoryCaseStore,
  InMemoryKanbanStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import { REFERENCE_PROCEDURE, seedReferenceDemo } from "./reference-seed.js";

const TENANT = "default";
const DEMO_CASE_ID = "case.demo-igm-0001";

function freshStores() {
  return {
    authStore: new InMemoryAuthStore(),
    kanbanStore: new InMemoryKanbanStore(),
    caseStore: new InMemoryCaseStore(),
    taskStore: new InMemoryTaskStore(),
  };
}

describe("seedReferenceDemo (DEV/memory)", () => {
  it("legt einen anmeldbaren Account (admin→caseworker) + ein Demo-Dossier an", async () => {
    const stores = freshStores();
    await seedReferenceDemo(stores);

    // Anmeldbares Konto — bootstrapWorkspace vergibt role "admin", die der Session-Resolver auf die
    // caseworker-RBAC-Rolle (case.read/case.decision.prepare) abbildet.
    expect(await stores.authStore.countUsers({ tenantId: TENANT })).toBe(1);
    const users = await stores.authStore.listUsers({ tenantId: TENANT });
    expect(users[0]?.role).toBe("admin");

    // Fall: aktiv (nicht abgeschlossen, damit Übergänge inkl. Vier-Augen-Abschluss ausprobierbar sind).
    const found = await stores.caseStore.getCase({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(found?.state).toBe("aktiv");
    expect(found?.procedureId).toBe("integrationsmanagement");
    expect(found?.procedureVersion).toBe(REFERENCE_PROCEDURE.version);
    expect(found?.authorityId).toBe("default");

    // Verlauf: genau ein append-only Eröffnungs-Ereignis.
    const audit = await stores.caseStore.listAuditEvents({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.eventType).toBe("case.opened");
    expect(audit[0]?.legalBasisId).toBe(REFERENCE_PROCEDURE.legalBasisIds[0]);

    // Ziele (2) + Schritte (5) + Termine (2). Schritt s.1/s.2 erledigt → Fortschritt ziel.1 = 2/4.
    const tasks = await stores.taskStore.listTasks({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(tasks.filter((t) => t.taskKind === "ziel")).toHaveLength(2);
    expect(tasks.filter((t) => t.taskKind === "checkliste-item")).toHaveLength(
      5,
    );
    expect(tasks.filter((t) => t.taskKind === "termin")).toHaveLength(2);
    const erledigt = tasks.filter(
      (t) => t.parentTaskId === "ziel.1" && t.data["erledigt"] === true,
    );
    expect(erledigt).toHaveLength(2);
  });

  it("ist idempotent (zweiter Lauf wirft nicht und dupliziert nicht)", async () => {
    const stores = freshStores();
    await seedReferenceDemo(stores);
    await seedReferenceDemo(stores);

    expect(await stores.authStore.countUsers({ tenantId: TENANT })).toBe(1);
    const tasks = await stores.taskStore.listTasks({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(tasks.filter((t) => t.taskKind === "ziel")).toHaveLength(2);
    const audit = await stores.caseStore.listAuditEvents({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(audit).toHaveLength(1);
  });

  it("REFERENCE_PROCEDURE: wiederaufnehmbar + Vier-Augen-Abschluss", () => {
    const actions = REFERENCE_PROCEDURE.allowedTransitions;
    // Abschluss ist Vier-Augen-pflichtig.
    const abschluss = actions.find((t) => t.action === "abschließen");
    expect(abschluss?.requiresFourEyes).toBe(true);
    // Wiederaufnahme aus dem Endzustand zurück in die Bearbeitung.
    const wieder = actions.find((t) => t.action === "wiederaufnehmen");
    expect(wieder?.from).toBe("abgeschlossen");
    expect(wieder?.to).toBe("aktiv");
  });
});
