# ADR-0005: DSGVO-Löschkonzept — Krypto-Shredding + referenzielle Redaction über die append-only-/hash-verkettete Wahrheit

- Status: proposed
- Datum: 2026-07-21
- Bezug: Issue #55; baut auf ADR-0001 (append-only Fach-Audit) + der Audit-Hash-Kette (#53, `packages/app-store-postgres/src/audit-chain.ts`) auf.

## Kontext

Zwei Anforderungen stehen in DIREKTEM Konflikt und dieser Konflikt ist bislang nur benannt (ADR-0001:
„späteres ADR (DSGVO-Löschkonzept/Redaction)"), NICHT gelöst:

1. **Revisionssicherheit / Beweiskraft.** Das Fach-Audit (`app_audit_events`) ist append-only — DB-erzwungen
   (`REVOKE UPDATE/DELETE` + Trigger, ADR-0001) UND seit #53 kryptografisch **verkettet** (jedes Ereignis
   `entryHash` über kanonische Bytes inkl. `prevHash`). Eine physische Löschung/Änderung EINES Ereignisses
   bricht die Kette (tamper-evident — genau das ist gewollt) und zerstört die Beweiskette des Verfahrens.
2. **DSGVO Art. 17 (Recht auf Löschung) / §84 SGB X / §35 SGB I (Sozialgeheimnis).** Personenbezogene Daten
   müssen auf Verlangen bzw. nach Fristablauf gelöscht werden — differenziert je Datenkategorie (Art. 9
   besondere Kategorien, Sozialdaten gesondert), NICHT als globaler TTL.

Naive Hard-Deletion ist damit ausgeschlossen: sie bricht Kette + Beweis. Vorhanden sind bereits die Bausteine
`dataCategories: DataClassification[]` + `retentionPolicies` im Modulvertrag (`module-manifest.ts`) und der
`RecordsManagementPort` (Retention + Legal Hold) — aber KEINE Lösch-/Redaktions-DURCHSETZUNG.

## Entscheidung

Wir lösen den Konflikt über **Krypto-Shredding der personenbezogenen Nutzlast** + **referenzielle Redaction**,
differenziert je Datenkategorie und Record-Typ — so bleibt die append-only-/hash-verkettete WAHRHEIT
strukturell intakt, während die personenbezogenen Inhalte irreversibel unlesbar werden.

1. **Krypto-Shredding als Kern (Art. 17 chain-kompatibel).** Personenbezogene Nutzlast (Fall-`data`,
   Vermerk-/Wissens-Text, Audit-`payload`-Inhalte) wird pro **Betroffenem** mit einem eigenen Datenschlüssel
   verschlüsselt gespeichert. „Löschen" = **Schlüsselvernichtung** → die Bytes bleiben, sind aber irreversibel
   unlesbar. Der Audit-EINTRAG (und sein `entryHash`) bleibt bestehen → **die Hash-Kette (#53) bleibt
   verifizierbar**, die PII ist weg. Das ist die entscheidende Eigenschaft: Krypto-Shredding ist
   ketten-kompatibel, Hard-Deletion nicht.
2. **Referenzielle Redaction, nie destruktiv am Beweis.** Wo Werte nicht verschlüsselt vorlagen (Altbestand),
   wird der Wert durch einen deterministischen **Tombstone** ersetzt und die Löschung als NEUES append-only
   Ereignis (`data.redacted` / `data.erased`, mit Rechtsgrundlage + Umfang, OHNE die gelöschten Werte)
   protokolliert. Der Bescheid-VA (eingefroren + gehasht) wird NICHT redigiert (Bestandskraft) — seine
   Aufbewahrung folgt der gesetzlichen Frist, nicht Art. 17 (Art. 17 Abs. 3 b/e).
3. **Differenzierung je Datenkategorie/Record-Typ (kein globaler TTL).** Die `retentionPolicies` +
   `dataCategories` des Modulvertrags steuern, was wann wie gelöscht wird; Art. 9 / Sozialdaten (§35 SGB I)
   bekommen strengere Regeln. Durchsetzung über den `RecordsManagementPort` + den Fristen-Scanner (#58,
   zeitgetriebener Tick) als Auslöser für retention-basierte Löschläufe.
4. **Legal Hold sticht Löschung.** Ein aktiver Legal Hold (RecordsManagementPort) setzt Krypto-Shredding +
   Retention-Ablauf aus, bis er aufgehoben ist.
5. **Die Löschung ist selbst ein Verwaltungs-/Audit-Vorgang.** Jeder Shred/Redaction erzeugt ein append-only
   Ereignis (Wer/Wann/Rechtsgrundlage/Umfang) — auditierbar, ohne die gelöschten Inhalte zu wiederholen.

## Alternativen

| Alternative | Vorteile | Nachteile | Verdikt |
| --- | --- | --- | --- |
| **A — Krypto-Shredding** (gewählt, Kern) | ketten-/beweis-kompatibel; irreversibel; skaliert (Schlüssel je Betroffenem) | Schlüssel-Management (KMS/Rotation) ist neue Pflicht; Altbestand nicht verschlüsselt | **gewählt** (+ B für Altbestand) |
| **B — Redaction/Pseudonymisierung** (gewählt, ergänzend) | funktioniert für unverschlüsselten Altbestand; feldgenau | destruktiv am Klartext → muss referenziell + auditiert erfolgen, sonst Kettenbruch | **gewählt** für Altbestand/Einzelfelder |
| **C — reiner Retention-Ablauf** (gewählt, Auslöser) | gesetzeskonform für fristbasierte Löschung | deckt Art.-17-Einzelanträge nicht ab | **gewählt** als Auslöser, nicht allein |
| **D — Hard-Deletion der Audit-Zeile** | „echt gelöscht" | bricht Hash-Kette + Beweis; verletzt Revisionssicherheit | **abgelehnt** |
| **E — nichts tun (Status quo)** | kein Aufwand | DSGVO-Verstoß; Blocker für Produktivbetrieb | **abgelehnt** |

## Konsequenzen

**Neue Pflichten / Folgekosten:**
- **Schlüssel-Management je Betroffenem** (KMS-Naht/Port; Erzeugung bei Anlage, Vernichtung bei Löschung) —
  eigener Umsetzungs-Slice; die personenbezogene Nutzlast wandert hinter eine Verschlüsselungs-Naht.
- **Redaction-fähige Kanonisierung**: `audit-chain.ts` muss so bleiben, dass ein krypto-geshreddeter Payload
  den `entryHash` NICHT verändert (der Hash deckt den Ciphertext/Tombstone ab, nicht den Klartext) — sonst
  bräche Shredding die Kette. Prüfen + testen (gegen echten Shred gefahren).
- **RecordsManagementPort-Durchsetzung** (heute Vertrag) + Verdrahtung an den Fristen-Scanner (#58).
- **Lösch-Audit** (append-only `data.erased`/`data.redacted`) + Betroffenen-Auskunft/-Nachweis (Art. 15).

**Bewusst NICHT Teil dieser Entscheidung (Folge-ADRs/Slices):** die konkrete KMS-Wahl, die Migrations-Strategie
für unverschlüsselten Altbestand, die UI für Betroffenenrechte-Anträge.

**Betroffene Module:** `app-store-postgres` (Verschlüsselungs-Naht + Redaction), `public-sector-sdk`
(`module-manifest` retention/data-categories, `audit-chain`), `platform-contracts` (RecordsManagementPort/KMS),
BFF (Lösch-/Auskunfts-Routen).

## Offene Entscheidung (Sign-off nötig)

Dieser ADR ist `proposed`. Zur Abnahme braucht es die fachlich/rechtliche Bestätigung, dass **Krypto-Shredding
als irreversible Löschung i. S. v. Art. 17 akzeptiert** wird (herrschende Auffassung: ja, wenn der Schlüssel
nachweislich vernichtet + nicht wiederherstellbar ist) und dass die **Bescheid-Ausnahme** (Bestandskraft,
gesetzliche Aufbewahrung) so mitgetragen wird. Nach Abnahme folgt der Umsetzungs-Slice (KMS-Naht → Payload-
Verschlüsselung → Shred/Redaction-Läufe → Lösch-Audit).
