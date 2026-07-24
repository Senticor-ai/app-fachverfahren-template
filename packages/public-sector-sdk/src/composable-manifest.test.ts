// composable-manifest.test — der Mount-Mapper (Mesh-Manifest → AgenticComposable) + die reine Verdikt-Struktur-
// Prüfung. Deckt: generische Projektion, Spine-Governance (rechtsnah ⇒ AAL-2, Über-Autonomie wirft), Anspruch ∧
// Beleg (certified ohne verdientes Verdikt ⇒ auf candidate gekappt), earned ≡ nachgerechnete Achsen (kein blindes
// Vertrauen ins earned-Flag), Frische (Manifest-Digest).
import { describe, expect, it } from "vitest";
import {
  assertComposable,
  certificationReadiness,
  istEnabled,
} from "./composable.js";
import {
  effectiveComposableStatus,
  manifestSpineAufgaben,
  mapManifestToComposable,
  mapManifestWithProvenance,
} from "./composable-manifest.js";
import {
  COMPOSABLE_CERT_PREDICATE_TYPE,
  IN_TOTO_STATEMENT_TYPE,
  verifyMeshCertStructure,
  type CertScenarioRecord,
  type MeshCertFile,
  type MeshComposableManifest,
} from "./composable-cert-verify.js";

/** Ein realistisches, agentisches Manifest (Sachbearbeitungs-Fläche, HITL-Regel → rechtsnah). */
function manifest(
  overrides: Partial<MeshComposableManifest> = {},
): MeshComposableManifest {
  return {
    schemaVersion: 1,
    domain: "hundesteuer",
    id: "sachbearbeitung",
    titel: "Sachbearbeitung / Fachdienst",
    art: "flaeche",
    flaeche: "sachbearbeitung",
    akteur: "mensch",
    subComposables: [],
    anspruch: [
      { id: "kag", titel: "Kommunalabgabengesetz (KAG)", ubiquitaer: false },
    ],
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

/** Baut ein Verdikt-Artefakt mit gegebenen Szenario-Ergebnissen + baseline. */
function certFile(opts: {
  id: string;
  manifestSha256: string;
  scenarios: Pick<CertScenarioRecord, "id" | "axis" | "ok">[];
  baselineOk?: boolean;
  earned?: boolean;
}): MeshCertFile {
  const axesPass = (ax: string) => {
    const of = opts.scenarios.filter((s) => s.axis === ax);
    return of.length > 0 && of.every((s) => s.ok);
  };
  const earned =
    opts.earned ??
    ((opts.baselineOk ?? true) &&
      ["faehigkeit", "wissen", "verantwortung"].every(axesPass));
  return {
    schemaVersion: 1,
    statement: {
      _type: IN_TOTO_STATEMENT_TYPE,
      subject: [{ name: opts.id, digest: { sha256: opts.manifestSha256 } }],
      predicateType: COMPOSABLE_CERT_PREDICATE_TYPE,
      predicate: {
        composableId: opts.id,
        domain: "hundesteuer",
        scorerBaseline: { ok: opts.baselineOk ?? true },
        scenarios: opts.scenarios as CertScenarioRecord[],
        earned,
        finishedAt: "2026-07-24T00:00:00.000Z",
      },
    },
    signature: { alg: "HMAC-SHA256", sig: "deadbeef" },
  };
}

const ALL_PASS: Pick<CertScenarioRecord, "id" | "axis" | "ok">[] = [
  { id: "faehigkeit-a", axis: "faehigkeit", ok: true },
  { id: "wissen-zitatpflicht", axis: "wissen", ok: true },
  { id: "verantwortung-aal-grenze", axis: "verantwortung", ok: true },
];

describe("mapManifestToComposable — Mount-Mapper", () => {
  it("projiziert ein Manifest generisch auf einen wohlgeformten AgenticComposable", () => {
    const c = mapManifestToComposable(manifest());
    expect(() => assertComposable(c)).not.toThrow();
    expect(c.id).toBe("sachbearbeitung");
    expect(c.displayName).toContain("Sachbearbeitung");
    expect(c.spine?.skills).toContain("normbezogene-pruefung");
    expect(c.spine?.knowledgeDomains).toContain("hundesteuer");
    expect(c.spine?.knowledgeDomains).toContain("pack:kommunalabgaben");
    expect(c.assurance).toBe("CAL-2");
    expect(c.moduleId).toBe("sachbearbeitung");
  });

  it("behandelt eine HITL-Regel als rechtsnah und bleibt bei AAL-2 (KI berät, entscheidet nie)", () => {
    expect(manifestSpineAufgaben(manifest())).toEqual([
      "assistenz",
      "pruefung",
    ]);
    const c = mapManifestToComposable(manifest());
    expect(c.spine?.autonomy).toBe("AAL-2");
    expect(c.outcome.nichtScope).toContain(
      "autonome rechtsnahe Entscheidung (bleibt menschlich)",
    );
  });

  it("VERWIRFT ein über-autonomes rechtsnahes Manifest (fail-closed, kein stilles Kappen)", () => {
    const m = manifest({
      faehigkeiten: { ki: ["subsumtion"], autonomie: "AAL-4" },
    });
    expect(() => mapManifestToComposable(m)).toThrow();
  });

  it("mountet ein rein strukturelles Manifest ohne KI-Fähigkeiten als deterministisches Composable (ohne Spine)", () => {
    const m: MeshComposableManifest = {
      schemaVersion: 1,
      domain: "hundesteuer",
      id: "datenanbindung",
      titel: "Datenanbindung",
      art: "struktur",
      akteur: "beide",
      certification: { status: "active", cal: 1 },
    };
    const c = mapManifestToComposable(m, {
      attestation: { valid: true, earned: true },
    });
    expect(c.spine).toBeUndefined();
    expect(c.klasse).toBe("operations");
  });

  it("wirft bei einem Manifest ohne id/domain (fail-closed)", () => {
    expect(() =>
      mapManifestToComposable({
        id: "",
        domain: "x",
      } as MeshComposableManifest),
    ).toThrow();
    expect(() =>
      mapManifestToComposable({
        id: "x",
        domain: "",
      } as MeshComposableManifest),
    ).toThrow();
  });
});

describe("Anspruch ∧ Beleg — Status-Durchsetzung", () => {
  it("kappt deklariertes certified OHNE verdienten Beleg auf candidate (kein Über-Claim)", () => {
    const m = manifest({ certification: { status: "certified", cal: 3 } });
    expect(effectiveComposableStatus(m)).toBe("candidate");
    const { composable, provenance } = mapManifestWithProvenance(m);
    expect(composable.status).toBe("candidate");
    expect(istEnabled(composable)).toBe(false);
    expect(provenance.deklarierterStatus).toBe("certified");
    expect(provenance.beleg).toBe("deklariert");
    expect(provenance.ueberclaim).toBe(true);
  });

  it("lässt certified MIT verdientem Beleg bestehen (enabled) und erfüllt die certificationReadiness", () => {
    const m = manifest({
      certification: {
        status: "certified",
        cal: 3,
        envelope: { outcome: "beschiedener Vorgang", evidence: "Audit-Kette" },
      },
    });
    const c = mapManifestToComposable(m, {
      attestation: { valid: true, earned: true },
      owners: { capabilityOwner: "fachbereich", serviceOwner: "team" },
    });
    expect(c.status).toBe("certified");
    expect(istEnabled(c)).toBe(true);
    const r = certificationReadiness(c);
    expect(r.certifiable).toBe(true);
    expect(r.fehlend).toEqual([]);
  });
});

describe("verifyMeshCertStructure — reine Struktur-/Konsistenz-Prüfung", () => {
  const sha = "a".repeat(64);

  it("valid + earned bei wohlgeformtem Verdikt mit voller Achsen-Deckung + Digest-Match", () => {
    const cert = certFile({
      id: "sachbearbeitung",
      manifestSha256: sha,
      scenarios: ALL_PASS,
    });
    const v = verifyMeshCertStructure(cert, {
      composableId: "sachbearbeitung",
      manifestSha256: sha,
    });
    expect(v.valid).toBe(true);
    expect(v.earned).toBe(true);
    expect(v.signatureChecked).toBe(false); // ohne geteilten Key ehrlich ungeprüft
  });

  it("erkennt ein GELOGENES earned-Flag (earned ≠ nachgerechnete Achsen)", () => {
    const cert = certFile({
      id: "sachbearbeitung",
      manifestSha256: sha,
      scenarios: [
        { id: "faehigkeit-a", axis: "faehigkeit", ok: false }, // eine Achse fällt durch
        { id: "wissen-a", axis: "wissen", ok: true },
        { id: "verantwortung-a", axis: "verantwortung", ok: true },
      ],
      earned: true, // Behauptung widerspricht den Records
    });
    const v = verifyMeshCertStructure(cert, {
      composableId: "sachbearbeitung",
      manifestSha256: sha,
    });
    expect(v.valid).toBe(false);
    expect(v.earned).toBe(false);
    expect(v.reasons.join(" ")).toContain("earned-Flag");
  });

  it("erkennt ein veraltetes Verdikt (Manifest-Digest weicht ab)", () => {
    const cert = certFile({
      id: "sachbearbeitung",
      manifestSha256: sha,
      scenarios: ALL_PASS,
    });
    const v = verifyMeshCertStructure(cert, {
      composableId: "sachbearbeitung",
      manifestSha256: "b".repeat(64),
    });
    expect(v.valid).toBe(false);
    expect(v.reasons.join(" ")).toContain("Manifest-Digest");
  });

  it("verweigert ein inkongruentes Subjekt (Verdikt trägt eine andere Stelle)", () => {
    const cert = certFile({
      id: "andere-stelle",
      manifestSha256: sha,
      scenarios: ALL_PASS,
    });
    const v = verifyMeshCertStructure(cert, {
      composableId: "sachbearbeitung",
      manifestSha256: sha,
    });
    expect(v.valid).toBe(false);
  });

  it("prüft die HMAC-Signatur, wenn ein Verify-Key + Payload durchgereicht werden (fail-closed bei Bruch)", () => {
    const cert = certFile({
      id: "sachbearbeitung",
      manifestSha256: sha,
      scenarios: ALL_PASS,
    });
    const v = verifyMeshCertStructure(cert, {
      composableId: "sachbearbeitung",
      manifestSha256: sha,
      statementPayload: () => "payload",
      verifySignature: (_p, sig) => sig === "richtige-sig",
    });
    expect(v.signatureChecked).toBe(true);
    expect(v.valid).toBe(false); // Signatur „deadbeef" ≠ „richtige-sig"
  });

  it("fehlend/unlesbar ⇒ nicht valid, nicht earned (fail-closed)", () => {
    const v = verifyMeshCertStructure(null, {
      composableId: "sachbearbeitung",
    });
    expect(v.valid).toBe(false);
    expect(v.earned).toBe(false);
  });
});
