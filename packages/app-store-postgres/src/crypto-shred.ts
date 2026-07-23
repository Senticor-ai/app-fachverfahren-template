// crypto-shred — die KRYPTO-SHREDDING-Kernprimitive (DSGVO-Löschkonzept, Issue #55, ADR-0005). Personenbezogene
// Nutzlast wird pro BETROFFENEM mit einem eigenen Schlüssel verschlüsselt versiegelt (AES-256-GCM). „Löschen"
// i. S. v. Art. 17 = den Schlüssel VERNICHTEN (`shredSubject`): der Ciphertext bleibt Byte-für-Byte erhalten
// (die append-only-/hash-verkettete Audit-Wahrheit #53 bleibt intakt), ist aber irreversibel unlesbar. Genau
// diese Eigenschaft macht Krypto-Shredding ketten-kompatibel — im Gegensatz zur Hard-Deletion (bricht die Kette).
//
// Bewusst store-unabhängige Primitive (KeyManagement-Naht + reine seal/open-Funktionen): die konkrete KMS-Wahl
// (echtes HSM/Cloud-KMS) ist ein Folge-Slice; die Verdrahtung in die Store-Payloads (case.data / Audit-payload)
// ebenso. Node-Crypto (kein Browser). Alles deterministisch prüfbar.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Ein versiegelter Payload — selbstbeschreibend (Algorithmus + IV + Ciphertext + Auth-Tag), base64. Der Hash
 *  einer Audit-Zeile deckt DIESE Bytes ab (Ciphertext/Tag), NICHT den Klartext → Shredding ändert den Hash nicht. */
export interface SealedPayload {
  alg: "AES-256-GCM";
  ivB64: string;
  ciphertextB64: string;
  tagB64: string;
}

/** Schlüssel-Verwaltung je Betroffenem (KMS-Naht). Erzeugung bei Anlage, VERNICHTUNG bei Löschung. Ein realer
 *  Adapter (HSM/Cloud-KMS) implementiert dieselbe Naht; der Store konsumiert nur den Vertrag. */
export interface KeyManagement {
  /** Holt den Schlüssel des Betroffenen oder legt ihn an (zum VERSIEGELN). */
  getOrCreateKey(subjectId: string): Buffer;
  /** Holt den Schlüssel NUR, wenn er (noch) existiert — nie anlegend (zum ENTSIEGELN). */
  getKey(subjectId: string): Buffer | undefined;
  /** Vernichtet den Schlüssel unwiderruflich (= Krypto-Shredding). */
  destroyKey(subjectId: string): void;
  hasKey(subjectId: string): boolean;
}

/** In-Memory-KMS für DEV/Tests — volle Semantik ohne externes KMS. Schlüssel = 256 Bit Zufall. */
export class InMemoryKeyManagement implements KeyManagement {
  private readonly keys = new Map<string, Buffer>();
  getOrCreateKey(subjectId: string): Buffer {
    let key = this.keys.get(subjectId);
    if (!key) {
      key = randomBytes(32);
      this.keys.set(subjectId, key);
    }
    return key;
  }
  getKey(subjectId: string): Buffer | undefined {
    return this.keys.get(subjectId);
  }
  destroyKey(subjectId: string): void {
    this.keys.delete(subjectId);
  }
  hasKey(subjectId: string): boolean {
    return this.keys.has(subjectId);
  }
}

/** Der Klartext ist krypto-geshreddet (Schlüssel vernichtet) — irreversibel unlesbar. Vom Store als „gelöscht"
 *  (Art. 17) zu behandeln; die Bytes/Audit-Zeile bleiben für die Kette bestehen. */
export class PayloadShreddedError extends Error {
  constructor(readonly subjectId: string) {
    super(
      `payload for subject ${subjectId} is crypto-shredded (key destroyed)`,
    );
    this.name = "PayloadShreddedError";
  }
}

/** Versiegelt Klartext für einen Betroffenen (AES-256-GCM, frischer 96-Bit-IV je Aufruf). */
export function sealForSubject(
  kms: KeyManagement,
  subjectId: string,
  plaintext: string,
): SealedPayload {
  const key = kms.getOrCreateKey(subjectId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    alg: "AES-256-GCM",
    ivB64: iv.toString("base64"),
    ciphertextB64: ciphertext.toString("base64"),
    tagB64: cipher.getAuthTag().toString("base64"),
  };
}

/** Entsiegelt — wirft `PayloadShreddedError`, wenn der Schlüssel vernichtet wurde (geshreddet), und einen
 *  Auth-Fehler, wenn der Ciphertext/Tag manipuliert ist (GCM-Integrität). Legt NIE einen Schlüssel neu an. */
export function openSealed(
  kms: KeyManagement,
  subjectId: string,
  sealed: SealedPayload,
): string {
  const key = kms.getKey(subjectId);
  if (!key) throw new PayloadShreddedError(subjectId);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(sealed.ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * KRYPTO-SHREDDING (Art. 17 / §84 SGB X): vernichtet den Schlüssel des Betroffenen → ALLE seine versiegelten
 * Payloads werden irreversibel unlesbar, OHNE einen Ciphertext oder eine Audit-Zeile zu verändern. Die
 * Hash-Kette (#53) bleibt damit verifizierbar. Die Löschung selbst ist als append-only Ereignis zu
 * protokollieren (Wer/Wann/Rechtsgrundlage/Umfang) — das macht der Aufrufer (Store/BFF), nicht diese Primitive.
 */
export function shredSubject(kms: KeyManagement, subjectId: string): void {
  kms.destroyKey(subjectId);
}
