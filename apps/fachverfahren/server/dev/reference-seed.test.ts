// reference-seed.test — der generische DEV-Seed-Motor liest Verfahren + Demo-Dossier AUS der procedure.config-
// Naht (verfahrens-neutral) und legt NUR mit gesetztem APP_DEV_SEED_PASSWORD einen anmeldbaren Account an; das
// Demo-Dossier (Urheber ein FESTER synthetischer Akteur ≠ Login) wird immer geseedet. Idempotent.
import { describe, expect, it } from "vitest";
import {
  InMemoryAuthStore,
  InMemoryCaseStore,
  InMemoryKanbanStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import { dossierDemo, dossierProcedure } from "../procedure.config.js";
import { seedReferenceDemo } from "./reference-seed.js";

const TENANT = "default";
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

describe("seedReferenceDemo (DEV/memory, aus der procedure.config-Naht)", () => {
  it("legt mit APP_DEV_SEED_PASSWORD einen anmeldbaren Account (admin→caseworker) + das Demo-Dossier an", async () => {
    const stores = freshStores();
    await seedReferenceDemo({
      ...stores,
      env: { APP_DEV_SEED_PASSWORD: TEST_PASSWORD },
    });

    // Anmeldbares Konto — role "admin", die der Session-Resolver auf caseworker (case.read/…) abbildet.
    expect(await stores.authStore.countUsers({ tenantId: TENANT })).toBe(1);
    const users = await stores.authStore.listUsers({ tenantId: TENANT });
    expect(users[0]?.role).toBe("admin");

    // Fall: aus der Naht (procedureId/version/initialState) — NICHT hier eingebrannt.
    const found = await stores.caseStore.getCase({
      tenantId: TENANT,
      caseId: dossierDemo.caseId,
    });
    expect(found?.state).toBe(dossierDemo.initialState);
    expect(found?.procedureId).toBe(dossierProcedure.procedureId);
    expect(found?.procedureVersion).toBe(dossierProcedure.version);

    // Verlauf: EIN Eröffnungs-Ereignis, Rechtsgrundlage aus dem Verfahren, Akteur der feste synthetische
    // Eröffner (≠ Login-Konto), damit der Vier-Augen-Abschluss vom Demo-Login ausübbar bleibt.
    const audit = await stores.caseStore.listAuditEvents({
      tenantId: TENANT,
      caseId: dossierDemo.caseId,
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.eventType).toBe("case.opened");
    expect(audit[0]?.legalBasisId).toBe(dossierProcedure.legalBasisIds[0]);
    expect(audit[0]?.actorId).toBe(SEED_AUDIT_ACTOR);
    expect(audit[0]?.actorId).not.toBe(users[0]?.actorId);

    // Ziele/Schritte/Termine aus der Naht — Anzahl folgt dossierDemo.
    const tasks = await stores.taskStore.listTasks({
      tenantId: TENANT,
      caseId: dossierDemo.caseId,
    });
    const zieleCount = dossierDemo.ziele.length;
    const schritteCount = dossierDemo.ziele.reduce(
      (n, z) => n + z.schritte.length,
      0,
    );
    expect(tasks.filter((t) => t.taskKind === "ziel")).toHaveLength(zieleCount);
    expect(tasks.filter((t) => t.taskKind === "checkliste-item")).toHaveLength(
      schritteCount,
    );
    expect(tasks.filter((t) => t.taskKind === "termin")).toHaveLength(
      dossierDemo.termine.length,
    );
    // Erledigte Schritte des ersten Ziels stimmen mit der Naht überein.
    const erstesZiel = dossierDemo.ziele[0];
    if (erstesZiel === undefined)
      throw new Error("Demo-Dossier braucht mindestens ein Ziel");
    const erledigtErwartet = erstesZiel.schritte.filter(
      (s) => s.erledigt,
    ).length;
    const erledigtIst = tasks.filter(
      (t) => t.parentTaskId === erstesZiel.id && t.data["erledigt"] === true,
    );
    expect(erledigtIst).toHaveLength(erledigtErwartet);
  });

  it("ohne APP_DEV_SEED_PASSWORD: KEIN Login (kein committetes Secret), aber das Demo-Dossier wird geseedet", async () => {
    const stores = freshStores();
    await seedReferenceDemo({ ...stores, env: {} });

    expect(await stores.authStore.countUsers({ tenantId: TENANT })).toBe(0);
    const found = await stores.caseStore.getCase({
      tenantId: TENANT,
      caseId: dossierDemo.caseId,
    });
    expect(found?.state).toBe(dossierDemo.initialState);
    const audit = await stores.caseStore.listAuditEvents({
      tenantId: TENANT,
      caseId: dossierDemo.caseId,
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
      caseId: dossierDemo.caseId,
    });
    expect(tasks.filter((t) => t.taskKind === "ziel")).toHaveLength(
      dossierDemo.ziele.length,
    );
    const audit = await stores.caseStore.listAuditEvents({
      tenantId: TENANT,
      caseId: dossierDemo.caseId,
    });
    expect(audit).toHaveLength(1);
  });

  it("dossierProcedure (die Naht): wiederaufnehmbar + Vier-Augen-Abschluss (schließt den Fall)", () => {
    const actions = dossierProcedure.allowedTransitions;
    const abschluss = actions.find((t) => t.action === "abschließen");
    expect(abschluss?.requiresFourEyes).toBe(true);
    expect(abschluss?.closesCase).toBe(true); // stempelt closedAt
    // Der Startzustand des Demos liegt in der Zustandsmenge des Verfahrens.
    expect(dossierProcedure.allowedStates).toContain(dossierDemo.initialState);
    // Es gibt einen Übergang, der aus dem Endzustand zurück in die Bearbeitung führt (Wiederaufnahme).
    const abschlussZiel = abschluss?.to;
    const wieder = actions.find((t) => t.from === abschlussZiel);
    expect(wieder).toBeDefined();
  });
});
