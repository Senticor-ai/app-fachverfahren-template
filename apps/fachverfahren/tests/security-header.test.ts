// security-header.test.ts — DIE HEADER SIND AN DER ANTWORT, nicht in einer Absicht.
//
// ⛔ GEMESSEN 2026-09-07: dieser Server setzte KEINEN Sicherheits-Header. Der kuratierte Golden
// `arch:golden-security-header` verlangt sie REAL IM CODE, und die Verfassung fuehrt `security-headers`
// als `blocking: true, severity: hart-immer` — geprueft hat es nie jemand (die Regel steht bis heute in
// `UNGEDECKTE_SCHULD`). Gruen durch Abwesenheit eines Pruefers, ueber die gesamte Lebenszeit der Vorlage.
//
// Dieser Zeuge misst die WIRKUNG an einer echten Antwort — nicht die Registrierung des Hooks.
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import {
  HSTS_WERT,
  SICHERE_HEADER,
  registerSecurityHeaders,
} from "../server/security-header.js";

async function antwort(opts?: { https?: boolean }) {
  const app = Fastify(opts?.https ? { trustProxy: true } : {});
  registerSecurityHeaders(app);
  app.get("/x", async () => ({ ok: true }));
  // Auch der FEHLERPFAD muss sie tragen — eine 500 ist genauso einbettbar wie eine 200.
  app.get("/boom", async () => {
    throw new Error("absichtlich");
  });
  const r = await app.inject({
    method: "GET",
    url: "/x",
    ...(opts?.https ? { headers: { "x-forwarded-proto": "https" } } : {}),
  });
  const fehler = await app.inject({ method: "GET", url: "/boom" });
  await app.close();
  return { r, fehler };
}

describe("Sicherheits-Header — an der Antwort gemessen, nicht am Hook", () => {
  it("POSITIV-KONTROLLE: die Liste ist nicht leer (sonst prueft alles darunter nichts)", () => {
    expect(Object.keys(SICHERE_HEADER).length).toBeGreaterThan(0);
  });

  it("SCHARF: JEDER deklarierte Header steht an einer echten Antwort", async () => {
    const { r } = await antwort();
    for (const [k, v] of Object.entries(SICHERE_HEADER)) {
      expect(r.headers[k.toLowerCase()], `${k} fehlt an der Antwort`).toBe(v);
    }
  });

  it("SCHARF: auch der FEHLERPFAD traegt sie — eine 500 ist genauso einbettbar wie eine 200", async () => {
    const { fehler } = await antwort();
    expect(fehler.statusCode).toBe(500);
    expect(fehler.headers["x-frame-options"]).toBe("DENY");
    expect(fehler.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("GEGENPROBE: HSTS schweigt auf einer KLARTEXT-Verbindung", async () => {
    // ⛔ Ein HSTS-Header auf http ist eine Behauptung ohne Deckung — er macht die erste Verbindung
    // nicht sicherer und suggeriert eine Kontrolle, die es auf dieser Strecke nicht gibt.
    const { r } = await antwort();
    expect(r.headers["strict-transport-security"]).toBeUndefined();
  });

  it("SCHARF: ueber TLS wird HSTS gesetzt (sonst waere die Gegenprobe eine Tautologie)", async () => {
    const { r } = await antwort({ https: true });
    expect(r.headers["strict-transport-security"]).toBe(HSTS_WERT);
  });

  it("EHRLICH: CSP wird NICHT behauptet — ihr Fehlen ist benannt, nicht verschwiegen", async () => {
    // Der Golden schliesst mit «Anti-Overclaim»: eine Kontrolle gilt nur als umgesetzt, wenn sie im Code
    // belegbar ist. Eine CSP, die zur Asset-Herkunft nicht passt, bricht die Anwendung oder schuetzt
    // nichts — beides ist schlechter als ihr benanntes Fehlen.
    const { r } = await antwort();
    expect(r.headers["content-security-policy"]).toBeUndefined();
  });
});
