// evidence-ledger.test — der hash-verkettete Evidence-Ledger (Blueprint §15.3): Append kettet, verify erkennt
// Manipulation/Lücke, Ströme sind getrennt. Der tamper-evidente Nachweis agentischer Governance-Handlungen.
import { describe, expect, it } from "vitest";
import {
  InMemoryEvidenceLedger,
  verifyEvidenceChain,
  type EvidenceAppendInput,
} from "./evidence-ledger.js";

function input(over: Partial<EvidenceAppendInput> = {}): EvidenceAppendInput {
  return {
    evidenceId: `ev-${globalThis.crypto.randomUUID()}`,
    ledgerId: "composable:musterverfahren",
    tenantId: "t1",
    actorId: "sb.a",
    entryType: "spine.suggestion",
    summary: "Spine-Vorschlag pruefung erzeugt",
    refs: { composableId: "musterverfahren", aufgabe: "pruefung" },
    occurredAt: "2026-07-23T00:00:00.000Z",
    ...over,
  };
}

describe("InMemoryEvidenceLedger", () => {
  it("kettet Einträge (Genesis prevHash=null, dann prevHash = entryHash des Vorgängers)", async () => {
    const ledger = new InMemoryEvidenceLedger();
    const a = await ledger.append(input());
    const b = await ledger.append(input());
    expect(a.prevHash).toBeNull();
    expect(a.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.prevHash).toBe(a.entryHash);
    const chain = await ledger.verify({
      tenantId: "t1",
      ledgerId: "composable:musterverfahren",
    });
    expect(chain).toEqual({ valid: true, length: 2 });
  });

  it("trennt Ströme (verschiedene ledgerId / tenantId) sauber", async () => {
    const ledger = new InMemoryEvidenceLedger();
    await ledger.append(input({ ledgerId: "composable:a" }));
    await ledger.append(input({ ledgerId: "composable:b" }));
    expect(
      (await ledger.list({ tenantId: "t1", ledgerId: "composable:a" })).length,
    ).toBe(1);
    // Fremder Mandant sieht nichts.
    expect(
      (await ledger.list({ tenantId: "fremd", ledgerId: "composable:a" }))
        .length,
    ).toBe(0);
  });

  it("verify erkennt eine MANIPULATION (Inhalt geändert → entryHash re-hasht nicht)", async () => {
    const ledger = new InMemoryEvidenceLedger();
    const a = await ledger.append(input());
    const b = await ledger.append(input());
    // Manipuliere den summary des ersten Eintrags nachträglich.
    const manipuliert = [{ ...a, summary: "gefälscht" }, b];
    const r = verifyEvidenceChain(manipuliert);
    expect(r.valid).toBe(false);
    expect(r.brokenAt).toBe(0);
  });

  it("verify erkennt eine LÜCKE (mittlerer Eintrag entfernt → prevHash passt nicht)", async () => {
    const ledger = new InMemoryEvidenceLedger();
    const a = await ledger.append(input());
    await ledger.append(input()); // b — wird weggelassen
    const c = await ledger.append(input());
    const mitLuecke = [a, c];
    const r = verifyEvidenceChain(mitLuecke);
    expect(r.valid).toBe(false);
    expect(r.brokenAt).toBe(1);
  });

  it("der Vorschlagsinhalt wird NIE protokolliert — nur Metadaten (kein PII-Leak)", async () => {
    const ledger = new InMemoryEvidenceLedger();
    const a = await ledger.append(input());
    // refs trägt nur Referenzen, keine freien Inhalte.
    expect(JSON.stringify(a)).not.toContain("value");
    expect(a.refs).toEqual({
      composableId: "musterverfahren",
      aufgabe: "pruefung",
    });
  });
});
