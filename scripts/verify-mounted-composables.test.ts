// verify-mounted-composables.test — das gehärtete check:composables-Gate für gemountete Stellen (Ziel-1 S7):
// Anspruch ∧ Beleg, fail-closed. Baut echte Manifest/Verdikt-Fixtures in einem Temp-Verzeichnis.
import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  type KeyObject,
} from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BINDUNGS_FELDER,
  COMPOSABLE_CERT_SIGNATURE_DOMAIN,
  definitionsBytes,
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
  // DIE FIXTURE MUSS DIE FORMEL DES ERZEUGERS BENUTZEN, nicht die des Pruefers und nicht ihre eigene. Hier stand
  // `sha256(bytes)` — und weil der Pruefer damals dasselbe rechnete, war die Probe gruen, waehrend NULL von 44
  // echten Ausweisen durchkamen. Eine Fixture, die den Fehler des Pruefers teilt, prueft ihn nicht, sondern
  // bestaetigt ihn: sie beweist nur, dass zwei Kopien derselben falschen Rechnung uebereinstimmen.
  return createHash("sha256").update(definitionsBytes(manifest)).digest("hex");
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

// ── DIE MITGEREISTE STELLEN-VERFASSUNG (`<id>.governance.yaml`) ─────────────────────────────────────────────────────
// Eine Stelle reist mit ZWEI Darstellungen derselben versiegelten Ableitung: JSON im Manifest (was die App betreibt)
// und yaml daneben (was ein Mensch im aufnehmenden Haus liest und freigibt). Laufen sie auseinander, beträfe die
// menschliche Freigabe etwas anderes als der Betrieb — das ist der Fall, den diese Proben schließen. Die yaml wird
// GEPARST und ihr Siegel NACHGERECHNET; ein Text-Wächter (nur `digest:`-Zeile suchen) hätte die gefährlichste Probe
// (Body handgelockert, Siegel-Zeile stehen gelassen) durchgelassen — genau daran ist die erste Fassung gefallen.
describe("verifyMountedComposables — mitgereiste Stellen-Verfassung", () => {
  const GENERATOR = "chos:packages/fachverfahren/composable-governance-yaml.ts";
  const QUELL_DIGEST = "a".repeat(64);

  /** Baut Manifest + passende, versiegelte yaml — beide aus DERSELBEN Projektion (wie der CHOS-Emitter). */
  function writeMitVerfassung(id: string, opts: { entscheidung?: string } = {}): {
    projektion: Record<string, unknown>;
    yamlText: string;
  } {
    const ohneSiegel: Record<string, unknown> = {
      schemaVersion: 2,
      art: "projektion",
      composableId: id,
      domain: "hundesteuer",
      regime: { normativ: true },
      stellen: [{ id, art: "flaeche", akteur: "mensch" }],
      regeln: [{ id: "vier-augen", label: "Vier-Augen vor Bescheid", art: "verbindlich", class: "blocking", verify: "code" }],
      befugnis: { entscheidung: opts.entscheidung ?? "erlaesst-va", hitlPflicht: true },
      herkunft: { verfassungDigest: QUELL_DIGEST, revision: 4711 },
    };
    const digest = createHash("sha256").update(stableStringify(ohneSiegel)).digest("hex");
    const projektion = { ...ohneSiegel, digest };
    const manifest = {
      schemaVersion: 1,
      domain: "hundesteuer",
      id,
      titel: `Stelle ${id}`,
      art: "flaeche",
      akteur: "mensch",
      faehigkeiten: { ki: ["pruefung"], autonomie: "AAL-2" },
      certification: { status: "candidate", cal: 2 },
      governanceProjektion: projektion,
    };
    writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(manifest, null, 2) + "\n");
    const yamlText = [
      "# erzeugt, nicht geschrieben",
      `_meta:`,
      `  doNotEdit: erzeugt`,
      `  generatedBy: ${GENERATOR}`,
      `  sourceSha256: ${QUELL_DIGEST}`,
      yamlVon(projektion),
    ].join("\n");
    writeFileSync(path.join(dir, `${id}.governance.yaml`), yamlText);
    return { projektion, yamlText };
  }

  /** Minimaler, deterministischer yaml-Dump der Projektion (die Gate-Prüfung parst ihn mit `yaml`). */
  function yamlVon(o: unknown, einzug = ""): string {
    if (Array.isArray(o)) {
      return o.map((v) => `${einzug}- ${yamlVon(v, einzug + "  ").replace(/^\s+/, "")}`).join("\n");
    }
    if (o && typeof o === "object") {
      return Object.entries(o as Record<string, unknown>)
        .map(([k, v]) =>
          v && typeof v === "object"
            ? `${einzug}${k}:\n${yamlVon(v, einzug + "  ")}`
            : `${einzug}${k}: ${JSON.stringify(v)}`,
        )
        .join("\n");
    }
    return `${einzug}${JSON.stringify(o)}`;
  }

  const govFehler = (r: { fehler: string[] }): string[] =>
    r.fehler.filter((f) => /Verfassung|Herkunfts-Marker|Erzeuger/.test(f));

  it("ÜBERBLOCKUNG: eine unveränderte, passende Verfassung kommt durch", () => {
    writeMitVerfassung("sachbearbeitung");
    expect(govFehler(verifyMountedComposables(dir))).toEqual([]);
  });

  it("ÜBERBLOCKUNG: FEHLT die yaml (Alt-Bestand), blockt das Gate nicht — es weist nur hin", () => {
    writeManifest("ohne-verfassung", "candidate");
    const r = verifyMountedComposables(dir);
    expect(govFehler(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("eine im Body HANDGELOCKERTE Verfassung wird verworfen (ein Text-Wächter hätte sie durchgelassen)", () => {
    const { yamlText } = writeMitVerfassung("sachbearbeitung");
    writeFileSync(
      path.join(dir, "sachbearbeitung.governance.yaml"),
      yamlText.replace('"erlaesst-va"', '"keine"'),
    );
    expect(govFehler(verifyMountedComposables(dir)).join(" ")).toMatch(/nicht \(mehr\) die erzeugte/);
  });

  it("eine Verfassung mit FREMDEM Siegel wird verworfen", () => {
    const { yamlText } = writeMitVerfassung("sachbearbeitung");
    writeFileSync(
      path.join(dir, "sachbearbeitung.governance.yaml"),
      yamlText.replace(/digest: ".*"/, `digest: "${"0".repeat(64)}"`),
    );
    expect(govFehler(verifyMountedComposables(dir)).length).toBeGreaterThan(0);
  });

  it("eine HAND-GESCHRIEBENE Verfassung (ohne Erzeuger-Marker) ist kein gültiger Anspruch", () => {
    const { yamlText } = writeMitVerfassung("sachbearbeitung");
    writeFileSync(
      path.join(dir, "sachbearbeitung.governance.yaml"),
      yamlText.replace(GENERATOR, "mensch:von-hand"),
    );
    expect(govFehler(verifyMountedComposables(dir)).join(" ")).toMatch(/Erzeuger-Marker/);
  });

  it("ein _meta, das eine ANDERE Quell-Verfassung benennt, ist ein Widerspruch in sich", () => {
    const { yamlText } = writeMitVerfassung("sachbearbeitung");
    writeFileSync(
      path.join(dir, "sachbearbeitung.governance.yaml"),
      yamlText.replace(`sourceSha256: ${QUELL_DIGEST}`, `sourceSha256: ${"f".repeat(64)}`),
    );
    expect(govFehler(verifyMountedComposables(dir)).join(" ")).toMatch(/zwei Herkünfte/);
  });

  it("eine handgelockerte Projektion IM MANIFEST bricht ihr Siegel (der Betriebs-Pfad ist ebenso geschützt)", () => {
    writeMitVerfassung("sachbearbeitung");
    const p = path.join(dir, "sachbearbeitung.json");
    const roh = readFileSync(p, "utf8");
    writeFileSync(p, roh.replace('"hitlPflicht": true', '"hitlPflicht": false'));
    expect(verifyMountedComposables(dir).fehler.join(" ")).toMatch(/verändert/);
  });
});

// ── DIE IDENTITAET EINER DEFINITION — der Vertrag mit dem Erzeuger ────────────────────────────────────────────────
//
// GEMESSEN 2026-08-04 an 44 echten Manifest/Ausweis-Paaren eines CHOS-Arbeitsbereichs: die Frische-Pruefung dieses
// Hauses rechnete `sha256(Datei-Bytes)` und traf das Subjekt des Verdikts in 0 von 44 Faellen; mit der
// Identitaets-Formel sind es 44 von 44. Die Wirkung war STILL und total: `certified` fiel fail-closed auf
// `candidate`, und das sieht aus wie ein strenger Waechter, nicht wie ein Defekt.
//
// Diese Proben nageln den Vertrag fest, damit die Formel nicht zurueckfaellt. Sie pruefen die REGEL, nicht einen
// eingefrorenen Hash: ein eingefrorener Hash haette denselben Fehler bloss festgeschrieben.
describe("definitionsBytes — die Identitaet der Definition (Vertrag mit dem Erzeuger)", () => {
  const basis = {
    schemaVersion: 1,
    id: "sachbearbeitung",
    titel: "Sachbearbeitung",
    faehigkeiten: { ki: ["pruefen"], autonomie: "AAL-3" },
  } as const;

  it("entfernt die BINDUNGS-Felder — dieselbe Stelle in zwei Verfahren hat DIESELBE Identitaet", () => {
    const inGewerbe = { ...basis, domain: "gewerbesteuer", amt: "steuern", anspruch: [{ id: "recht:a" }], version: "aaa" };
    const inGrund = { ...basis, domain: "grundsteuer", amt: "finanzen", anspruch: [{ id: "recht:b" }], version: "bbb" };
    expect(definitionsBytes(inGewerbe)).toBe(definitionsBytes(inGrund));
    // GEGENPROBE: ein DEFINITIONS-Unterschied trennt sehr wohl — sonst waere die Formel blind statt teilend.
    expect(definitionsBytes({ ...inGewerbe, titel: "Andere Stelle" })).not.toBe(definitionsBytes(inGrund));
  });

  it("entfernt sie REKURSIV, nicht nur auf oberster Ebene", () => {
    const a = { ...basis, sub: [{ titel: "T", domain: "x", anspruch: [1] }] };
    const b = { ...basis, sub: [{ titel: "T", domain: "y", anspruch: [2] }] };
    expect(definitionsBytes(a)).toBe(definitionsBytes(b));
  });

  it("ist unabhaengig von der Feld-Reihenfolge der Quelle (kanonisch sortiert)", () => {
    expect(definitionsBytes({ b: 1, a: 2 })).toBe(definitionsBytes({ a: 2, b: 1 }));
  });

  it("haelt die BYTE-Form des Erzeugers: Einrueckung 2 und abschliessender Zeilenumbruch", () => {
    const bytes = definitionsBytes(basis);
    expect(bytes.endsWith("\n")).toBe(true);
    expect(bytes).toContain('\n  "id": "sachbearbeitung"');
    // Ein einziges Byte Abweichung macht JEDES Verdikt ungueltig — deshalb die Form ausdruecklich, nicht nebenbei.
    expect(bytes).toBe(JSON.stringify(JSON.parse(bytes), null, 2) + "\n");
  });

  it("fuehrt genau die fuenf Bindungs-Felder des Erzeugers", () => {
    // Waechst die Liste auf EINER Seite, weichen die Digests wieder ab. Die Kongruenz beider Repos prueft der
    // Erzeuger; hier steht der Bestand dieser Seite ausdruecklich, damit eine Aenderung nie unbemerkt bleibt.
    expect([...BINDUNGS_FELDER].sort()).toEqual(
      ["amt", "anspruch", "domain", "governanceProjektion", "version"],
    );
  });
});
