import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import { CaseService, CaseServiceError } from "./case-service.js";
import { createDefaultDomainConfig } from "./domain-config.js";

const scope = {
  tenantId: "default",
  authorityId: "authority.default",
  jurisdictionId: "de",
};

function service() {
  return new CaseService({
    caseStore: new InMemoryCaseStore(),
    resolveConfig: () => createDefaultDomainConfig(),
    now: () => "2026-07-16T12:00:00.000Z",
    newId: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
  });
}

describe("CaseService", () => {
  it("creates a case and applies a transition", async () => {
    const svc = service();
    const created = await svc.einreichen({
      scope,
      actor: { actorId: "citizen.1", rolle: "buerger" },
      leistungId: "musterantrag",
      antragsdaten: {
        anliegen: { kategorie: "standard" },
      },
      idempotencyKey: "idem-1",
      requestId: "req-1",
    });
    expect(created.status).toBe("eingegangen");
    expect(created.berechnung?.betrag).toBe(50);

    const next = await svc.uebergang({
      scope,
      actor: { actorId: "cw.1", rolle: "sachbearbeitung" },
      caseId: created.id,
      eventName: "start-pruefung",
      expectedVersion: created.version!,
      idempotencyKey: "idem-2",
      requestId: "req-2",
    });
    expect(next.status).toBe("in_pruefung");
  });

  it("rejects vierAugen when same actor", async () => {
    const svc = service();
    const created = await svc.einreichen({
      scope,
      actor: { actorId: "citizen.1", rolle: "buerger" },
      leistungId: "musterantrag",
      antragsdaten: { anliegen: { kategorie: "standard" } },
      idempotencyKey: "idem-a",
      requestId: "req-a",
    });
    const pruefung = await svc.uebergang({
      scope,
      actor: { actorId: "cw.1", rolle: "sachbearbeitung" },
      caseId: created.id,
      eventName: "start-pruefung",
      expectedVersion: created.version!,
      idempotencyKey: "idem-b",
      requestId: "req-b",
    });
    await expect(
      svc.uebergang({
        scope,
        actor: { actorId: "cw.1", rolle: "sachbearbeitung" },
        caseId: created.id,
        eventName: "festsetzen",
        expectedVersion: pruefung.version!,
        idempotencyKey: "idem-c",
        requestId: "req-c",
      }),
    ).rejects.toMatchObject({
      code: "unprocessable",
    } satisfies Partial<CaseServiceError>);
  });

  it("is idempotent on einreichen", async () => {
    const svc = service();
    const a = await svc.einreichen({
      scope,
      actor: { actorId: "citizen.1", rolle: "buerger" },
      leistungId: "musterantrag",
      antragsdaten: { anliegen: { kategorie: "express" } },
      idempotencyKey: "same-key",
      requestId: "req-1",
    });
    const b = await svc.einreichen({
      scope,
      actor: { actorId: "citizen.1", rolle: "buerger" },
      leistungId: "musterantrag",
      antragsdaten: { anliegen: { kategorie: "express" } },
      idempotencyKey: "same-key",
      requestId: "req-2",
    });
    expect(a.id).toBe(b.id);
    expect(a.version).toBe(b.version);
  });

  it("rejects stale expectedVersion", async () => {
    const svc = service();
    const created = await svc.einreichen({
      scope,
      actor: { actorId: "citizen.1", rolle: "buerger" },
      leistungId: "musterantrag",
      antragsdaten: {},
      idempotencyKey: "idem-v",
      requestId: "req-v",
    });
    await expect(
      svc.uebergang({
        scope,
        actor: { actorId: "cw.1", rolle: "sachbearbeitung" },
        caseId: created.id,
        eventName: "start-pruefung",
        expectedVersion: 99,
        idempotencyKey: "idem-stale",
        requestId: "req-stale",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});
