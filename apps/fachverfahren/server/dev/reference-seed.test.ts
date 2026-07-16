// reference-seed.test — der DEV-Seed (nur In-Memory) legt NUR mit gesetztem APP_DEV_SEED_PASSWORD einen
// anmeldbaren Sachbearbeitungs-Account (role admin → caseworker-RBAC) an; das synthetische Demo-Dossier
// (Fall + Ziele/Schritte/Termine + Eröffnungs-Audit, Urheber ein FESTER synthetischer Akteur ≠ Login) wird
// immer geseedet. Idempotent (zweiter Lauf dupliziert/wirft nicht).
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
const SEED_AUDIT_ACTOR = "actor.dev-seed-opener";
// Passwort >= Mindestlänge (bootstrapWorkspace), rein synthetisch für den Test.
const TEST_PASSWORD = "test-seed-passwort-1234";

function freshStores() {
  return {
    authStore: new InMemoryAuthStore(),
    kanbanStore: new InMemoryKanbanStore(),
    caseStore: new InMemoryCaseStore(),
    taskStore: new InMemoryTaskStore(),
  };
}

describe("seedReferenceDemo (DEV/memory)", () => {
  it("legt mit APP_DEV_SEED_PASSWORD einen anmeldbaren Account (admin→caseworker) + ein Demo-Dossier an", async () => {
    const stores = freshStores();
    await seedReferenceDemo({
      ...stores,
      env: { APP_DEV_SEED_PASSWORD: TEST_PASSWORD },
    });

    // Anmeldbares Konto — role "admin", die der Session-Resolver auf caseworker (case.read/…) abbildet.
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

    // Verlauf: EIN Eröffnungs-Ereignis, zugeschrieben dem festen synthetischen Akteur (≠ Login-Konto),
    // damit der Vier-Augen-Abschluss vom Demo-Login ausübbar bleibt.
    const audit = await stores.caseStore.listAuditEvents({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.eventType).toBe("case.opened");
    expect(audit[0]?.actorId).toBe(SEED_AUDIT_ACTOR);
    expect(audit[0]?.actorId).not.toBe(users[0]?.actorId);

    // Ziele (2) + Schritte (5) + Termine (2); s.1/s.2 erledigt → Fortschritt ziel.1 = 2/4.
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

  it("ohne APP_DEV_SEED_PASSWORD: KEIN Login (kein committetes Secret), aber das Demo-Dossier wird geseedet", async () => {
    const stores = freshStores();
    await seedReferenceDemo({ ...stores, env: {} });

    // Kein anmeldbares Konto ohne bereitgestelltes Passwort.
    expect(await stores.authStore.countUsers({ tenantId: TENANT })).toBe(0);
    // Das Dossier existiert trotzdem (unabhängig vom Login).
    const found = await stores.caseStore.getCase({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(found?.state).toBe("aktiv");
    const audit = await stores.caseStore.listAuditEvents({
      tenantId: TENANT,
      caseId: DEMO_CASE_ID,
    });
    expect(audit[0]?.actorId).toBe(SEED_AUDIT_ACTOR);
  });

  it("ist idempotent (zweiter Lauf wirft nicht und dupliziert nicht)", async () => {
    const stores = freshStores();
    const deps = { ...stores, env: { APP_DEV_SEED_PASSWORD: TEST_PASSWORD } };
    await seedReferenceDemo(deps);
    await seedReferenceDemo(deps);

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

  it("REFERENCE_PROCEDURE: wiederaufnehmbar + Vier-Augen-Abschluss (schließt den Fall)", () => {
    const actions = REFERENCE_PROCEDURE.allowedTransitions;
    const abschluss = actions.find((t) => t.action === "abschließen");
    expect(abschluss?.requiresFourEyes).toBe(true);
    expect(abschluss?.closesCase).toBe(true); // stempelt closedAt
    const wieder = actions.find((t) => t.action === "wiederaufnehmen");
    expect(wieder?.from).toBe("abgeschlossen");
    expect(wieder?.to).toBe("aktiv");
  });
});
