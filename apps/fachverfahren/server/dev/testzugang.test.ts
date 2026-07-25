// testzugang.test — die Sperre ist der Kern: ein Testkonto darf im Produktivbetrieb weder ENTSTEHEN
// noch AUSGEWIESEN werden. Geprüft wird beides an derselben Quelle (EINE Wahrheit) und zusätzlich
// live am gebauten Server (die Route existiert in Produktion gar nicht).
import { describe, expect, it } from "vitest";
import {
  InMemoryAuthStore,
  InMemoryCaseStore,
  InMemoryKanbanStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import { seedReferenceDemo } from "./reference-seed.js";
import {
  seedPasswort,
  testzugangAnlageErlaubt,
  testzugangAusweis,
  TESTKONTEN,
  TESTKONTO_ADMIN,
} from "./testzugang.js";
import {
  TESTZUGANG_ROUTE,
  testzugangRouteErlaubt,
} from "./testzugang-route.js";

const PASSWORT = "test-seed-passwort-1234";
const DEV_ENV: NodeJS.ProcessEnv = {
  APP_STORE_MODE: "memory",
  APP_DEV_SEED_PASSWORD: PASSWORT,
};

function stores() {
  return {
    authStore: new InMemoryAuthStore(),
    kanbanStore: new InMemoryKanbanStore(),
    caseStore: new InMemoryCaseStore(),
    taskStore: new InMemoryTaskStore(),
  };
}

describe("testzugangAusweis — fail-closed", () => {
  it("weist im Entwicklungsstand die deklarierten Konten mit dem Umgebungs-Passwort aus", () => {
    const ausweis = testzugangAusweis(DEV_ENV);
    expect(ausweis.aktiv).toBe(true);
    if (!ausweis.aktiv) return;
    // Erstes Konto = das Workspace-Konto, danach die Deklaration in Reihenfolge.
    expect(ausweis.konten.map((k) => k.email)).toEqual([
      TESTKONTO_ADMIN.email,
      ...TESTKONTEN.map((k) => k.email),
    ]);
    for (const k of ausweis.konten) expect(k.passwort).toBe(PASSWORT);
    // Als TESTKONTO erkennbar — kein Konto, das echte Identität vortäuscht.
    expect(ausweis.hinweis).toContain("TESTKONTEN");
    expect(ausweis.hinweis).toContain("Produktivbetrieb");
  });

  it("PRODUKTIVBETRIEB: kein Ausweis und keine Anlage (NODE_ENV=production)", () => {
    const env = { ...DEV_ENV, NODE_ENV: "production" };
    const ausweis = testzugangAusweis(env);
    expect(ausweis.aktiv).toBe(false);
    if (ausweis.aktiv) return;
    expect(ausweis.grund).toBe("produktivbetrieb");
    expect(testzugangAnlageErlaubt(env)).toBe(false);
    // Und die Selbstauskunft wird dort erst gar nicht registriert.
    expect(testzugangRouteErlaubt(env)).toBe(false);
    expect(testzugangRouteErlaubt(DEV_ENV)).toBe(true);
  });

  it("ECHTE DATENHALTUNG: kein Ausweis ohne ephemeren Store", () => {
    const env = { ...DEV_ENV, APP_STORE_MODE: "postgres" };
    const ausweis = testzugangAusweis(env);
    expect(ausweis.aktiv).toBe(false);
    if (ausweis.aktiv) return;
    expect(ausweis.grund).toBe("kein-ephemerer-store");
    expect(testzugangAnlageErlaubt(env)).toBe(false);
  });

  it("KEIN COMMITTETES SECRET: ohne Passwort aus der Umgebung kein Ausweis", () => {
    const ausweis = testzugangAusweis({ APP_STORE_MODE: "memory" });
    expect(ausweis.aktiv).toBe(false);
    if (ausweis.aktiv) return;
    expect(ausweis.grund).toBe("kein-passwort");
    expect(seedPasswort({ APP_STORE_MODE: "memory" })).toBeUndefined();
  });

  it("übernimmt das Vorschau-Workspace-Konto aus AUTH_BOOTSTRAP_ADMIN_*", () => {
    const ausweis = testzugangAusweis({
      ...DEV_ENV,
      AUTH_BOOTSTRAP_ADMIN_EMAIL: "preview@chos.local",
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: "vorschau-passwort-1234",
      AUTH_BOOTSTRAP_ADMIN_NAME: "Vorschau",
    });
    expect(ausweis.aktiv).toBe(true);
    if (!ausweis.aktiv) return;
    const admin = ausweis.konten[0];
    expect(admin?.email).toBe("preview@chos.local");
    expect(admin?.passwort).toBe("vorschau-passwort-1234");
    expect(admin?.name).toBe("Vorschau");
  });
});

describe("Anlage folgt derselben Sperre wie der Ausweis", () => {
  it("legt im Entwicklungsstand genau die deklarierten Konten an", async () => {
    const s = stores();
    await seedReferenceDemo({ ...s, env: DEV_ENV });
    const users = await s.authStore.listUsers({ tenantId: "default" });
    expect(users.map((u) => u.email).sort()).toEqual(
      [TESTKONTO_ADMIN.email, ...TESTKONTEN.map((k) => k.email)].sort(),
    );
  });

  it("legt im PRODUKTIVBETRIEB kein einziges Konto an", async () => {
    const s = stores();
    await seedReferenceDemo({
      ...s,
      env: { ...DEV_ENV, NODE_ENV: "production" },
    });
    expect(await s.authStore.countUsers({ tenantId: "default" })).toBe(0);
  });

  it("legt ohne ephemeren Store kein einziges Konto an", async () => {
    const s = stores();
    await seedReferenceDemo({
      ...s,
      env: { ...DEV_ENV, APP_STORE_MODE: "postgres" },
    });
    expect(await s.authStore.countUsers({ tenantId: "default" })).toBe(0);
  });
});

describe("GET /dev/testzugang am gebauten Server", () => {
  it("antwortet im Entwicklungsstand mit dem Ausweis — in Produktion existiert die Route nicht", async () => {
    const { buildPublicServer } = await import("../index.js");
    const dev = buildPublicServer({ env: DEV_ENV });
    const antwort = await dev.inject({ method: "GET", url: TESTZUGANG_ROUTE });
    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({ aktiv: true });
    await dev.close();

    // In Produktion ist die Route GAR NICHT REGISTRIERT. Der Pfad läuft dann in den SPA-Fallback
    // (HTML, 200) — die entscheidende Zusicherung ist deshalb nicht der Status, sondern: es gibt
    // keine Route und es verlässt kein einziges Zugangsdatum den Prozess.
    const prod = buildPublicServer({
      env: { ...DEV_ENV, NODE_ENV: "production" },
    });
    await prod.ready();
    expect(prod.printRoutes()).not.toContain("testzugang");
    const gesperrt = await prod.inject({
      method: "GET",
      url: TESTZUGANG_ROUTE,
    });
    expect(gesperrt.headers["content-type"]).not.toContain("application/json");
    expect(gesperrt.body).not.toContain(PASSWORT);
    expect(gesperrt.body).not.toContain(TESTKONTEN[0]?.email ?? "buerger@");
    await prod.close();
  });
});
