// composables-mounted.test — die AUTO-MONTAGE der CHOS-emittierten Manifeste (Ziel-1 S8, „CHOS GENERATES").
// Deckt: Fallback ohne `.chos/` (Muster bleiben), Auto-Mount emittierter Manifeste, Anspruch ∧ Beleg (certified
// ohne Verdikt → candidate; MIT verdientem Verdikt → enabled), fail-closed reject (über-autonom → übersprungen).
import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  type KeyObject,
} from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { definitionsBytes, istEnabled } from "@senticor/public-sector-sdk";
import {
  COMPOSABLE_CERT_PREDICATE_TYPE,
  COMPOSABLE_CERT_SIGNATURE_DOMAIN,
  IN_TOTO_STATEMENT_TYPE,
  stableStringify,
  type CertScenarioRecord,
  type MeshCertFile,
  type MeshComposableManifest,
} from "@senticor/public-sector-sdk";
import {
  loadMountedComposables,
  resolveMountedComposablesDir,
  resolveProjectRoot,
  MOUNTED_COMPOSABLES_REL,
} from "./composables-mounted.js";
import {
  createComposableRegistry,
  musterverfahrenComposable,
} from "./composables.config.js";

// Die EINE kanonische Serialisierung (byte-gleich zum CHOS-Emitter mesh-emit.writeComposableManifests) — der
// cert-Digest muss gegen EXAKT diese Bytes stimmen (Frische-Prüfung).
const serialize = (m: unknown): string => JSON.stringify(m, null, 2) + "\n";
const sha256 = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

function manifest(
  overrides: Partial<MeshComposableManifest> = {},
): MeshComposableManifest {
  return {
    schemaVersion: 1,
    domain: "musterverfahren",
    id: "sachbearbeitung",
    titel: "Sachbearbeitung / Fachdienst",
    art: "flaeche",
    flaeche: "sachbearbeitung",
    akteur: "mensch",
    governance: {
      regeln: [
        { id: "vier-augen", label: "Vier-Augen-Freigabe", art: "mit-freigabe" },
      ],
    },
    faehigkeiten: {
      ki: ["normbezogene-pruefung", "entscheidungs-entwurf"],
      autonomie: "AAL-2",
    },
    wissen: ["pack:kommunalabgaben"],
    evalSuiten: ["eval:sachbearbeitung"],
    certification: { status: "candidate", cal: 2 },
    ...overrides,
  };
}

const ALL_PASS: Pick<CertScenarioRecord, "id" | "axis" | "ok">[] = [
  { id: "faehigkeit-a", axis: "faehigkeit", ok: true },
  { id: "wissen-a", axis: "wissen", ok: true },
  { id: "verantwortung-a", axis: "verantwortung", ok: true },
];

// Der CHOS-Cert-Signer (asymmetrisch, Ed25519); der ÖFFENTLICHE Key reist als well-known Datei cert-signing-key.pub.
const CERT_PUBKEY_FILE = "cert-signing-key.pub";
let signerPriv: KeyObject;
let signerPub: string;

/** Schreibt den vertrauten ÖFFENTLICHEN Cert-Signing-Key als well-known Datei (Trust-Anker fürs KIT). */
function writePubkey(dir: string, pub: string = signerPub): void {
  writeFileSync(path.join(dir, CERT_PUBKEY_FILE), pub + "\n");
}

/** ECHTE Ed25519-Attestation über `sha256(stableStringify(statement))` unter der Cert-Domäne (CHOS-Signier-Pfad). */
function attestFor(
  statement: unknown,
  priv: KeyObject = signerPriv,
  pub: string = signerPub,
): { alg: string; publicKey: string; sig: string } {
  const digest = createHash("sha256")
    .update(stableStringify(statement))
    .digest("hex");
  const sig = edSign(
    null,
    Buffer.from(`${COMPOSABLE_CERT_SIGNATURE_DOMAIN}\0${digest}`, "utf8"),
    priv,
  ).toString("base64url");
  return { alg: "Ed25519", publicKey: pub, sig };
}

/** Ein VERDIENTES, SIGNIERTES Verdikt-Artefakt für ein Manifest (Digest gegen die kanonischen Manifest-Bytes). */
function earnedCert(id: string, manifestSha256: string): MeshCertFile {
  const statement = {
    _type: IN_TOTO_STATEMENT_TYPE,
    subject: [{ name: id, digest: { sha256: manifestSha256 } }],
    predicateType: COMPOSABLE_CERT_PREDICATE_TYPE,
    predicate: {
      composableId: id,
      domain: "musterverfahren",
      scorerBaseline: { ok: true },
      scenarios: ALL_PASS as CertScenarioRecord[],
      earned: true,
      finishedAt: "2026-07-24T00:00:00.000Z",
    },
  };
  return {
    schemaVersion: 1,
    statement,
    signature: { alg: "HMAC-SHA256", sig: "deadbeef" },
    attestation: attestFor(statement),
  };
}

/** Schreibt ein Manifest (+ optional sein signiertes Verdikt + Trust-Anker) in ein Mount-Verzeichnis; gibt den
 *  Manifest-Digest zurück. `certOverride` erlaubt gezielte Manipulation (z. B. Signatur zerstören). */
function writeManifest(
  dir: string,
  m: MeshComposableManifest,
  opts: {
    withEarnedCert?: boolean;
    withPubkey?: boolean;
    certOverride?: (cert: MeshCertFile) => MeshCertFile;
  } = {},
): string {
  const bytes = serialize(m);
  writeFileSync(path.join(dir, `${m.id}.json`), bytes);
  // DIESELBE FORMEL WIE DER ERZEUGER, nicht die Bytes der Datei. `0dd7140` hat den Mount von `sha256(raw)` auf
  // `sha256Hex(definitionsBytes(manifest))` umgestellt, weil das Verdikt-Subjekt sonst in 0 von 44 Faellen traf.
  // Diese Vorrichtung blieb bei der alten Formel zurueck — dann behauptet der Zeuge ein „verdientes Verdikt",
  // das der Mount zu Recht nicht anerkennt, und meldet einen Defekt, den es nicht gibt.
  const digest = sha256(definitionsBytes(m));
  if (opts.withPubkey ?? opts.withEarnedCert) writePubkey(dir);
  if (opts.withEarnedCert) {
    const cert = opts.certOverride
      ? opts.certOverride(earnedCert(m.id, digest))
      : earnedCert(m.id, digest);
    writeFileSync(path.join(dir, `${m.id}.cert.json`), serialize(cert));
  }
  return digest;
}

describe("loadMountedComposables — Auto-Mount der CHOS-Manifeste", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "chos-mesh-"));
    const kp = generateKeyPairSync("ed25519");
    signerPriv = kp.privateKey;
    signerPub = kp.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64url");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("fällt sauber auf leer zurück, wenn das Verzeichnis fehlt", () => {
    const load = loadMountedComposables(path.join(dir, "gibt-es-nicht"));
    expect(load.composables).toEqual([]);
    expect(load.uebersprungen).toEqual([]);
  });

  it("mountet ein emittiertes Manifest zu einem wohlgeformten AgenticComposable", () => {
    writeManifest(dir, manifest());
    const load = loadMountedComposables(dir);
    expect(load.composables).toHaveLength(1);
    const c = load.composables[0]!;
    expect(c.id).toBe("sachbearbeitung");
    expect(c.spine?.skills).toContain("normbezogene-pruefung");
    expect(c.spine?.autonomy).toBe("AAL-2"); // rechtsnah (HITL) ⇒ Advise
  });

  it("kappt deklariertes certified OHNE Verdikt auf candidate (Anspruch ∧ Beleg)", () => {
    writeManifest(
      dir,
      manifest({ certification: { status: "certified", cal: 3 } }),
    );
    const load = loadMountedComposables(dir);
    expect(load.composables).toHaveLength(1);
    expect(load.composables[0]!.status).toBe("candidate");
    expect(istEnabled(load.composables[0]!)).toBe(false);
  });

  it("lässt certified MIT verdientem, frischem Verdikt bestehen (enabled)", () => {
    writeManifest(
      dir,
      manifest({
        certification: {
          status: "certified",
          cal: 3,
          envelope: {
            outcome: "beschiedener Vorgang",
            evidence: "Audit-Kette",
          },
        },
      }),
      { withEarnedCert: true },
    );
    const load = loadMountedComposables(dir);
    expect(load.composables).toHaveLength(1);
    expect(load.composables[0]!.status).toBe("certified");
    expect(istEnabled(load.composables[0]!)).toBe(true);
  });

  it("kappt certified mit GEFÄLSCHTER Cert-Signatur auf candidate (fail-closed, kein Über-Claim)", () => {
    writeManifest(
      dir,
      manifest({ certification: { status: "certified", cal: 3 } }),
      {
        withEarnedCert: true,
        certOverride: (cert) => ({
          ...cert,
          attestation: { ...cert.attestation!, sig: "A".repeat(86) },
        }),
      },
    );
    const load = loadMountedComposables(dir);
    expect(load.composables).toHaveLength(1);
    expect(load.composables[0]!.status).toBe("candidate");
    expect(istEnabled(load.composables[0]!)).toBe(false);
  });

  it("kappt certified fail-closed, wenn KEIN vertrauenswürdiger Cert-Signing-Public-Key vorliegt (absent key)", () => {
    // Verdikt verdient+signiert, aber cert-signing-key.pub NICHT geschrieben ⇒ Signatur unverifizierbar ⇒ candidate.
    writeManifest(
      dir,
      manifest({ certification: { status: "certified", cal: 3 } }),
      { withEarnedCert: true, withPubkey: false },
    );
    const load = loadMountedComposables(dir);
    expect(load.composables).toHaveLength(1);
    expect(load.composables[0]!.status).toBe("candidate");
    expect(istEnabled(load.composables[0]!)).toBe(false);
  });

  it("überspringt ein über-autonomes rechtsnahes Manifest fail-closed (kein stilles Kappen)", () => {
    writeManifest(
      dir,
      manifest({
        id: "ueber-autonom",
        faehigkeiten: { ki: ["subsumtion"], autonomie: "AAL-4" },
      }),
    );
    const load = loadMountedComposables(dir);
    expect(load.composables).toHaveLength(0);
    expect(load.uebersprungen).toHaveLength(1);
    expect(load.uebersprungen[0]!.file).toBe("ueber-autonom.json");
  });

  it("attachiert Herkunft registry-mount (inkl. Quelle) aus der Mount-Provenienz (`<id>.mount.json`)", () => {
    writeManifest(dir, manifest(), { withEarnedCert: true });
    writeFileSync(
      path.join(dir, "sachbearbeitung.mount.json"),
      serialize({
        schemaVersion: 1,
        composableId: "sachbearbeitung",
        version: "2.1.0",
        recordHash: "abc123",
        quelle: [
          {
            verbundId: "verbund-nord",
            tenant: "musterverfahren-amt",
            publishedAt: "2026-07-20T10:00:00.000Z",
          },
        ],
        mountedAt: "2026-07-24T08:00:00.000Z",
      }),
    );
    const c = loadMountedComposables(dir).composables[0]!;
    expect(c.herkunft).toEqual({
      art: "registry-mount",
      version: "2.1.0",
      recordHash: "abc123",
      mountedAt: "2026-07-24T08:00:00.000Z",
      quelle: [
        {
          verbundId: "verbund-nord",
          tenant: "musterverfahren-amt",
          publishedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
  });

  it("attachiert Herkunft lokal-abgeleitet, wenn keine Mount-Provenienz daneben liegt", () => {
    writeManifest(dir, manifest());
    const c = loadMountedComposables(dir).composables[0]!;
    expect(c.herkunft).toEqual({ art: "lokal-abgeleitet" });
  });

  it("fällt bei malformter/inkongruenter Mount-Provenienz auf lokal-abgeleitet zurück (nie geraten, nie geworfen)", () => {
    writeManifest(dir, manifest());
    // kaputtes JSON
    writeFileSync(
      path.join(dir, "sachbearbeitung.mount.json"),
      "{ das ist kein json",
    );
    expect(loadMountedComposables(dir).composables[0]!.herkunft).toEqual({
      art: "lokal-abgeleitet",
    });

    // wohlgeformt, aber auf eine ANDERE Stelle bezogen (inkongruent) ⇒ keine fremde Herkunft raten
    writeFileSync(
      path.join(dir, "sachbearbeitung.mount.json"),
      serialize({ composableId: "eine-andere-stelle", recordHash: "x" }),
    );
    expect(loadMountedComposables(dir).composables[0]!.herkunft).toEqual({
      art: "lokal-abgeleitet",
    });
  });

  it("ignoriert Nachbardateien (Verdikt/Provenienz/fremd) — nur Manifeste zählen", () => {
    writeManifest(dir, manifest(), { withEarnedCert: true });
    writeFileSync(
      path.join(dir, "sachbearbeitung.mount.json"),
      serialize({ composableId: "sachbearbeitung", recordHash: "x" }),
    );
    writeFileSync(path.join(dir, "README.md"), "kein Manifest");
    const load = loadMountedComposables(dir);
    expect(load.composables).toHaveLength(1);
    expect(load.uebersprungen).toEqual([]);
  });
});

describe("createComposableRegistry — generierte Wahrheit ersetzt die Muster", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "chos-mesh-reg-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("nutzt die Muster-Composables, wenn kein Mount-Verzeichnis existiert (Fallback)", () => {
    const reg = createComposableRegistry({
      MOUNTED_COMPOSABLES_DIR: path.join(dir, "leer"),
    });
    expect(reg.get(musterverfahrenComposable.id)).toBeDefined();
  });

  it("MOUNTET die emittierten Manifeste und ersetzt die Muster, wenn `.chos/` gefüllt ist", () => {
    const sub = path.join(dir, "composables");
    mkdirSync(sub, { recursive: true });
    writeManifest(sub, manifest(), { withEarnedCert: true });
    const reg = createComposableRegistry({ MOUNTED_COMPOSABLES_DIR: sub });
    expect(reg.get("sachbearbeitung")).toBeDefined();
    // Die Muster sind ERSETZT (kein Vermischen) — die generierte Wahrheit gewinnt.
    expect(reg.get(musterverfahrenComposable.id)).toBeUndefined();
  });

  it("resolveMountedComposablesDir ehrt die Env-Override", () => {
    expect(
      resolveMountedComposablesDir({ MOUNTED_COMPOSABLES_DIR: "/tmp/x" }),
    ).toBe(path.resolve("/tmp/x"));
  });

  // ── E4: die Auflösung darf NICHT am Prozess-CWD haengen ────────────────────────────────────────────────
  it("resolveProjectRoot findet die Wurzel AUFWAERTS (Start aus einem Unterverzeichnis)", () => {
    const wurzel = path.join(dir, "e4-wurzel");
    const tief = path.join(wurzel, "apps", "fachverfahren");
    mkdirSync(path.join(wurzel, MOUNTED_COMPOSABLES_REL), { recursive: true });
    mkdirSync(tief, { recursive: true });
    expect(resolveProjectRoot(tief, {})).toBe(wurzel);
    expect(resolveMountedComposablesDir({}, tief)).toBe(
      path.join(wurzel, MOUNTED_COMPOSABLES_REL),
    );
  });

  it("resolveProjectRoot: ohne .chos zaehlt die Workspace-Wurzel (pnpm-workspace.yaml)", () => {
    const wurzel = path.join(dir, "e4-ws");
    const tief = path.join(wurzel, "apps", "fachverfahren");
    mkdirSync(tief, { recursive: true });
    writeFileSync(
      path.join(wurzel, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*\n",
    );
    expect(resolveProjectRoot(tief, {})).toBe(wurzel);
  });

  it("resolveProjectRoot: APP_PROJECT_ROOT gewinnt (explizit vor Heuristik)", () => {
    expect(resolveProjectRoot(dir, { APP_PROJECT_ROOT: "/tmp/explizit" })).toBe(
      path.resolve("/tmp/explizit"),
    );
  });

  it("ARCHETYP-BRUCH: eine Stelle, die entgegen ihrem Archetyp entscheidet, wird BENANNT — und mountet trotzdem", () => {
    // `buerger` ist der Initiator: er entscheidet nichts. Hier erlaesst er einen Verwaltungsakt.
    writeManifest(
      dir,
      manifest({
        id: "buerger",
        flaeche: "buerger",
        befugnis: { entscheidung: "erlaesst-va", hitlPflicht: false },
      } as never),
    );
    const load = loadMountedComposables(dir);
    // KEIN Wurf, KEIN Ueberspringen: ein Bruch darf eine laufende Anwendung nicht abschalten.
    expect(load.composables.map((c) => c.id)).toEqual(["buerger"]);
    expect(load.uebersprungen).toEqual([]);
    expect(load.archetypBrueche).toHaveLength(1);
    expect(load.archetypBrueche[0]!.id).toBe("buerger");
    expect(load.archetypBrueche[0]!.bruch).toMatch(/ist kein initiator mehr/);
  });

  it("ARCHETYP-BRUCH: eine zum Archetyp passende Stelle erzeugt KEINEN Befund (kein Falsch-Blocker)", () => {
    writeManifest(
      dir,
      manifest({
        befugnis: { entscheidung: "erlaesst-va", hitlPflicht: true },
      } as never),
    );
    expect(loadMountedComposables(dir).archetypBrueche).toEqual([]);
  });

  it("ARCHETYP-BRUCH erreicht die NAHT: createComposableRegistry meldet ihn (sonst waere der Waechter selbst verwaist)", () => {
    writeManifest(
      dir,
      manifest({
        id: "buerger",
        flaeche: "buerger",
        befugnis: { entscheidung: "erlaesst-va", hitlPflicht: false },
      } as never),
    );
    const meldungen: string[] = [];
    const reg = createComposableRegistry(
      { MOUNTED_COMPOSABLES_DIR: dir },
      (m) => meldungen.push(m),
    );
    expect(reg.get("buerger")).toBeDefined(); // gemountet, nicht abgeschaltet
    expect(
      meldungen.some(
        (m) => m.includes("ARCHETYP-BRUCH") && m.includes("buerger"),
      ),
    ).toBe(true);
  });

  it("E3/E4: leerer Mount faellt EHRLICH zurueck (der Rueckfall wird benannt, nicht verschwiegen)", () => {
    const meldungen: string[] = [];
    const reg = createComposableRegistry(
      { MOUNTED_COMPOSABLES_DIR: path.join(dir, "gibt-es-gar-nicht") },
      (m) => meldungen.push(m),
    );
    expect(reg.get(musterverfahrenComposable.id)).toBeDefined();
    expect(meldungen.some((m) => m.includes("Rückfall auf die"))).toBe(true);
    expect(meldungen.some((m) => m.includes("gibt-es-gar-nicht"))).toBe(true);
  });
});
