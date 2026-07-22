// redaction — referenzielle REDACTION für unverschlüsselten Altbestand (DSGVO-Löschkonzept, Issue #55,
// ADR-0005, Option B). Komplement zum Krypto-Shredding (crypto-shred.ts, Option A für verschlüsselte
// Neubestände): wo personenbezogene Werte im KLARTEXT vorliegen (z. B. `case.data` vor Einführung der
// Verschlüsselungs-Naht), ersetzt eine Löschung die betroffenen Felder durch einen deterministischen
// TOMBSTONE — referenziell (die Struktur bleibt, der Wert geht), nie destruktiv an der append-only Audit-Kette.
//
// Reine Funktion (kein Store, injizierte Zeit): der Aufrufer (Store/BFF) patcht die zurückgegebenen Daten und
// protokolliert die Löschung als eigenes append-only Ereignis (`data.redacted`) mit Rechtsgrundlage + Umfang —
// OHNE die gelöschten Werte zu wiederholen. Der eingefrorene Bescheid-VA ist AUSGENOMMEN (Bestandskraft,
// Art. 17 Abs. 3 — gesetzliche Aufbewahrung); nur die lebende `data` wird redigiert.

/** Der Tombstone, der einen gelöschten personenbezogenen Wert ersetzt — selbstbeschreibend, ohne Klartext. */
export interface RedactionTombstone {
  redacted: true;
  at: string;
}

/** Ist ein Wert bereits ein Tombstone? (idempotente Redaction — doppeltes Löschen ändert nichts.) */
export function isTombstone(value: unknown): value is RedactionTombstone {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { redacted?: unknown }).redacted === true
  );
}

function tiefKlon(data: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

/**
 * Redigiert die angegebenen Punkt-Pfade (z. B. "antragsteller.vorname") in einer Kopie von `data`: vorhandene,
 * noch nicht getombstonete Werte werden durch einen Tombstone ersetzt. Gibt die redigierte Kopie + die
 * TATSÄCHLICH redigierten Pfade zurück (fehlende/bereits getombstonete Pfade zählen nicht). Rein, deterministisch.
 */
export function redactData(
  data: Record<string, unknown>,
  piiPaths: readonly string[],
  nowIso: string,
): { data: Record<string, unknown>; redacted: string[] } {
  const kopie = tiefKlon(data);
  const redacted: string[] = [];
  for (const pfad of piiPaths) {
    const teile = pfad.split(".").filter(Boolean);
    if (teile.length === 0) continue;
    let cursor: Record<string, unknown> = kopie;
    let vorhanden = true;
    for (let i = 0; i < teile.length - 1; i++) {
      const next = cursor[teile[i] as string];
      if (next && typeof next === "object" && !Array.isArray(next)) {
        cursor = next as Record<string, unknown>;
      } else {
        vorhanden = false;
        break;
      }
    }
    const blatt = teile[teile.length - 1] as string;
    if (!vorhanden || !(blatt in cursor) || isTombstone(cursor[blatt]))
      continue;
    cursor[blatt] = { redacted: true, at: nowIso } satisfies RedactionTombstone;
    redacted.push(pfad);
  }
  return { data: kopie, redacted };
}
