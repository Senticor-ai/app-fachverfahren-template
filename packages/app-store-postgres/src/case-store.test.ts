import { beforeAll, describe, expect, it } from "vitest";
import {
  type AppAuditEvent,
  type AppCase,
  type CaseStore,
  CaseNotFoundError,
  CaseVersionConflictError,
  InMemoryCaseStore,
  PostgresCaseStore,
} from "./case-store.js";
import { ChosCaseStore } from "./chos-case-store.js";
import { InMemoryChosClient } from "./chos-client.js";
import { verifyAuditChain } from "./audit-chain.js";

// Parametrisierte Vertrags-Tests: identisch gegen den In-Memory-Store (immer) UND — wenn eine Datenbank
// konfiguriert ist (APP_PG_DIRECT_URL/APP_PG_URL, Migrationen vorher ausgeführt) — gegen den Postgres-Store.
// So verhält sich die PROD-Standalone-Laufzeit nachweislich wie die Test-Laufzeit.
const uid = () => globalThis.crypto.randomUUID();

function macheCase(over: Partial<AppCase> = {}): AppCase {
  return {
    caseId: `case-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "integrationsberatung",
    procedureVersion: "1",
    state: "aufgenommen",
    version: 1,
    subjectIds: ["subj-1"],
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: null,
    data: {},
    ownerActorId: null,
    ...over,
  };
}

function macheAudit(
  caseId: string,
  over: Partial<AppAuditEvent> = {},
): AppAuditEvent {
  return {
    auditEventId: `audit-${uid()}`,
    caseId,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    actorId: "sb.a",
    eventType: "case.transitioned",
    purpose: "case-management",
    legalBasisId: "VwV-IGM-2023",
    requestId: `req-${uid()}`,
    payload: { summary: "Test" },
    occurredAt: "2026-06-02T00:00:00.000Z",
    ...over,
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: { name: string; make: () => CaseStore; enabled: boolean }[] = [
  {
    name: "InMemoryCaseStore",
    make: () => new InMemoryCaseStore(),
    enabled: true,
  },
  {
    name: "PostgresCaseStore",
    make: () => new PostgresCaseStore(pgUrl!),
    enabled: Boolean(pgUrl),
  },
  {
    // Der chos-Graph-Adapter über einen Fake-Graph — läuft OHNE laufendes chos durch DENSELBEN Vertrag
    // (Scope, Optimistic-Locking, atomarer Zustandswechsel+Audit, append-only-Ordnung, jsonb-Parität).
    name: "ChosCaseStore(InMemoryChosClient)",
    make: () => new ChosCaseStore(new InMemoryChosClient()),
    enabled: true,
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(`CaseStore contract — ${impl.name}`, () => {
    let store: CaseStore;
    beforeAll(() => {
      store = impl.make();
    });

    it("legt einen Fall an und liest ihn zurück (mandanten-scoped)", async () => {
      const c = macheCase();
      await store.insertCase(c);
      const gelesen = await store.getCase({
        tenantId: "t1",
        caseId: c.caseId,
        scope: "authority",
        authorityId: "b1",
      });
      expect(gelesen?.caseId).toBe(c.caseId);
      expect(gelesen?.subjectIds).toEqual(["subj-1"]);
      expect(gelesen?.state).toBe("aufgenommen");
      // Fremder Mandant sieht den Fall NICHT.
      expect(
        await store.getCase({
          tenantId: "fremd",
          caseId: c.caseId,
          scope: "authority",
          authorityId: "b1",
        }),
      ).toBeUndefined();
    });

    it("data: verschachtelte fachliche Nutzlast überlebt den Roundtrip unverändert", async () => {
      // Die ANTRAGS-Art legt hier Antragsdaten + Berechnung ab (der Server interpretiert sie nie).
      const daten = {
        antragsdaten: {
          antragsteller: { vorname: "Alex", plz: "12345" },
          anliegen: { kategorie: "standard" },
        },
        berechnung: {
          betrag: 120,
          einheit: "EUR/Jahr",
          positionen: [{ label: "Grundbetrag", betrag: 120 }],
        },
      };
      const c = macheCase({ data: daten });
      await store.insertCase(c);
      const gelesen = await store.getCase({
        tenantId: "t1",
        caseId: c.caseId,
        scope: "authority",
        authorityId: "b1",
      });
      expect(gelesen?.data).toEqual(daten);
    });

    it("data: der Aufrufer bekommt eine KOPIE — Mutation am Ergebnis erreicht den Store nicht", async () => {
      // PARITÄTS-FALLE: Postgres speichert `data` als jsonb, der Aufrufer bekommt dort ZWANGSLÄUFIG ein
      // fremdes Objekt. Ein In-Memory-Store, der die Referenz teilte, verhielte sich anders — und genau
      // solche stillen Divergenzen sind hier schon einmal erst im Live-Drive aufgefallen (closedAt).
      const c = macheCase({ data: { antragsdaten: { plz: "12345" } } });
      await store.insertCase(c);
      const gelesen = await store.getCase({
        tenantId: "t1",
        caseId: c.caseId,
        scope: "authority",
        authorityId: "b1",
      });
      (gelesen!.data["antragsdaten"] as Record<string, unknown>)["plz"] =
        "99999";
      const nochmal = await store.getCase({
        tenantId: "t1",
        caseId: c.caseId,
        scope: "authority",
        authorityId: "b1",
      });
      expect(nochmal?.data).toEqual({ antragsdaten: { plz: "12345" } });
    });

    it("data: fehlende Nutzlast ist ein leeres Objekt, nie undefined", async () => {
      const c = macheCase({ data: {} });
      await store.insertCase(c);
      const gelesen = await store.getCase({
        tenantId: "t1",
        caseId: c.caseId,
        scope: "authority",
        authorityId: "b1",
      });
      expect(gelesen?.data).toEqual({});
    });

    it("owner-Scope: die Bürgerin sieht NUR ihren eigenen Fall — nie den einer anderen", async () => {
      const tenantId = `t-owner-${uid()}`;
      const meiner = macheCase({ tenantId, ownerActorId: "actor.anna" });
      const fremder = macheCase({ tenantId, ownerActorId: "actor.bodo" });
      await store.insertCase(meiner);
      await store.insertCase(fremder);

      const meins = {
        tenantId,
        scope: "owner" as const,
        actorId: "actor.anna",
      };
      expect((await store.listCases(meins)).map((c) => c.caseId)).toEqual([
        meiner.caseId,
      ]);
      // Der FREMDE Fall ist über getCase nicht erreichbar — auch nicht mit korrekter caseId.
      // Er kommt als `undefined` zurück → 404 ist die einzig mögliche Antwort, kein 403-Existenz-Orakel.
      expect(
        await store.getCase({ ...meins, caseId: fremder.caseId }),
      ).toBeUndefined();
      expect(
        (await store.getCase({ ...meins, caseId: meiner.caseId }))?.caseId,
      ).toBe(meiner.caseId);
    });

    it("owner-Scope: ein Fall OHNE Eigentümer (Behörden-Dossier) ist NIE „meins“", async () => {
      // Die NULL-Regel: das Prädikat vergleicht auf Gleichheit, und `NULL = $1` ist in SQL nie wahr.
      // Ein behörden-initiiertes Dossier darf niemals in „meine Anträge" auftauchen — fail-closed
      // ohne Sonderfall im Code. Diese Prüfung läuft gegen BEIDE Laufzeiten (Parität).
      const tenantId = `t-null-${uid()}`;
      const dossier = macheCase({ tenantId, ownerActorId: null });
      await store.insertCase(dossier);
      const alsBuerger = {
        tenantId,
        scope: "owner" as const,
        actorId: "actor.anna",
      };
      expect(await store.listCases(alsBuerger)).toEqual([]);
      expect(
        await store.getCase({ ...alsBuerger, caseId: dossier.caseId }),
      ).toBeUndefined();
      // Die Behörde sieht ihn sehr wohl.
      expect(
        (
          await store.getCase({
            tenantId,
            caseId: dossier.caseId,
            scope: "authority",
            authorityId: "b1",
          })
        )?.caseId,
      ).toBe(dossier.caseId);
    });

    it("owner-Scope respektiert den Mandanten-Riegel (fremder Mandant sieht nichts)", async () => {
      const tenantId = `t-mand-${uid()}`;
      const meiner = macheCase({ tenantId, ownerActorId: "actor.anna" });
      await store.insertCase(meiner);
      expect(
        await store.listCases({
          tenantId: "fremder-mandant",
          scope: "owner",
          actorId: "actor.anna",
        }),
      ).toEqual([]);
    });

    it("listCases filtert nach Mandant/Behörde/Status/Verfahren, opened_at DESC", async () => {
      const tenantId = `t-list-${uid()}`;
      const scope = {
        tenantId,
        scope: "authority" as const,
        authorityId: "b1",
      };
      await store.insertCase(
        macheCase({
          tenantId,
          openedAt: "2026-01-01T00:00:00.000Z",
          state: "aufgenommen",
        }),
      );
      const spaeter = macheCase({
        tenantId,
        openedAt: "2026-03-01T00:00:00.000Z",
        state: "aktiv",
      });
      await store.insertCase(spaeter);
      const alle = await store.listCases(scope);
      expect(alle.map((c) => c.state)).toEqual(["aktiv", "aufgenommen"]); // DESC
      const nurAktiv = await store.listCases({ ...scope, state: "aktiv" });
      expect(nurAktiv.map((c) => c.caseId)).toEqual([spaeter.caseId]);
    });

    it("patchCaseState: Zustandswechsel + Audit ATOMAR, Version+1; Optimistic-Locking + Not-Found werfen", async () => {
      const c = macheCase({ tenantId: `t-patch-${uid()}` });
      await store.insertCase(c);
      const scope = { tenantId: c.tenantId, caseId: c.caseId };

      const nach = await store.patchCaseState({
        ...scope,
        expectedVersion: 1,
        newState: "aktiv",
        auditEvent: macheAudit(c.caseId, {
          tenantId: c.tenantId,
          eventType: "case.transitioned",
          payload: {
            previousState: "aufgenommen",
            newState: "aktiv",
            summary: "aktiviert",
          },
        }),
      });
      expect(nach.state).toBe("aktiv");
      expect(nach.version).toBe(2);
      // Audit landete append-only im Protokoll.
      const audit = await store.listAuditEvents(scope);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.eventType).toBe("case.transitioned");
      expect(audit[0]?.payload["newState"]).toBe("aktiv");

      // Veraltete expectedVersion → Konflikt, kein zweites Audit.
      await expect(
        store.patchCaseState({
          ...scope,
          expectedVersion: 1,
          newState: "abgeschlossen",
          auditEvent: macheAudit(c.caseId, { tenantId: c.tenantId }),
        }),
      ).rejects.toBeInstanceOf(CaseVersionConflictError);
      expect((await store.listAuditEvents(scope)).length).toBe(1);

      // Abschluss setzt closedAt.
      const zu = await store.patchCaseState({
        ...scope,
        expectedVersion: 2,
        newState: "abgeschlossen",
        closedAt: "2026-07-01T00:00:00.000Z",
        auditEvent: macheAudit(c.caseId, { tenantId: c.tenantId }),
      });
      expect(zu.closedAt).toBe("2026-07-01T00:00:00.000Z");

      // Unbekannter Fall → NotFound.
      await expect(
        store.patchCaseState({
          tenantId: c.tenantId,
          caseId: "gibt-es-nicht",
          expectedVersion: 1,
          newState: "aktiv",
          auditEvent: macheAudit("gibt-es-nicht", { tenantId: c.tenantId }),
        }),
      ).rejects.toBeInstanceOf(CaseNotFoundError);
    });

    it("Audit ist append-only + fallscoped + in Reihenfolge (occurred_at ASC)", async () => {
      const tenantId = `t-audit-${uid()}`;
      const caseId = `case-${uid()}`;
      await store.appendAuditEvent(
        macheAudit(caseId, {
          tenantId,
          occurredAt: "2026-06-03T00:00:00.000Z",
          eventType: "b",
        }),
      );
      await store.appendAuditEvent(
        macheAudit(caseId, {
          tenantId,
          occurredAt: "2026-06-01T00:00:00.000Z",
          eventType: "a",
        }),
      );
      const liste = await store.listAuditEvents({ tenantId, caseId });
      expect(liste.map((e) => e.eventType)).toEqual(["a", "b"]);
      // Fremder Mandant sieht das Protokoll NICHT.
      expect(
        (await store.listAuditEvents({ tenantId: "fremd", caseId })).length,
      ).toBe(0);
    });

    it("Audit-Hash-Kette (Issue #53): jedes Ereignis ist verkettet + tamper-evident verifizierbar", async () => {
      const tenantId = `t-chain-${uid()}`;
      const c = macheCase({ tenantId, caseId: `case-${uid()}` });
      await store.insertCase(c);
      const scope = { tenantId, caseId: c.caseId };
      // Mehrere Ereignisse über beide Append-Pfade (patchCaseState + appendAuditEvent).
      await store.patchCaseState({
        ...scope,
        expectedVersion: 1,
        newState: "aktiv",
        auditEvent: macheAudit(c.caseId, {
          tenantId,
          eventType: "case.transitioned",
        }),
      });
      await store.appendAuditEvent(
        macheAudit(c.caseId, { tenantId, eventType: "bescheid.abgerufen" }),
      );
      await store.patchCaseState({
        ...scope,
        expectedVersion: 2,
        newState: "abgeschlossen",
        auditEvent: macheAudit(c.caseId, {
          tenantId,
          eventType: "case.transitioned",
        }),
      });
      const liste = await store.listAuditEvents(scope);
      expect(liste).toHaveLength(3);
      // Jedes Ereignis trägt die Kette; GENAU EINES ist Genesis (prevHash null). Die Listen-Reihenfolge ist
      // occurredAt-basiert und muss NICHT die Ketten-Reihenfolge sein — verify folgt den Links.
      expect(liste.every((e) => typeof e.entryHash === "string")).toBe(true);
      expect(liste.filter((e) => (e.prevHash ?? null) === null)).toHaveLength(
        1,
      );
      // Die Kette verifiziert lückenlos.
      expect(verifyAuditChain(liste).ok).toBe(true);
      // MANIPULATION eines gelieferten Ereignisses wird erkannt (tamper-evident).
      const tampered = liste.map((e, i) =>
        i === 1 ? { ...e, payload: { ...e.payload, hacked: true } } : e,
      );
      expect(verifyAuditChain(tampered).ok).toBe(false);
    });
  });
}
