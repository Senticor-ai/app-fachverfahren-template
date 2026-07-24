// verify-mounted-composables — die HÄRTUNG des check:composables-Gates für GEMOUNTETE Stellen (Ziel-1 S7).
// Ein Composable, das aus einem CHOS-Mesh-Manifest (`.chos/mesh/composables/<id>.json`) in die App gemountet wird,
// darf NUR dann „certified"/„active" (enabled) sein, wenn ein GÜLTIGES, VERDIENTES Eval-Verdikt daneben liegt
// (`<id>.cert.json`) — und dieses Verdikt wird STRUKTURELL NACHGERECHNET (earned ≡ Achsen-Belege, Subjekt-Kongruenz,
// Manifest-Frische), das mitgereiste earned-Flag zählt nie allein. „Evals AUSGEFÜHRT statt length>0": das Gate glaubt
// dem deklarierten Status nicht, es verlangt den Beleg. FAIL-CLOSED: deklariert certified/active ohne verdienten
// Beleg ⇒ FEHLER.
//
// REIN + STRIP-TYPES-SICHER: importiert NUR das self-contained `composable-cert-verify` (keine composable.js-Kette),
// damit `check-composables.mts` es über `node --experimental-strip-types` laden kann. Die volle Mapper-Runde
// (Manifest → AgenticComposable via assertComposable) prüft die vitest-Suite (composable-manifest.test.ts).
//
// SIGNATUR (ASYMMETRISCH, Ed25519): CHOS signiert das Verdikt mit einem Cert-Signing-Key und lässt den ÖFFENTLICHEN
// Verify-Key als well-known Datei `cert-signing-key.pub` neben den Verdikten mitreisen (bzw. via ENV
// CHOS_CERT_SIGNING_PUBKEY). Dieses Gate löst den vertrauten PUBLIC Key auf und prüft die Attestation fail-closed:
// ein deklariert enabled Composable ist NUR mit VERDIENTEM UND signatur-verifiziertem Verdikt „verdient". Fehlt der
// vertraute Key (kein cert-signing-key.pub / kein ENV), bleibt die Signatur ungeprüft ⇒ certified/active wird
// fail-closed als nicht-verdient behandelt (kein Über-Claim ohne Authentizitäts-Beleg).
import { createHash, createPublicKey, verify as ed25519Verify } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  istMeshManifest,
  verifyMeshCertStructure,
  type MeshComposableManifest,
} from "../../packages/public-sector-sdk/src/composable-cert-verify.ts";

const ENABLED_STATUS = new Set(["certified", "active"]);

/** Well-known Dateiname des vertrauten ÖFFENTLICHEN Cert-Signing-Keys (Spiegel CHOS COMPOSABLE_CERT_PUBKEY_FILE). */
const CERT_PUBKEY_FILE = "cert-signing-key.pub";

const sha256 = (buf: Buffer): string =>
  createHash("sha256").update(buf).digest("hex");

/** node:crypto-Primitive für den PURE-Package-Injektions-Seam (die Sicherheits-Logik lebt in verifyMeshCertStructure). */
const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");
const verifyEd25519 = (
  publicKey: string,
  domain: string,
  digestHex: string,
  signature: string | undefined,
): boolean => {
  if (!signature || typeof publicKey !== "string") return false;
  try {
    const pub = createPublicKey({ key: Buffer.from(publicKey, "base64url"), format: "der", type: "spki" });
    if (pub.asymmetricKeyType !== "ed25519") return false;
    return ed25519Verify(null, Buffer.from(`${domain}\0${digestHex}`, "utf8"), pub, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
};

/** Löst den VERTRAUTEN Cert-Signing-Public-Key auf: ENV CHOS_CERT_SIGNING_PUBKEY (der stärkere, operator-gepinnte
 *  Anker) → sonst die well-known Datei `cert-signing-key.pub` neben den Verdikten. Fehlt beides ⇒ null (Signatur
 *  bleibt ungeprüft; certified wird dann fail-closed gekappt). */
function resolveTrustedCertKey(dir: string): string | null {
  const env = process.env.CHOS_CERT_SIGNING_PUBKEY;
  if (env && env.trim()) return env.trim();
  try {
    const s = readFileSync(path.join(dir, CERT_PUBKEY_FILE), "utf8").trim();
    return s || null;
  } catch {
    return null;
  }
}

export interface MountedComposableReport {
  ok: boolean;
  /** Anzahl geprüfter (wohlgeformter) Mesh-Manifeste. */
  checked: number;
  /** Anzahl davon, die ein verdientes Verdikt tragen. */
  verdient: number;
  fehler: string[];
  hinweise: string[];
}

/** Der deklarierte Status eines Manifests (lower-cased, ungetrimmt-tolerant); fehlt er → "draft". */
function declaredStatus(manifest: MeshComposableManifest): string {
  const raw = manifest.certification?.status;
  return typeof raw === "string" && raw.trim()
    ? raw.trim().toLowerCase()
    : "draft";
}

/**
 * verifyMountedComposables — scannt `dir` (Default `.chos/mesh/composables`) nach Manifest/Verdikt-Paaren und erzwingt
 * Anspruch ∧ Beleg. Fehlt das Verzeichnis, ist der Report leer-ok (die generierte App muss keine gemounteten
 * Composables haben — das Gate gilt NUR für die, die da sind). Jeder `<id>.cert.json` wird ausgelassen (es ist ein
 * Verdikt, kein Manifest).
 */
export function verifyMountedComposables(dir: string): MountedComposableReport {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  let checked = 0;
  let verdient = 0;

  if (!existsSync(dir)) {
    return { ok: true, checked: 0, verdient: 0, fehler: [], hinweise: [] };
  }

  const trusted = resolveTrustedCertKey(dir);

  const entries = readdirSync(dir).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".cert.json"),
  );

  for (const file of entries) {
    const manifestPath = path.join(dir, file);
    let raw: Buffer;
    let parsed: unknown;
    try {
      raw = readFileSync(manifestPath);
      parsed = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      fehler.push(
        `${file}: unlesbar/kein JSON (${e instanceof Error ? e.message : String(e)})`,
      );
      continue;
    }
    if (!istMeshManifest(parsed)) {
      // Keine Mesh-Manifest-Datei (fremd) — überspringen, nicht werten.
      continue;
    }
    const manifest = parsed;
    const id = manifest.id.trim();
    checked++;

    const status = declaredStatus(manifest);
    const certPath = path.join(dir, `${id}.cert.json`);
    let certParsed: unknown = null;
    const certVorhanden = existsSync(certPath);
    if (certVorhanden) {
      try {
        certParsed = JSON.parse(readFileSync(certPath, "utf8"));
      } catch (e) {
        fehler.push(
          `${id}: Verdikt-Artefakt unlesbar/kein JSON (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    }

    const v = verifyMeshCertStructure(certParsed, {
      composableId: id,
      manifestSha256: sha256(raw),
      certSigningPublicKey: trusted,
      sha256Hex,
      verifyEd25519,
    });
    // BELEGT = strukturell verdient UND kryptografisch signatur-verifiziert (Ed25519 gegen den vertrauten PUBLIC Key).
    const belegt = v.earned && v.signatureChecked;
    if (belegt) verdient++;
    else if (v.earned && !v.signatureChecked && certVorhanden) {
      hinweise.push(
        `${id}: Verdikt strukturell VERDIENT (earned ≡ Achsen, Frische ok), aber Signatur UNGEPRÜFT — ${
          trusted
            ? "Attestation fehlt/ungültig gegen den vertrauten Cert-Signing-Public-Key"
            : `kein vertrauenswürdiger Cert-Signing-Public-Key (weder ${CERT_PUBKEY_FILE} neben den Verdikten noch ENV CHOS_CERT_SIGNING_PUBKEY)`
        }; certified/active wird fail-closed als nicht-verdient behandelt.`,
      );
    }

    // FAIL-CLOSED: deklariert enabled ⇒ VERDIENTES UND signatur-verifiziertes Verdikt Pflicht.
    if (ENABLED_STATUS.has(status) && !belegt) {
      fehler.push(
        `${id} ist deklariert „${status}" (enabled), aber ohne VERDIENTES, signatur-verifiziertes Eval-Verdikt — ${
          !certVorhanden
            ? `kein ${id}.cert.json vorhanden`
            : v.reasons.length
              ? v.reasons.join("; ")
              : !trusted
                ? `kein vertrauenswürdiger Cert-Signing-Public-Key (${CERT_PUBKEY_FILE}/ENV CHOS_CERT_SIGNING_PUBKEY fehlt) ⇒ Signatur nicht verifizierbar`
                : "Signatur der Attestation nicht verifiziert"
        } (deklariert ≠ verdient, fail-closed).`,
      );
    }
  }

  return { ok: fehler.length === 0, checked, verdient, fehler, hinweise };
}
