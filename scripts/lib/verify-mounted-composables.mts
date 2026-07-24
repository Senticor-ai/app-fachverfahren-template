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
// SIGNATUR (HMAC): der Spine-Verify-Key liegt CHOS-seitig und ist hier NICHT verfügbar — die Prüfung ist rein
// strukturell (in-toto-Hülle, earned ≡ Achsen, Frische). Die HMAC-Echtheits-Prüfung ist ein bewusster Folgeschritt
// (Verify-Key mit dem KIT teilen → verifySignature durchreichen); das ist im Report ehrlich markiert.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  istMeshManifest,
  verifyMeshCertStructure,
  type MeshComposableManifest,
} from "../../packages/public-sector-sdk/src/composable-cert-verify.ts";

const ENABLED_STATUS = new Set(["certified", "active"]);

const sha256 = (buf: Buffer): string =>
  createHash("sha256").update(buf).digest("hex");

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
    });
    if (v.earned) {
      verdient++;
      if (!v.signatureChecked)
        hinweise.push(
          `${id}: Verdikt strukturell VERDIENT (earned ≡ Achsen, Frische ok) — HMAC-Signatur ungeprüft (Verify-Key nicht geteilt; Folgeschritt).`,
        );
    }

    // FAIL-CLOSED: deklariert enabled ⇒ verdientes Verdikt Pflicht.
    if (ENABLED_STATUS.has(status) && !v.earned) {
      fehler.push(
        `${id} ist deklariert „${status}" (enabled), aber ohne VERDIENTES Eval-Verdikt — ${
          certVorhanden
            ? v.reasons.join("; ")
            : `kein ${id}.cert.json vorhanden`
        } (deklariert ≠ verdient, fail-closed).`,
      );
    }
  }

  return { ok: fehler.length === 0, checked, verdient, fehler, hinweise };
}
