// verify-mounted-composables.test — das gehärtete check:composables-Gate für gemountete Stellen (Ziel-1 S7):
// Anspruch ∧ Beleg, fail-closed. Baut echte Manifest/Verdikt-Fixtures in einem Temp-Verzeichnis.
import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  type KeyObject,
} from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMPOSABLE_CERT_SIGNATURE_DOMAIN,
  stableStringify,
} from "../packages/public-sector-sdk/src/composable-cert-verify.ts";
import { verifyMountedComposables } from "./lib/verify-mounted-composables.mts";

let dir: string;
// Der CHOS-Cert-Signer (asymmetrisch, Ed25519). Der ÖFFENTLICHE Key reist als well-known Datei; der PRIVATE bleibt
// „CHOS-seitig" (nur der Test-Signer kennt ihn) — genau wie in der Produktion.
let signerPriv: KeyObject;
let signerPub: string; // base64url-SPKI
const CERT_PUBKEY_FILE = "cert-signing-key.pub";
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mounted-composables-"));
  const kp = generateKeyPairSync("ed25519");
  signerPriv = kp.privateKey;
  signerPub = kp.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const IN_TOTO = "https://in-toto.io/Statement/v1";
const PREDICATE =
  "https://chos.senticor.ai/attestations/composable-certification/v1";

/** Schreibt den vertrauten ÖFFENTLICHEN Cert-Signing-Key als well-known Datei neben die Verdikte (Trust-Anker). */
function writePubkey(pub: string = signerPub): void {
  writeFileSync(path.join(dir, CERT_PUBKEY_FILE), pub + "\n");
}

/** Eine ECHTE Ed25519-Attestation über `sha256(stableStringify(statement))` unter der Cert-Domäne (CHOS-Signier-Pfad). */
function attestFor(
  statement: unknown,
  priv: KeyObject = signerPriv,
  pub: string = signerPub,
): { alg: string; publicKey: string; sig: string } {
  const digest = createHash("sha256").update(stableStringify(statement)).digest("hex");
  const sig = edSign(
    null,
    Buffer.from(`${COMPOSABLE_CERT_SIGNATURE_DOMAIN}\0${digest}`, "utf8"),
    priv,
  ).toString("base64url");
  return { alg: "Ed25519", publicKey: pub, sig };
}

function writeManifest(id: string, status: string): string {
  const manifest = {
    schemaVersion: 1,
    domain: "hundesteuer",
    id,
    titel: `Stelle ${id}`,
    art: "flaeche",
    akteur: "mensch",
    anspruch: [{ id: "kag", titel: "Kommunalabgabengesetz (KAG)" }],
    faehigkeiten: { ki: ["pruefung"], autonomie: "AAL-2" },
    certification: { status, cal: 2 },
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(path.join(dir, `${id}.json`), bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

function writeCert(
  id: string,
  digest: string,
  opts: {
    allPass?: boolean;
    baselineOk?: boolean;
    earned?: boolean;
    /** Attestation weglassen (unsigniert). */
    noAttestation?: boolean;
    /** Attestation mit einem FREMDEN Key signieren (Forge-Versuch). */
    forgeSigner?: { priv: KeyObject; pub: string };
    /** Attestation-Signatur nach dem Signieren zerstören (kaputte Signatur). */
    tamperSig?: boolean;
  } = {},
): void {
  const allPass = opts.allPass ?? true;
  const scenarios = [
    { id: "f", axis: "faehigkeit", ok: allPass },
    { id: "w", axis: "wissen", ok: allPass },
    { id: "v", axis: "verantwortung", ok: allPass },
  ];
  const earned = opts.earned ?? ((opts.baselineOk ?? true) && allPass);
  const statement = {
    _type: IN_TOTO,
    subject: [{ name: id, digest: { sha256: digest } }],
    predicateType: PREDICATE,
    predicate: {
      composableId: id,
      domain: "hundesteuer",
      scorerBaseline: { ok: opts.baselineOk ?? true },
      scenarios,
      earned,
      finishedAt: "2026-07-24T00:00:00.000Z",
    },
  };
  const attestation = opts.forgeSigner
    ? attestFor(statement, opts.forgeSigner.priv, opts.forgeSigner.pub)
    : attestFor(statement);
  if (opts.tamperSig) attestation.sig = "A".repeat(86);
  const file = {
    schemaVersion: 1,
    statement,
    signature: { alg: "HMAC-SHA256", sig: "deadbeef" },
    ...(opts.noAttestation ? {} : { attestation }),
  };
  writeFileSync(
    path.join(dir, `${id}.cert.json`),
    JSON.stringify(file, null, 2) + "\n",
  );
}

describe("verifyMountedComposables — Anspruch ∧ Beleg (fail-closed)", () => {
  it("ok, wenn das Verzeichnis fehlt (keine gemounteten Stellen)", () => {
    const r = verifyMountedComposables(path.join(dir, "gibt-es-nicht"));
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(0);
  });

  it("akzeptiert ein certified Manifest MIT verdientem, frischem, SIGNIERT-verifiziertem Verdikt", () => {
    writePubkey();
    const digest = writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", digest, { allPass: true });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(1);
    expect(r.verdient).toBe(1);
  });

  it("VERWIRFT ein certified Manifest mit GEFÄLSCHTER Cert-Signatur (kaputte Ed25519-Attestation)", () => {
    writePubkey();
    const digest = writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", digest, { allPass: true, tamperSig: true });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.verdient).toBe(0);
    expect(r.fehler.join(" ")).toContain("Cert-Signatur");
  });

  it("VERWIRFT ein certified Manifest, dessen Verdikt von einem FREMDEN Signer stammt (publicKey ≠ Trust-Anker)", () => {
    writePubkey(); // vertrauter Key
    const fremd = generateKeyPairSync("ed25519");
    const digest = writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", digest, {
      allPass: true,
      forgeSigner: {
        priv: fremd.privateKey,
        pub: fremd.publicKey.export({ format: "der", type: "spki" }).toString("base64url"),
      },
    });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.verdient).toBe(0);
  });

  it("KAPPT certified fail-closed, wenn KEIN vertrauenswürdiger Cert-Signing-Public-Key vorliegt (absent key)", () => {
    // Verdikt strukturell verdient, aber KEINE cert-signing-key.pub und kein ENV → Signatur nicht verifizierbar.
    const digest = writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", digest, { allPass: true });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.verdient).toBe(0);
    expect(r.fehler.join(" ")).toContain("Cert-Signing-Public-Key");
  });

  it("VERWIRFT ein certified Manifest mit verdientem aber UNSIGNIERTEM Verdikt (Attestation fehlt)", () => {
    writePubkey();
    const digest = writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", digest, { allPass: true, noAttestation: true });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.verdient).toBe(0);
  });

  it("VERWIRFT ein certified Manifest OHNE Verdikt-Artefakt", () => {
    writeManifest("sachbearbeitung", "certified");
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.fehler.join(" ")).toContain("kein sachbearbeitung.cert.json");
  });

  it("VERWIRFT ein active Manifest, dessen Verdikt eine Achse verfehlt (nicht verdient)", () => {
    const digest = writeManifest("aufsicht", "active");
    writeCert("aufsicht", digest, { allPass: false });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.verdient).toBe(0);
  });

  it("VERWIRFT ein veraltetes Verdikt (Manifest seit der Zertifizierung verändert → Digest-Mismatch)", () => {
    writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", "f".repeat(64), { allPass: true }); // falscher Digest
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.fehler.join(" ")).toContain("Manifest-Digest");
  });

  it("VERWIRFT ein Verdikt mit gelogenem earned-Flag (earned ≠ Achsen-Belege)", () => {
    const digest = writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", digest, { allPass: false, earned: true });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(false);
    expect(r.fehler.join(" ")).toContain("earned-Flag");
  });

  it("lässt ein candidate Manifest OHNE Verdikt zu (nicht enabled ⇒ kein Beleg-Zwang)", () => {
    writeManifest("entwurf", "candidate");
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(1);
    expect(r.verdient).toBe(0);
  });
});
