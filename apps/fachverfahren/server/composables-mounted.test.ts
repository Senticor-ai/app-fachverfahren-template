// composables-mounted.test — die AUTO-MONTAGE der CHOS-emittierten Manifeste (Ziel-1 S8, „CHOS GENERATES").
// Deckt: Fallback ohne `.chos/` (Muster bleiben), Auto-Mount emittierter Manifeste, Anspruch ∧ Beleg (certified
// ohne Verdikt → candidate; MIT verdientem Verdikt → enabled), fail-closed reject (über-autonom → übersprungen).
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { istEnabled } from "@senticor/public-sector-sdk";
import {
  COMPOSABLE_CERT_PREDICATE_TYPE,
  IN_TOTO_STATEMENT_TYPE,
  type CertScenarioRecord,
  type MeshCertFile,
  type MeshComposableManifest,
} from "@senticor/public-sector-sdk";
import {
  loadMountedComposables,
  resolveMountedComposablesDir,
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

/** Ein VERDIENTES Verdikt-Artefakt für ein Manifest (Digest gegen die kanonischen Manifest-Bytes). */
function earnedCert(id: string, manifestSha256: string): MeshCertFile {
  return {
    schemaVersion: 1,
    statement: {
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
    },
    signature: { alg: "HMAC-SHA256", sig: "deadbeef" },
  };
}

/** Schreibt ein Manifest (+ optional sein Verdikt) in ein Mount-Verzeichnis; gibt den Manifest-Digest zurück. */
function writeManifest(
  dir: string,
  m: MeshComposableManifest,
  opts: { withEarnedCert?: boolean } = {},
): string {
  const bytes = serialize(m);
  writeFileSync(path.join(dir, `${m.id}.json`), bytes);
  const digest = sha256(bytes);
  if (opts.withEarnedCert) {
    writeFileSync(
      path.join(dir, `${m.id}.cert.json`),
      serialize(earnedCert(m.id, digest)),
    );
  }
  return digest;
}

describe("loadMountedComposables — Auto-Mount der CHOS-Manifeste", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "chos-mesh-"));
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
});
