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
import {
  createHash,
  createPublicKey,
  verify as ed25519Verify,
} from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  definitionsBytes,
  istMeshManifest,
  verifyMeshCertStructure,
  verifyMeshGovernanceProjektion,
  type MeshComposableManifest,
} from "../../packages/public-sector-sdk/src/composable-cert-verify.ts";

/** Der Erzeuger-Marker in der mitgereisten Stellen-Verfassung — byte-gleich zur CHOS-Seite
 *  (`COMPOSABLE_GOVERNANCE_YAML_GENERATOR`). Eine hand-geschriebene yaml trägt ihn nicht. */
const GOVERNANCE_YAML_GENERATOR =
  "chos:packages/fachverfahren/composable-governance-yaml.ts";

const ENABLED_STATUS = new Set(["certified", "active"]);

/** Well-known Dateiname des vertrauten ÖFFENTLICHEN Cert-Signing-Keys (Spiegel CHOS COMPOSABLE_CERT_PUBKEY_FILE). */
const CERT_PUBKEY_FILE = "cert-signing-key.pub";

// `sha256(Buffer)` hatte nach der Umstellung auf `definitionsBytes` keinen Aufrufer mehr — geloescht, damit
// kein byte-basierter Rueckfall neben der Identitaets-Formel stehenbleibt.

/** node:crypto-Primitive für den PURE-Package-Injektions-Seam (die Sicherheits-Logik lebt in verifyMeshCertStructure). */
const sha256Hex = (s: string): string =>
  createHash("sha256").update(s).digest("hex");
const verifyEd25519 = (
  publicKey: string,
  domain: string,
  digestHex: string,
  signature: string | undefined,
): boolean => {
  if (!signature || typeof publicKey !== "string") return false;
  try {
    const pub = createPublicKey({
      key: Buffer.from(publicKey, "base64url"),
      format: "der",
      type: "spki",
    });
    if (pub.asymmetricKeyType !== "ed25519") return false;
    return ed25519Verify(
      null,
      Buffer.from(`${domain}\0${digestHex}`, "utf8"),
      pub,
      Buffer.from(signature, "base64url"),
    );
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

/**
 * pruefeMitgereisteVerfassung — die yaml wird GEPARST und ihr Siegel NACHGERECHNET, nicht ihr Text durchsucht.
 *
 * WARUM NICHT TEXT: ein Text-Wächter, der nur die `digest:`-Zeile und den Erzeuger-Marker sucht, fängt genau den
 * gefährlichsten Fall NICHT — jemand schreibt im Body `entwurf-only` statt `erlaesst-va` und lässt Siegel-Zeile und
 * Marker stehen. Dann liest das aufnehmende Haus eine WEICHERE Verfassung, als die App tatsächlich betreibt: die
 * menschliche Freigabe beträfe etwas anderes als der Betrieb. Genau dafür ist das Siegel da — also wird es benutzt.
 *
 * Geprüft wird (fail-closed):
 *   1. die yaml parst überhaupt;
 *   2. der `_meta`-Block trägt den ERZEUGER-Marker (eine hand-geschriebene Verfassung ist kein gültiger Anspruch);
 *   3. `_meta.sourceSha256` benennt DIESELBE Quell-Verfassung wie die Projektion selbst (keine zwei Herkünfte);
 *   4. das SIEGEL der geparsten Projektion rechnet nach (jede Handänderung im Body bricht es);
 *   5. es ist DASSELBE Siegel wie im Manifest (die zwei Darstellungen sagen dasselbe).
 *
 * GRENZE, ehrlich: der BYTE-Vergleich gegen die kanonische Neu-Erzeugung (der auch reine Kosmetik im Kopf fängt)
 * bleibt beim Erzeuger — ihn hier zu wiederholen hieße, den Renderer ein zweites Mal zu bauen, und ein zweiter
 * Renderer wäre genau die zweite Wahrheit, die dieses Artefakt vermeiden soll. Semantisch ist hier nichts offen:
 * alles, was die AUSSAGE der Verfassung verändert, bricht das Siegel.
 */
function pruefeMitgereisteVerfassung(
  id: string,
  yamlPath: string,
  manifestDigest: string,
): string[] {
  let doc: unknown;
  try {
    doc = parseYaml(readFileSync(yamlPath, "utf8"));
  } catch (e) {
    return [
      `${id}: die mitgereiste Stellen-Verfassung (${id}.governance.yaml) ist nicht lesbar/kein gültiges YAML (${e instanceof Error ? e.message : String(e)}) — fail-closed.`,
    ];
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return [
      `${id}: die mitgereiste Stellen-Verfassung enthält kein Governance-Dokument (fail-closed).`,
    ];
  }
  const { _meta, ...projektion } = doc as Record<string, unknown>;
  const meta =
    _meta && typeof _meta === "object" && !Array.isArray(_meta)
      ? (_meta as Record<string, unknown>)
      : {};
  const fehler: string[] = [];
  if (meta["generatedBy"] !== GOVERNANCE_YAML_GENERATOR) {
    fehler.push(
      `${id}: die mitgereiste Stellen-Verfassung trägt keinen gültigen Erzeuger-Marker (_meta.generatedBy) — sie ist nicht erzeugt, sondern geschrieben worden. Eine Verfassung wird nicht von Hand in ein Composable gelegt.`,
    );
  }
  const v = verifyMeshGovernanceProjektion(projektion, {
    composableId: id,
    sha256Hex,
  });
  if (!v.vorhanden || !v.intakt) {
    fehler.push(
      `${id}: die mitgereiste Stellen-Verfassung (${id}.governance.yaml) ist nicht (mehr) die erzeugte — ${v.gruende.join("; ")}`,
    );
    return fehler;
  }
  const herkunft = (projektion["herkunft"] ?? {}) as Record<string, unknown>;
  if (meta["sourceSha256"] !== herkunft["verfassungDigest"]) {
    fehler.push(
      `${id}: der Herkunfts-Marker (_meta.sourceSha256) benennt eine ANDERE Quell-Verfassung als die Projektion selbst — die Datei behauptet zwei Herkünfte (fail-closed).`,
    );
  }
  if (v.digest !== manifestDigest) {
    fehler.push(
      `${id}: die mitgereiste Stellen-Verfassung und das Manifest daneben tragen VERSCHIEDENE Siegel — es ist nicht bestimmbar, unter welcher Governance die Stelle betrieben wird (Zweitdatenstand, fail-closed).`,
    );
  }
  return fehler;
}

/** „Governance-Beleg fehlt": eine Stelle FÜHRT eine Projektion, das Verdikt bezeugt sie aber nicht. Führt sie gar
 *  keine (Alt-Bestand), gibt es nichts zu bezeugen — dann ist auch kein Hinweis fällig (kein Rauschen). */
function belegtGovernanceFehlt(
  governanceAttested: boolean,
  projektionVorhanden: boolean,
): boolean {
  return projektionVorhanden && !governanceAttested;
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

    // ── DIE MITGEREISTE VERFASSUNG (`<id>.governance.yaml`) — zur BAUZEIT geprüft. ────────────────────────────
    // Die Stelle reist mit ZWEI Darstellungen derselben versiegelten Ableitung: JSON im Manifest (was die App
    // liest) und yaml daneben (was ein Mensch im aufnehmenden Haus liest und freigibt). Laufen sie auseinander,
    // ist nicht bestimmbar, unter welcher Governance die Stelle betrieben wird — und die menschliche Freigabe
    // beträfe etwas anderes als der Betrieb. Das ist ein BAU-Fehler, kein Laufzeit-Zustand.
    // GRENZE, ehrlich benannt: dieses Gate rechnet das SIEGEL der JSON-Projektion voll nach und prüft an der yaml
    // die zwei Zeilen, die der Renderer deterministisch erzeugt (Erzeuger-Marker + genau dieser digest). Der
    // vollständige BYTE-Vergleich gegen die kanonische Neu-Erzeugung liegt beim Erzeuger (CHOS
    // verifyComposableGovernanceYaml) — ihn hier zu wiederholen hieße, den Renderer ein zweites Mal zu bauen,
    // und ein zweiter Renderer wäre genau die zweite Wahrheit, die dieses Artefakt vermeidet.
    const gov = verifyMeshGovernanceProjektion(manifest.governanceProjektion, {
      composableId: id,
      sha256Hex,
    });
    if (gov.vorhanden && !gov.intakt) {
      fehler.push(`${id}: ${gov.gruende.join("; ")}`);
    }
    if (gov.intakt && gov.digest) {
      const yamlPath = path.join(dir, `${id}.governance.yaml`);
      if (!existsSync(yamlPath)) {
        hinweise.push(
          `${id}: die Stelle führt eine versiegelte Governance-Projektion, aber keine lesbare Stellen-Verfassung (${id}.governance.yaml) daneben — im aufnehmenden Haus kann niemand prüfen, was er betreibt.`,
        );
      } else {
        fehler.push(...pruefeMitgereisteVerfassung(id, yamlPath, gov.digest));
      }
    }

    const v = verifyMeshCertStructure(certParsed, {
      composableId: id,
      // DIE IDENTITAET DER DEFINITION, nicht die Bytes der Datei — sonst passt das Subjekt des Verdikts nie
      // (gemessen: 0 von 44 Treffern). Dieselbe Formel wie beim Erzeuger, siehe definitionsBytes.
      manifestSha256: sha256Hex(definitionsBytes(manifest)),
      certSigningPublicKey: trusted,
      sha256Hex,
      verifyEd25519,
      // Das ZWEITE in-toto-Subjekt `<id>#governance`: das Verdikt gilt nur für exakt die Governance, unter der es
      // verdient wurde. `null` = keine (gültige) Projektion vorhanden ⇒ ein Verdikt, das eine bezeugt, wird ungültig.
      governanceSha256: gov.intakt && gov.digest ? gov.digest : null,
    });
    // Ein enabled Composable OHNE bezeugte Governance ist kein Fehler, aber eine ehrliche Lücke: sein Verdikt sagt
    // über die Verfassung, unter der es verdient wurde, nichts. Sichtbar machen statt still hinnehmen.
    if (
      ENABLED_STATUS.has(status) &&
      belegtGovernanceFehlt(v.governanceAttested, gov.vorhanden)
    ) {
      hinweise.push(
        `${id}: deklariert „${status}", aber das Verdikt bezeugt KEINE Governance (kein Subjekt „${id}#governance") — es ist nicht belegt, unter welcher Verfassung die Stelle zertifiziert wurde.`,
      );
    }
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
