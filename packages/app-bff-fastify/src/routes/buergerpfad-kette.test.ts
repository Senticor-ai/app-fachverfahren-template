// buergerpfad-kette.test — DIE KETTE: Bürger reicht ein → Server stempelt → Amt sieht es → Amt
// entscheidet → Bürger sieht das Ergebnis.
//
// WAS HIER GEPRÜFT WIRD, IST EINE ÜBERGABE, keine Funktion. Bis eben endete die Kette exakt beim
// „201": der Antrag lag in der Datenbank, aber auf keinem Schreibtisch, ohne Eingangsnummer, ohne
// Beleg für die Antragstellerin und ohne dass eine Amts-Sicht ihn je gezeigt hätte. Jeder Test hier
// steht für genau ein Glied, das vorher fehlte.
import { describe, expect, it } from "vitest";
import {
  InMemoryAppStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  formatiereEingangsnummer,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

const verfahren: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["eingegangen", "in_pruefung", "festgesetzt"],
  allowedTransitions: [
    {
      from: "eingegangen",
      to: "in_pruefung",
      action: "pruefen",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "in_pruefung",
      to: "festgesetzt",
      action: "festsetzen",
      requiredPermission: "case.decision.prepare",
      closesCase: true,
      issuesVerwaltungsakt: true,
    },
  ],
  verwaltungsakt: {
    rechtsbehelf: {
      art: "widerspruch",
      fristWert: 1,
      fristEinheit: "monat",
      stelle: "der erlassenden Behörde",
      norm: "§ 68 ff. VwGO",
    },
    fiktionTage: 4,
    fiktionNorm: "§ 41 Abs. 2 VwVfG",
  },
  // FORMAT = VERFAHRENS-DATEN, kein Literal in der Engine.
  eingangsnummerFormat: "AN-{jahr}-{kennung}",
};

/** Die geteilte Welt: EIN Speicher, mehrere Sitzungen — genau wie im Betrieb. */
function welt() {
  const appStore = new InMemoryAppStore();
  const caseStore = new InMemoryCaseStore();
  const taskStore = new InMemoryTaskStore();
  const bauen = (rolle: "buerger" | "amt", actorId: string) =>
    buildBffApp({
      session:
        rolle === "buerger"
          ? citizenSession({ actorId })
          : caseworkerSession({ actorId }),
      appStore,
      caseStore,
      taskStore,
      procedureRegistry: createInMemoryProcedureRegistry([verfahren]),
    });
  return { appStore, caseStore, taskStore, bauen };
}

const ANTRAG = {
  procedureId: "musterantrag",
  procedureVersion: "1",
  data: {
    antragsdaten: { flaeche: 500, lage: "Innenstadt" },
    berechnung: { betrag: 250, einheit: "EUR", label: "Gebühr" },
  },
};

describe("Die Kette Bürger → Amt", () => {
  it("GLIED 1: der SERVER vergibt Eingangsnummer und Eingangszeit (nicht der Browser)", async () => {
    const w = welt();
    const { app: anna } = await w.bauen("buerger", "actor.anna");
    const dto = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: ANTRAG,
      })
    ).json();

    // Die Nummer folgt dem im VERFAHREN deklarierten Format …
    expect(dto.eingangsnummer).toMatch(/^AN-\d{4}-[0-9A-Z]{6}$/);
    // … und ist exakt die Projektion aus Fall-Kennung + Server-Eingangszeit (reproduzierbar).
    expect(dto.eingangsnummer).toBe(
      formatiereEingangsnummer({
        eingangIso: dto.eingereichtAm,
        caseId: dto.antragId,
        procedureId: "musterantrag",
        format: "AN-{jahr}-{kennung}",
      }),
    );
    // Sie ist STABIL: ein zweiter Abruf liefert dieselbe Nummer (kein neuer Zähler je Request).
    const erneut = (
      await anna.inject({
        method: "GET",
        url: `/api/buerger/antraege/${dto.antragId}`,
      })
    ).json();
    expect(erneut.eingangsnummer).toBe(dto.eingangsnummer);
    await anna.close();
  });

  it("GLIED 2: die Eingangsbestätigung liegt im Postfach der Antragstellerin (nicht nur auf einer Bildschirmseite)", async () => {
    const w = welt();
    const { app: anna } = await w.bauen("buerger", "actor.anna");
    const dto = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: ANTRAG,
      })
    ).json();
    const postfach = (
      await anna.inject({ method: "GET", url: "/api/mailbox?box=inbox" })
    ).json();
    const bestaetigung = postfach.messages.find((m: { subject: string }) =>
      m.subject.includes(dto.eingangsnummer),
    );
    expect(bestaetigung).toBeDefined();
    expect(bestaetigung.caseId).toBe(dto.antragId);
    // Der Beleg trägt Zeit, Aktenzeichen und die Prüfsumme der eingereichten Angaben.
    expect(bestaetigung.bodyPreview).toContain(dto.eingereichtAm);
    expect(bestaetigung.bodyPreview).toContain(dto.antragId);
    expect(bestaetigung.bodyPreview).toMatch(/Prüfsumme/);
    await anna.close();
  });

  it("GLIED 3: der Antrag liegt im EINGANGSKORB der Stelle — als Aufgabe, nicht als agentischer Anstoß", async () => {
    const w = welt();
    const { app: anna } = await w.bauen("buerger", "actor.anna");
    const dto = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: ANTRAG,
      })
    ).json();
    await anna.close();

    const { app: amt } = await w.bauen("amt", "actor.sb1");
    const tasks = (
      await amt.inject({
        method: "GET",
        url: `/api/cases/${dto.antragId}/tasks`,
      })
    ).json();
    const eingang = tasks.tasks.find(
      (t: { taskKind: string }) => t.taskKind === "eingang",
    );
    expect(eingang).toBeDefined();
    expect(eingang.state).toBe("open");
    // Er ist NIEMANDEM zugewiesen — die Stelle HOLT sich die Arbeit (Pull), sie wird nicht gerufen.
    expect(eingang.assignedTo).toBeNull();
    // Die Aufgabe sagt SOFORT, dass die Angaben von aussen kommen — bevor jemand sie liest.
    expect(eingang.data.herkunft).toBe("extern");
    expect(eingang.data.hitlPflicht).toBe(true);
    expect(eingang.title).toContain(dto.eingangsnummer);
    await amt.close();
  });

  it("GLIED 4: die Amts-Sicht zeigt die eingereichten ANGABEN (vorher sah sie einen Demo-Bestand)", async () => {
    const w = welt();
    const { app: anna } = await w.bauen("buerger", "actor.anna");
    const dto = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: ANTRAG,
      })
    ).json();
    await anna.close();

    const { app: amt } = await w.bauen("amt", "actor.sb1");
    // Die Liste, aus der die Eingangs-Sicht hydriert.
    const liste = (
      await amt.inject({ method: "GET", url: "/api/cases" })
    ).json();
    const fall = liste.cases.find(
      (c: { caseId: string }) => c.caseId === dto.antragId,
    );
    expect(fall).toBeDefined();
    // DER KERN: die Antragsdaten sind da. Ohne sie ist eine Akte eine leere Hülle.
    expect(fall.data.antragsdaten).toEqual(ANTRAG.data.antragsdaten);
    expect(fall.data.berechnung).toEqual(ANTRAG.data.berechnung);
    await amt.close();
  });

  it("GLIED 5+6: zwei Personen entscheiden, der Bürger sieht den Bescheid — und legt Widerspruch ein", async () => {
    const w = welt();
    const { app: anna } = await w.bauen("buerger", "actor.anna");
    const dto = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: ANTRAG,
      })
    ).json();

    const { app: sb1 } = await w.bauen("amt", "actor.sb1");
    const geprueft = await sb1.inject({
      method: "POST",
      url: `/api/cases/${dto.antragId}/transitions`,
      payload: { action: "pruefen", expectedVersion: dto.version },
    });
    expect(geprueft.statusCode).toBe(200);
    await sb1.close();

    const { app: sb2 } = await w.bauen("amt", "actor.sb2");
    const fest = await sb2.inject({
      method: "POST",
      url: `/api/cases/${dto.antragId}/transitions`,
      payload: {
        action: "festsetzen",
        expectedVersion: geprueft.json().version,
      },
    });
    expect(fest.statusCode).toBe(200);
    await sb2.close();

    // Der Bürger ruft SEINEN Bescheid ab (Bekanntgabe) …
    const bescheid = await anna.inject({
      method: "GET",
      url: `/api/buerger/antraege/${dto.antragId}/bescheid`,
    });
    expect(bescheid.statusCode).toBe(200);
    expect(bescheid.json().tenor).toEqual(ANTRAG.data.berechnung);

    // … und legt Widerspruch ein: der Eingangszeitpunkt ist server-gestempelt.
    const widerspruch = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${dto.antragId}/widerspruch`,
      payload: { begruendung: "Die Fläche ist kleiner." },
    });
    expect(widerspruch.statusCode).toBe(200);
    expect(widerspruch.json().verfristet).toBe(false);
    await anna.close();
  });

  it("die MISSBRAUCHS-DROSSEL greift und sagt, wann es weitergeht — GEGENPROBE: darunter geht alles durch", async () => {
    const w = welt();
    const gedrosselt: ProcedureVersion = {
      ...verfahren,
      procedureId: "engpass",
      drossel: { proAkteur: 3, fensterSekunden: 3600 },
    };
    const { app } = await buildBffApp({
      session: citizenSession({ actorId: "actor.anna" }),
      appStore: w.appStore,
      caseStore: w.caseStore,
      taskStore: w.taskStore,
      procedureRegistry: createInMemoryProcedureRegistry([gedrosselt]),
    });
    const einreichen = () =>
      app.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: { ...ANTRAG, procedureId: "engpass" },
      });
    // GEGENPROBE: die ersten drei gehen durch — die Drossel blockiert nicht pauschal.
    for (let i = 0; i < 3; i++) expect((await einreichen()).statusCode).toBe(201);
    const vierter = await einreichen();
    expect(vierter.statusCode).toBe(429);
    expect(Number(vierter.headers["retry-after"])).toBeGreaterThan(0);
    // Und der vierte Antrag ist NICHT entstanden.
    const liste = (
      await app.inject({ method: "GET", url: "/api/buerger/antraege" })
    ).json();
    expect(liste.antraege).toHaveLength(3);
    await app.close();
  });
});
