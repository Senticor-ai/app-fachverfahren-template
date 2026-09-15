// composables-chat — Tests der GOVERNED Konversations-Runde POST /api/composables/:id/chat (Ziel-1 S5):
// Erdung (kuratiertes Verfahrens-Wissen, server-abgeleitete Quellen), Evidence (chat.turn hash-verkettet,
// nur Metadaten), Datei rein/raus (BlobStorage), Governance-Denies (RBAC, kein Spine, AAL-0, high-risk)
// und die converse↔suggest-Naht (Fallback ohne converse; Verlauf erreicht converse als Chat-Rollen).
import { describe, expect, it } from "vitest";
import { InMemoryWissenStore } from "@senticor/app-store-postgres";
import {
  createInMemoryComposableRegistry,
  createInMemoryProcedureRegistry,
  type AgenticComposable,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  capabilityOk,
  createLocalAiAssistPort,
  type AiAssistPort,
  type AiConverseRequest,
  type AiSuggestRequest,
  type AiSuggestion,
} from "@senticor/platform-contracts";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

function composable(over: Partial<AgenticComposable> = {}): AgenticComposable {
  return {
    id: "musterverfahren",
    version: "1.0.0",
    displayName: "Musterverfahren",
    klasse: "outcome",
    status: "certified",
    assurance: "CAL-2",
    outcome: {
      fuerWen: "Sachbearbeitung",
      ergebnis: "beschiedener Antrag",
      messung: "Durchlaufzeit",
      nichtScope: [],
    },
    owners: { capabilityOwner: "amt", serviceOwner: "fachbereich" },
    moduleId: "musterverfahren",
    spine: {
      role: "musterverfahren-spine",
      autonomy: "AAL-2",
      aufgaben: ["assistenz", "pruefung"],
      skills: ["vollstaendigkeitspruefung"],
      knowledgeDomains: ["musterverfahren"],
    },
    evals: ["eval:smoke"],
    replaceableBy: [],
    ...over,
  };
}

const procedure: ProcedureVersion = {
  procedureId: "musterverfahren",
  version: "2026-01",
  effectiveFrom: "2026-01-01",
  legalBasisIds: ["§ 1 MusterG"],
  allowedStates: ["eingegangen", "abgeschlossen"],
  allowedTransitions: [
    {
      from: "eingegangen",
      to: "abgeschlossen",
      action: "abschliessen",
      requiredPermission: "case.transition",
    },
  ],
};

/** Seedet das kuratierte Verfahrens-Wissen der knowledgeDomain (tenant/authority der Test-Sitzung). */
async function wissenStoreMit(texte: string[]): Promise<{
  store: InMemoryWissenStore;
  eintragIds: string[];
}> {
  const store = new InMemoryWissenStore();
  const eintragIds: string[] = [];
  let i = 0;
  for (const text of texte) {
    const eintragId = `wissen.test-${i++}`;
    await store.appendEintrag({
      eintragId,
      procedureId: procedure.procedureId,
      procedureVersion: procedure.version,
      tenantId: "tenant-1",
      authorityId: "authority-1",
      jurisdictionId: "de",
      actorId: "actor-caseworker",
      art: "wissen",
      urheber: "human:caseworker",
      text,
      metadaten: {},
      occurredAt: new Date(2026, 0, 1 + i).toISOString(),
    });
    eintragIds.push(eintragId);
  }
  return { store, eintragIds };
}

async function chatApp(
  opts: {
    composables?: AgenticComposable[];
    wissenStore?: InMemoryWissenStore;
    aiAssist?: AiAssistPort;
    session?: ReturnType<typeof caseworkerSession>;
  } = {},
) {
  return buildBffApp({
    session: opts.session ?? caseworkerSession(),
    composableRegistry: createInMemoryComposableRegistry(
      opts.composables ?? [composable()],
    ),
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
    ...(opts.wissenStore ? { wissenStore: opts.wissenStore } : {}),
    ...(opts.aiAssist ? { aiAssist: opts.aiAssist } : {}),
  });
}

describe("BFF Composable-Chat POST /api/composables/:id/chat", () => {
  it("geerdete Runde: kuratiertes Wissen erdet die Antwort, Quellen sind server-abgeleitet, reviewRequired=true", async () => {
    const { store, eintragIds } = await wissenStoreMit([
      "Die Frist beträgt einen Monat ab Bekanntgabe.",
      "Zuständig ist die Fachstelle des Amts.",
    ]);
    const { app } = await chatApp({ wissenStore: store });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Welche Frist gilt?" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.composableId).toBe("musterverfahren");
    expect(body.autonomy).toBe("AAL-2");
    expect(body.rechtsnah).toBe(true); // aufgaben enthalten "pruefung"
    // ERDUNG: beide Einträge zitierfähig + die knowledgeDomain, geerdet=true.
    expect(body.erdung.geerdet).toBe(true);
    expect(body.erdung.wissensEintraege).toBe(2);
    for (const id of eintragIds)
      expect(body.erdung.quellen).toContain(`wissen:${id}`);
    expect(body.erdung.quellen).toContain("domain:musterverfahren");
    // HITL: die Antwort ist ein Vorschlag, nie eine Entscheidung.
    expect(body.antwort.reviewRequired).toBe(true);
    expect(body.antwort.marking).toBe("ki-vorschlag");
    expect(typeof body.antwort.value).toBe("string");
    await app.close();
  });

  it("ohne Wissenseinträge ist die Runde ehrlich UNGEERDET (geerdet=false, keine wissen:-Quellen)", async () => {
    const { app } = await chatApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Welche Frist gilt?" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.erdung.geerdet).toBe(false);
    expect(body.erdung.wissensEintraege).toBe(0);
    expect(
      body.erdung.quellen.filter((q: string) => q.startsWith("wissen:")),
    ).toEqual([]);
    await app.close();
  });

  it("jede Runde landet als chat.turn hash-verkettet im Evidence-Ledger — NUR Metadaten, nie Inhalt", async () => {
    const { store } = await wissenStoreMit(["Fristwissen."]);
    const { app } = await chatApp({ wissenStore: store });
    for (const frage of ["Erste Frage?", "Zweite GEHEIME Frage?"]) {
      const r = await app.inject({
        method: "POST",
        url: "/api/composables/musterverfahren/chat",
        payload: { nachricht: frage, caseId: "case.demo" },
      });
      expect(r.statusCode).toBe(200);
    }
    const res = await app.inject({
      method: "GET",
      url: "/api/composables/musterverfahren/evidence",
    });
    const body = res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].entryType).toBe("chat.turn");
    expect(body.entries[0].prevHash).toBeNull();
    expect(body.entries[1].prevHash).toBe(body.entries[0].entryHash);
    expect(body.chain).toEqual({ valid: true, length: 2 });
    expect(body.entries[0].refs.geerdet).toBe("true");
    expect(body.entries[0].refs.caseId).toBe("case.demo");
    // Kein Nachrichten-/Antwort-Inhalt in der Kette (kein PII).
    expect(JSON.stringify(body.entries)).not.toContain("GEHEIME");
    await app.close();
  });

  it("Datei REIN: base64 → BlobStorage-Referenz (server-berechnete Größe + SHA-256); Text erdet die Runde", async () => {
    const inhalt = "posten;betrag\nhundesteuer;120";
    const { app } = await chatApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: {
        nachricht: "Prüfe die Datei.",
        dateien: [
          {
            fileName: "bestand.csv",
            mimeType: "text/csv",
            contentBase64: Buffer.from(inhalt, "utf8").toString("base64"),
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dateienRein).toHaveLength(1);
    expect(body.dateienRein[0].fileName).toBe("bestand.csv");
    expect(body.dateienRein[0].sizeBytes).toBe(
      Buffer.byteLength(inhalt, "utf8"),
    );
    expect(body.dateienRein[0].checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    await app.close();
  });

  it("Datei RAUS: antwortAlsDatei legt die Antwort als Markdown im BlobStorage ab und liefert sie zurück", async () => {
    const { app } = await chatApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: {
        nachricht: "Erstelle einen Prüfvermerk.",
        antwortAlsDatei: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.datei).toBeDefined();
    expect(body.datei.ref.mimeType).toBe("text/markdown");
    expect(body.datei.ref.attachmentId.length).toBeGreaterThan(0);
    // Der Datei-Inhalt IST die Antwort (eine Wahrheit).
    const text = Buffer.from(body.datei.contentBase64, "base64").toString(
      "utf8",
    );
    expect(text).toBe(body.antwort.value);
    await app.close();
  });

  it("leere Datei → 400 (kein leerer Blob)", async () => {
    const { app } = await chatApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: {
        nachricht: "Prüfe.",
        dateien: [
          {
            fileName: "leer.txt",
            mimeType: "text/plain",
            contentBase64: "!!!",
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("GOVERNANCE: 403 ohne ai.assist (Bürger-Rolle darf nicht chatten)", async () => {
    const { app } = await chatApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Hallo?" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("GOVERNANCE: 404 ohne Spine-Agent (Chat ist eine agentische Fähigkeit — deny-by-default)", async () => {
    const { spine: _weg, ...ohneSpine } = composable();
    void _weg;
    const { app } = await chatApp({ composables: [ohneSpine] });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Hallo?" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("GOVERNANCE: 422 bei AAL-0 (deterministic only — das Manifest erlaubt keine Konversation)", async () => {
    const aal0 = composable({
      spine: {
        role: "deterministic-spine",
        autonomy: "AAL-0",
        aufgaben: ["assistenz"],
        skills: ["s"],
        knowledgeDomains: ["musterverfahren"],
      },
    });
    const { app } = await chatApp({ composables: [aal0] });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Hallo?" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain("AAL-0");
    await app.close();
  });

  it("404 für ein unbekanntes Composable", async () => {
    const { app } = await chatApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/gibt-es-nicht/chat",
      payload: { nachricht: "Hallo?" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("converse-NAHT: der Verlauf erreicht den Port als Chat-Rollen; die Erdung reist im input", async () => {
    let gesehen: AiConverseRequest | undefined;
    const port: AiAssistPort = {
      ...createLocalAiAssistPort(),
      async converse(_context, request) {
        gesehen = request;
        const suggestion: AiSuggestion = {
          value: "geerdete Antwort",
          confidence: 0.5,
          modelId: "test:converse",
          rationale: "Test",
          sources: ["test"],
          marking: "ki-vorschlag",
          euAiActClass: "limited-risk",
          reviewRequired: true,
        };
        return capabilityOk(suggestion);
      },
    };
    const { store } = await wissenStoreMit(["Fristwissen."]);
    const { app } = await chatApp({ aiAssist: port, wissenStore: store });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: {
        nachricht: "Und jetzt?",
        verlauf: [
          { rolle: "nutzer", text: "Welche Frist gilt?" },
          { rolle: "assistent", text: "Ein Monat." },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(gesehen).toBeDefined();
    expect(gesehen?.history).toEqual([
      { role: "user", text: "Welche Frist gilt?" },
      { role: "assistant", text: "Ein Monat." },
      { role: "user", text: "Und jetzt?" },
    ]);
    expect(gesehen?.maxClass).toBe("limited-risk");
    expect(Array.isArray(gesehen?.input["wissen"])).toBe(true);
    expect(res.json().antwort.modelId).toBe("test:converse");
    await app.close();
  });

  it("FALLBACK ohne converse: suggest trägt die Runde (Verlauf reist im input) — Adapter bleiben gültig", async () => {
    let gesehen: AiSuggestRequest | undefined;
    const basis = createLocalAiAssistPort();
    const port: AiAssistPort = {
      descriptor: basis.descriptor,
      async suggest(context, request) {
        gesehen = request;
        return basis.suggest(context, request);
      },
      // KEIN converse — der bewusste Fallback-Fall.
    };
    const { app } = await chatApp({ aiAssist: port });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Welche Frist gilt?" },
    });
    expect(res.statusCode).toBe(200);
    expect(gesehen?.task).toBe("composable-chat:musterverfahren");
    expect(Array.isArray(gesehen?.input["verlauf"])).toBe(true);
    expect(res.json().antwort.reviewRequired).toBe(true);
    await app.close();
  });

  it("KURATION: verworfenes KI-Wissen erdet NIE (dieselbe Wahrheit wie Wiki/Export)", async () => {
    const store = new InMemoryWissenStore();
    await store.appendEintrag({
      eintragId: "wissen.ki-verworfen",
      procedureId: procedure.procedureId,
      procedureVersion: procedure.version,
      tenantId: "tenant-1",
      authorityId: "authority-1",
      jurisdictionId: "de",
      actorId: "actor-caseworker",
      art: "teilergebnis",
      urheber: "ollama:qwen3",
      text: "FALSCHES KI-Wissen.",
      metadaten: {},
      occurredAt: new Date(2026, 0, 1).toISOString(),
    });
    // Append-only Prüf-Marker: verworfen.
    await store.appendEintrag({
      eintragId: "wissen.review-1",
      procedureId: procedure.procedureId,
      procedureVersion: procedure.version,
      tenantId: "tenant-1",
      authorityId: "authority-1",
      jurisdictionId: "de",
      actorId: "actor-caseworker",
      art: "wissen.reviewed",
      urheber: "human:caseworker",
      text: "",
      metadaten: {
        bezugEintragId: "wissen.ki-verworfen",
        entscheidung: "verworfen",
      },
      occurredAt: new Date(2026, 0, 2).toISOString(),
    });
    const { app } = await chatApp({ wissenStore: store });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Welche Frist gilt?" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.erdung.geerdet).toBe(false);
    expect(body.erdung.wissensEintraege).toBe(0);
    await app.close();
  });
  // ── DIE STELLE KENNT IHRE EIGENEN RECHTSGRUNDLAGEN — und was sie NICHT kennt, sagt sie ────────────
  //
  // ⛔ GEMESSEN 2026-09-03 an einem emittierten Live-Mesh: jede Stelle fuehrt FUENF
  // Anspruchsgrundlagen MIT TITEL (Landesabgabenrecht · Erhebung · Autoritaetsfamilie · E-Government · Onlinezugang)
  // und VIER Wissens-Knoten (`seed-*`). Beides erreichte den Assistenten nicht:
  //   `anspruch` starb am MOUNT — `mapManifestToComposable` las das Feld in keiner Zeile.
  //   `wissen` erreichte `knowledgeDomains`, wurde dort aber von einem Filter gelesen, der NUR
  //   procedureIds versteht — vier von fuenf Domaenen fielen LAUTLOS weg, und die Antwort meldete
  //   trotzdem `geerdet: true`. Eine Absenz, die wie ein Erfolg aussieht.
  const mitAnspruch = () =>
    composable({
      spine: {
        role: "musterverfahren-spine",
        autonomy: "AAL-2",
        aufgaben: ["assistenz", "pruefung"],
        skills: ["vollstaendigkeitspruefung"],
        // EINE aufloesbare Domaene (die Verfahrens-Id) + ZWEI Korpus-Knoten, die dieses Verfahren nicht traegt.
        knowledgeDomains: [
          "musterverfahren",
          "seed-de-verwaltung",
          "seed-business-rules",
        ],
        rechtsgrundlagen: [
          { id: "recht:kag", titel: "Kommunalabgabengesetz (KAG)" },
          {
            id: "recht:ozg",
            titel: "Onlinezugangsgesetz (OZG)",
            ubiquitaer: true,
          },
        ],
      },
    });

  it("ANSPRUCH: die deklarierten Rechtsgrundlagen erreichen den Port UND die Quellen — heben `geerdet` aber NICHT", async () => {
    let gesehen: AiConverseRequest | undefined;
    const port: AiAssistPort = {
      ...createLocalAiAssistPort(),
      async converse(_context, request) {
        gesehen = request;
        return capabilityOk({
          value: "Antwort",
          confidence: 0.5,
          modelId: "test:converse",
          rationale: "Test",
          sources: ["test"],
          marking: "ki-vorschlag",
          euAiActClass: "limited-risk",
          reviewRequired: true,
        } satisfies AiSuggestion);
      },
    };
    // OHNE kuratiertes Wissen — genau so ist der Fall trennscharf: waeren die Grundlagen eine Erdung,
    // stuende hier `geerdet: true`.
    const { app } = await chatApp({
      aiAssist: port,
      composables: [mitAnspruch()],
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Worauf stuetzt sich diese Stelle?" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // (a) SIE KOMMEN AN — im Port-Input und in den server-abgeleiteten Quellen.
    expect(gesehen?.input["rechtsgrundlagen"]).toEqual([
      { id: "recht:kag", titel: "Kommunalabgabengesetz (KAG)" },
      { id: "recht:ozg", titel: "Onlinezugangsgesetz (OZG)", ubiquitaer: true },
    ]);
    expect(body.erdung.quellen).toContain("anspruch:recht:kag");
    expect(body.erdung.rechtsgrundlagen).toHaveLength(2);

    // (b) UND SIE HEBEN `geerdet` NICHT. Ein Titel NENNT eine Norm; er traegt sie nicht.
    // «GEERDET beglaubigt die EXISTENZ der Norm, nie ihren GEHALT» — ein Titel als Beleg waere ihr Rueckfall.
    expect(body.erdung.geerdet).toBe(false);
    expect(body.erdung.wissensEintraege).toBe(0);

    // (c) DIE GRENZE STEHT IM AUFTRAG, nicht nur in der Absicht — sonst macht das Modell aus einem
    //     Titel einen Wortlaut.
    const regeln = (gesehen?.input["regeln"] ?? []) as string[];
    expect(
      regeln.some((r) => /rechtsgrundlagen\[\].*KEINEN Normtext/i.test(r)),
    ).toBe(true);
    await app.close();
  });

  it("BENANNTE ABSENZ: eine deklarierte Wissens-Domaene ohne Wissen faellt nicht mehr lautlos weg", async () => {
    let gesehen: AiConverseRequest | undefined;
    const port: AiAssistPort = {
      ...createLocalAiAssistPort(),
      async converse(_context, request) {
        gesehen = request;
        return capabilityOk({
          value: "Antwort",
          confidence: 0.5,
          modelId: "test:converse",
          rationale: "Test",
          sources: ["test"],
          marking: "ki-vorschlag",
          euAiActClass: "limited-risk",
          reviewRequired: true,
        } satisfies AiSuggestion);
      },
    };
    const { store } = await wissenStoreMit(["Fristwissen."]);
    const { app } = await chatApp({
      aiAssist: port,
      wissenStore: store,
      composables: [mitAnspruch()],
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Welche Frist gilt?" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Die EINE aufloesbare Domaene erdet — die beiden Korpus-Knoten werden BENANNT statt verschluckt.
    expect(body.erdung.geerdet).toBe(true);
    expect(body.erdung.domainsOhneWissen).toEqual([
      "seed-de-verwaltung",
      "seed-business-rules",
    ]);
    // ANTI-LOCKERUNG: `domain:`-Quellen nennen NUR, was wirklich aufgeloest wurde. Vorher stand dort
    // JEDE deklarierte Domaene — eine zitierfaehige Quelle fuer Wissen, das gar nicht vorlag.
    expect(body.erdung.quellen).toContain("domain:musterverfahren");
    expect(body.erdung.quellen).not.toContain("domain:seed-de-verwaltung");
    // Und das Modell wird darauf hingewiesen, statt die Luecke fuer Vollstaendigkeit zu halten.
    const regeln = (gesehen?.input["regeln"] ?? []) as string[];
    expect(regeln.some((r) => r.includes("seed-de-verwaltung"))).toBe(true);
    await app.close();
  });

  it("POSITIV-KONTROLLE: loesen ALLE Domaenen auf, ist die Absenz-Liste leer (kein Dauer-Rauschen)", async () => {
    const { store } = await wissenStoreMit(["Fristwissen."]);
    const { app } = await chatApp({ wissenStore: store });
    const res = await app.inject({
      method: "POST",
      url: "/api/composables/musterverfahren/chat",
      payload: { nachricht: "Welche Frist gilt?" },
    });
    const body = res.json();
    expect(body.erdung.domainsOhneWissen).toEqual([]);
    // Und ohne deklarierte Grundlagen bleibt die Liste leer statt undefined — ein Feld, das mal fehlt
    // und mal da ist, zwingt jeden Leser zu einer Fallunterscheidung.
    expect(body.erdung.rechtsgrundlagen).toEqual([]);
    await app.close();
  });
});
