// verify-mounted-composables.test — das gehärtete check:composables-Gate für gemountete Stellen (Ziel-1 S7):
// Anspruch ∧ Beleg, fail-closed. Baut echte Manifest/Verdikt-Fixtures in einem Temp-Verzeichnis.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyMountedComposables } from "./lib/verify-mounted-composables.mts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mounted-composables-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const IN_TOTO = "https://in-toto.io/Statement/v1";
const PREDICATE =
  "https://chos.senticor.ai/attestations/composable-certification/v1";

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
  opts: { allPass?: boolean; baselineOk?: boolean; earned?: boolean } = {},
): void {
  const allPass = opts.allPass ?? true;
  const scenarios = [
    { id: "f", axis: "faehigkeit", ok: allPass },
    { id: "w", axis: "wissen", ok: allPass },
    { id: "v", axis: "verantwortung", ok: allPass },
  ];
  const earned = opts.earned ?? ((opts.baselineOk ?? true) && allPass);
  const file = {
    schemaVersion: 1,
    statement: {
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
    },
    signature: { alg: "HMAC-SHA256", sig: "deadbeef" },
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

  it("akzeptiert ein certified Manifest MIT verdientem, frischem Verdikt", () => {
    const digest = writeManifest("sachbearbeitung", "certified");
    writeCert("sachbearbeitung", digest, { allPass: true });
    const r = verifyMountedComposables(dir);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(1);
    expect(r.verdient).toBe(1);
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
