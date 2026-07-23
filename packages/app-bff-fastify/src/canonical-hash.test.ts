import { describe, expect, it } from "vitest";
import {
  canonicalizeJson,
  canonicalSha256,
  sha256Hex,
} from "./canonical-hash.js";

describe("canonicalizeJson", () => {
  it("sortiert Objekt-Schlüssel rekursiv — verschiedene Einfüge-Reihenfolge, GLEICHE Bytes", () => {
    // Der Kern des Beweiswerts: ein jsonb-Roundtrip normalisiert die Schlüssel-Reihenfolge. Wäre der
    // Hash über nicht-kanonische Bytes gebildet, liesse er sich nach dem Roundtrip nicht reproduzieren.
    const a = { tenor: { betrag: 50, einheit: "EUR" }, issuedAt: "2026-01-01" };
    const b = { issuedAt: "2026-01-01", tenor: { einheit: "EUR", betrag: 50 } };
    expect(canonicalizeJson(a)).toBe(canonicalizeJson(b));
    expect(canonicalizeJson(a)).toBe(
      '{"issuedAt":"2026-01-01","tenor":{"betrag":50,"einheit":"EUR"}}',
    );
  });

  it("bewahrt die Array-Reihenfolge (sie ist bedeutungstragend)", () => {
    expect(canonicalizeJson({ positionen: [3, 1, 2] })).toBe(
      '{"positionen":[3,1,2]}',
    );
  });
});

describe("canonicalSha256", () => {
  it("ergibt für kanonisch gleiche Werte denselben Hash — unabhängig von der Schlüssel-Reihenfolge", () => {
    expect(canonicalSha256({ b: 1, a: 2 })).toBe(
      canonicalSha256({ a: 2, b: 1 }),
    );
  });

  it("ändert sich, sobald sich ein Wert ändert (Manipulation ist erkennbar)", () => {
    expect(canonicalSha256({ tenor: { betrag: 50 } })).not.toBe(
      canonicalSha256({ tenor: { betrag: 5000 } }),
    );
  });

  it("ist ein reproduzierbarer SHA-256-Hex (64 Zeichen)", () => {
    const h = canonicalSha256({ x: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(sha256Hex('{"x":1}'));
  });
});
