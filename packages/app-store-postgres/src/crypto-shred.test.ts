// crypto-shred.test — die Krypto-Shredding-Primitive (#55, ADR-0005): Roundtrip, ketten-kompatibler Shred
// (Bytes bleiben, Klartext irreversibel weg), GCM-Integrität, Subjekt-Isolation.
import { describe, expect, it } from "vitest";
import {
  InMemoryKeyManagement,
  openSealed,
  PayloadShreddedError,
  sealForSubject,
  shredSubject,
} from "./crypto-shred.js";

describe("crypto-shred", () => {
  it("Roundtrip: versiegeln → entsiegeln → Klartext identisch", () => {
    const kms = new InMemoryKeyManagement();
    const sealed = sealForSubject(kms, "subject-1", "Sozialdaten: Musterfall");
    expect(sealed.alg).toBe("AES-256-GCM");
    // Der Ciphertext trägt den Klartext NICHT im Klartext.
    expect(
      Buffer.from(sealed.ciphertextB64, "base64").toString("utf8"),
    ).not.toContain("Musterfall");
    expect(openSealed(kms, "subject-1", sealed)).toBe(
      "Sozialdaten: Musterfall",
    );
  });

  it("SHRED (Art. 17): Schlüssel vernichten → Klartext irreversibel unlesbar, Bytes UNVERÄNDERT (Kette intakt)", () => {
    const kms = new InMemoryKeyManagement();
    const sealed = sealForSubject(kms, "subject-2", "PII");
    const bytesVorher = JSON.stringify(sealed);

    shredSubject(kms, "subject-2");

    // Der versiegelte Payload (die Audit-Bytes) ist NICHT angefasst → entryHash unverändert → Kette intakt.
    expect(JSON.stringify(sealed)).toBe(bytesVorher);
    // Aber der Klartext ist weg — auch ein neuer Schlüssel für dieselbe subjectId hilft NICHT.
    expect(() => openSealed(kms, "subject-2", sealed)).toThrow(
      PayloadShreddedError,
    );
  });

  it("ein NEU angelegter Schlüssel nach Shred kann den alten Ciphertext NICHT entsiegeln (kein versehentliches Wiederbeleben)", () => {
    const kms = new InMemoryKeyManagement();
    const sealed = sealForSubject(kms, "s", "geheim");
    shredSubject(kms, "s");
    // getOrCreateKey würde einen NEUEN Schlüssel anlegen — mit dem der alte Tag/Ciphertext nicht aufgeht.
    kms.getOrCreateKey("s");
    expect(() => openSealed(kms, "s", sealed)).toThrow(); // GCM-Auth schlägt fehl
  });

  it("GCM-Integrität: manipulierter Ciphertext → Entsiegeln wirft", () => {
    const kms = new InMemoryKeyManagement();
    const sealed = sealForSubject(kms, "s", "unverfälscht");
    const tampered = {
      ...sealed,
      ciphertextB64: Buffer.from("manipuliert").toString("base64"),
    };
    expect(() => openSealed(kms, "s", tampered)).toThrow();
  });

  it("Subjekt-Isolation: der Schlüssel eines anderen Betroffenen entsiegelt nicht", () => {
    const kms = new InMemoryKeyManagement();
    const sealed = sealForSubject(kms, "subject-a", "A-Daten");
    // subject-b hat einen eigenen Schlüssel → kann A nicht lesen (GCM-Auth mit falschem Key schlägt fehl).
    kms.getOrCreateKey("subject-b");
    expect(() => openSealed(kms, "subject-b", sealed)).toThrow();
  });
});
