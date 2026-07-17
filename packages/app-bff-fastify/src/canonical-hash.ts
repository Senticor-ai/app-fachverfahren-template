// canonical-hash — deterministische Serialisierung + SHA-256 für BEWEISKRÄFTIGE Integritäts-Token.
//
// Hier (im Server-Paket) und NICHT im SDK, weil `node:crypto` node-only ist und das SDK browser-neutral
// bleiben soll. Der eingefrorene Verwaltungsakt wird beim Erlass (cases.ts) gehasht, der Bürger-Abruf
// (buerger.ts) verifiziert per Recompute — beides server-seitig.
//
// WARUM KANONISCH: `JSON.stringify` ist NICHT deterministisch (Schlüssel-Reihenfolge folgt der Einfüge-
// Reihenfolge), und ein jsonb-Roundtrip normalisiert Objekte. Ein Hash über nicht-kanonische Bytes liesse
// sich nach dem Roundtrip nicht reproduzieren und beweist deshalb NICHTS. `canonicalizeJson` sortiert die
// Objekt-Schlüssel rekursiv → derselbe Wert ergibt IMMER dieselben Bytes und denselben Hash.
import { createHash } from "node:crypto";

type JsonWert =
  string | number | boolean | null | JsonWert[] | { [key: string]: JsonWert };

/** Kanonische JSON-Serialisierung: Objekt-Schlüssel rekursiv sortiert; Array-Reihenfolge bleibt (sie ist
 *  bedeutungstragend). Byte-stabil über Serialisierungs-Roundtrips. */
export function canonicalizeJson(wert: unknown): string {
  return JSON.stringify(sortiereRekursiv(wert as JsonWert));
}

function sortiereRekursiv(wert: JsonWert): JsonWert {
  if (Array.isArray(wert)) return wert.map(sortiereRekursiv);
  if (wert !== null && typeof wert === "object") {
    const sortiert: { [key: string]: JsonWert } = {};
    for (const schluessel of Object.keys(wert).sort()) {
      // `?? null` fängt den noUncheckedIndexedAccess-Fall ab (ein Schlüssel aus Object.keys existiert
      // stets, aber der Compiler weiss das nicht) — und ein echter `undefined`-Wert wird zu `null`,
      // was in JSON ohnehin die einzige darstellbare Abwesenheit ist.
      sortiert[schluessel] = sortiereRekursiv(wert[schluessel] ?? null);
    }
    return sortiert;
  }
  return wert;
}

/** SHA-256 eines Strings als Hex. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Der kanonische Hash eines Werts — die eine Wahrheit für „Hash über die Bytes". */
export function canonicalSha256(wert: unknown): string {
  return sha256Hex(canonicalizeJson(wert));
}
