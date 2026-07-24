// composable-cert-verify — die KIT-seitige, REIN STRUKTURELLE Prüfung eines CHOS-Composable-Eval-Verdikts
// (`.chos/mesh/composables/<id>.cert.json`, Schreiber CHOS `composable-cert.ts`) und die Typen des Mesh-Manifests
// (`.chos/mesh/composables/<id>.json`, Schreiber CHOS `mesh-emit.writeComposableManifests`). Der Konsument einer
// zertifizierten Stelle darf dem `earned`-Flag NICHT blind glauben — er RECHNET die Achsen-Belege aus den
// Szenario-Records NACH (claim ∧ evidence AUCH innerhalb des Artefakts), prüft die in-toto-Hülle, die Subjekt-
// Kongruenz und — wenn er das Manifest hat — die Frische (der Manifest-Digest, gegen den zertifiziert wurde).
//
// EINE-WAHRHEIT-SPIEGEL: die Nachrechen-Logik (axesFromScenarios / earned) ist byte-gleich zur CHOS-Prüf-Wahrheit
// `verifyComposableCertFile` — der Konsument prüft nach DENSELBEN Regeln, nach denen der Emittent verdient hat.
//
// FAIL-CLOSED: fehlend/unlesbar/inkongruent/veraltet/in-sich-inkonsistent ⇒ NICHT valid ⇒ NICHT earned (kein Raten).
//
// SIGNATUR (HMAC): der Spine-Key liegt CHOS-seitig; dieses Repo hat ihn NICHT. Ohne einen injizierten
// `verifySignature`-Callback prüft diese Funktion die Signatur NICHT (das ist eine bewusste, ehrliche Grenze —
// `signatureChecked:false` reist im Ergebnis mit). Teilt der Betrieb den Verify-Schlüssel mit dem KIT, reicht er
// `verifySignature` + `statementPayload` durch und die HMAC-Echtheit fließt fail-closed ins Verdikt ein.
//
// REIN: keine relativen Runtime-Imports, kein I/O — damit dieses Modul sowohl im Paket-Build als auch direkt über
// `node --experimental-strip-types` (das precommit-Gate `check-composables.mts`) ladbar ist.

// ── Manifest-Typen (die EINE Identität einer zuständigen Stelle, CHOS mesh-derive/mesh-emit) ─────────────────────────
/** Eine Anspruchsgrundlage im Manifest (Rechtsgrundlage der Stelle). */
export interface MeshRechtsgrundlage {
  id: string;
  titel: string;
  ubiquitaer?: boolean;
  [k: string]: unknown;
}

/** Das adressierbare Composable-Manifest `.chos/mesh/composables/<id>.json` (schemaVersion 1). Nur die Felder, die der
 *  KIT-Mount projiziert; unbekannte Felder bleiben erhalten (index signature). */
export interface MeshComposableManifest {
  schemaVersion?: number;
  domain: string;
  id: string;
  titel?: string;
  art?: "flaeche" | "struktur";
  flaeche?: string;
  akteur?: string;
  subComposables?: unknown[];
  anspruch?: MeshRechtsgrundlage[];
  hinweis?: string;
  governance?: {
    regeln?: {
      id: string;
      label: string;
      art: "verbindlich" | "mit-freigabe" | "optional";
    }[];
  };
  faehigkeiten?: { ki?: string[]; autonomie?: string };
  wissen?: string[];
  evalSuiten?: string[];
  certification?: {
    status?: string;
    cal?: number;
    envelope?: {
      outcome?: string;
      data?: string;
      governance?: string;
      evidence?: string;
    };
  };
  [k: string]: unknown;
}

/** Ist der Wert ein plausibles Mesh-Manifest (id + domain vorhanden)? Trennt Manifeste von Nachbardateien (Verdikt etc.). */
export function istMeshManifest(
  value: unknown,
): value is MeshComposableManifest {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.trim().length > 0 &&
    typeof (value as { domain?: unknown }).domain === "string"
  );
}

// ── Verdikt-Typen (in-toto-Statement, Spiegel CHOS composable-cert.CertStatement) ────────────────────────────────────
export const IN_TOTO_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
export const COMPOSABLE_CERT_PREDICATE_TYPE =
  "https://chos.senticor.ai/attestations/composable-certification/v1";

export type CertAxis = "faehigkeit" | "wissen" | "verantwortung";
export const CERT_AXES: readonly CertAxis[] = [
  "faehigkeit",
  "wissen",
  "verantwortung",
];

export interface CertAxisVerdict {
  pass: boolean;
  scenarios: number;
  passed: number;
}

export interface CertScenarioRecord {
  id: string;
  axis: CertAxis;
  ok: boolean;
  [k: string]: unknown;
}

export interface MeshCertStatement {
  _type?: string;
  subject?: { name?: string; digest?: { sha256?: string } }[];
  predicateType?: string;
  predicate?: {
    composableId?: string;
    domain?: string;
    earned?: boolean;
    scorerBaseline?: { ok?: boolean };
    axes?: Record<string, CertAxisVerdict>;
    scenarios?: CertScenarioRecord[];
    finishedAt?: string;
    suiteRefs?: string[];
    [k: string]: unknown;
  };
}

export interface MeshCertFile {
  schemaVersion?: number;
  statement?: MeshCertStatement;
  signature?: { alg?: string; sig?: string };
  countersign?: { signer?: string; at?: string; sig?: string }[];
}

/** Achsen-Verdikt aus Szenario-Records — die EINE Rechen-Wahrheit (Spiegel CHOS axesFromScenarios): eine Achse besteht
 *  NUR, wenn sie ≥1 Szenario hat UND alle bestehen. REIN. */
export function recomputeAxes(
  scenarios: readonly Pick<CertScenarioRecord, "axis" | "ok">[],
): Record<CertAxis, CertAxisVerdict> {
  const axes = {} as Record<CertAxis, CertAxisVerdict>;
  for (const a of CERT_AXES) {
    const of = scenarios.filter((s) => s.axis === a);
    const passed = of.filter((s) => s.ok).length;
    axes[a] = {
      pass: of.length > 0 && passed === of.length,
      scenarios: of.length,
      passed,
    };
  }
  return axes;
}

export interface MeshCertVerification {
  /** Hülle wohlgeformt, Subjekt kongruent, Manifest-Digest aktuell (falls geprüft), earned-Flag ≡ nachgerechnete Achsen. */
  valid: boolean;
  /** VERDIENT: valid ∧ Baseline ok ∧ alle drei Achsen nachgerechnet bestanden. */
  earned: boolean;
  /** Wurde die HMAC-Signatur geprüft? (nur, wenn `verifySignature` + `statementPayload` übergeben wurden). */
  signatureChecked: boolean;
  countersigned: boolean;
  axes?: Record<CertAxis, CertAxisVerdict>;
  finishedAt?: string;
  reasons: string[];
}

export interface MeshCertVerifyOptions {
  composableId: string;
  /** SHA-256 (hex) der EXAKTEN Manifest-Bytes — für die Frische-Prüfung (Digest im Subjekt). `null`/undefined ⇒ Frische
   *  wird NICHT geprüft (der Aufrufer hat das Manifest nicht); das Verdikt kann dann veraltet sein (ehrlich gemeldet). */
  manifestSha256?: string | null;
  /** Optionaler HMAC-Verifier (der Betrieb teilt den Spine-Verify-Key mit dem KIT). Ohne ihn bleibt die Signatur
   *  ungeprüft (signatureChecked=false). */
  verifySignature?: (payload: string, sig: string | undefined) => boolean;
  /** Kanonische Serialisierung des Statements für den Signatur-Payload (muss byte-gleich zur CHOS-Signier-Seite sein). */
  statementPayload?: (statement: MeshCertStatement) => string;
}

/**
 * verifyMeshCertStructure — die REIN STRUKTURELLE fail-closed Prüfung eines geladenen Verdikt-Artefakts. Prüft in-toto-
 * Hülle, predicateType, Subjekt-Kongruenz, (optional) Manifest-Frische, in-sich-Konsistenz (earned ≡ nachgerechnete
 * Achsen) und (optional) die HMAC-Signatur. `earned` ist NUR true, wenn valid UND die nachgerechneten Achsen + Baseline
 * bestehen — das mitgereiste `earned`-Flag alleine zählt nie.
 */
export function verifyMeshCertStructure(
  parsed: unknown,
  opts: MeshCertVerifyOptions,
): MeshCertVerification {
  const reasons: string[] = [];
  const id = opts.composableId.trim();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      valid: false,
      earned: false,
      signatureChecked: false,
      countersigned: false,
      reasons: [
        "Eval-Verdikt fehlt/unlesbar (kein Objekt) — Zertifizierung ist nicht belegt (deklariert ≠ verdient).",
      ],
    };
  }
  const file = parsed as MeshCertFile;
  const st = file.statement;
  if (
    !st ||
    st._type !== IN_TOTO_STATEMENT_TYPE ||
    st.predicateType !== COMPOSABLE_CERT_PREDICATE_TYPE
  ) {
    reasons.push(
      "Statement-Hülle ungültig (kein in-toto Statement v1 / falscher predicateType).",
    );
  }
  if (st?.subject?.[0]?.name !== id || st?.predicate?.composableId !== id) {
    reasons.push(
      `Verdikt-Subjekt inkongruent (das Verdikt trägt nicht die Stelle „${id}").`,
    );
  }
  // Frische (EINE Wahrheit): das Verdikt gilt nur für EXAKT das Manifest, das es zertifiziert hat.
  if (opts.manifestSha256 === null || opts.manifestSha256 === undefined) {
    // Manifest nicht mitgegeben → Frische ungeprüft (kein Fehler, aber ehrlich: kein Frische-Beleg).
  } else if (st?.subject?.[0]?.digest?.sha256 !== opts.manifestSha256) {
    reasons.push(
      "Manifest-Digest weicht ab — die Stelle wurde seit der Zertifizierung neu emittiert/verändert (Verdikt veraltet, Re-Zertifizierung nötig).",
    );
  }
  // claim ∧ evidence IM Artefakt: earned aus den Szenario-Records nachrechnen; Abweichung ⇒ manipuliert/inkonsistent.
  const recomputedAxes = st?.predicate?.scenarios
    ? recomputeAxes(st.predicate.scenarios)
    : undefined;
  const recomputedEarned =
    !!recomputedAxes &&
    st?.predicate?.scorerBaseline?.ok === true &&
    CERT_AXES.every((a) => recomputedAxes[a].pass);
  if (st && recomputedEarned !== (st.predicate?.earned === true)) {
    reasons.push(
      "earned-Flag ≠ nachgerechnete Achsen-Belege — das Verdikt ist in sich inkonsistent (kein Vertrauen).",
    );
  }
  // Optionale HMAC-Prüfung (nur mit geteiltem Verify-Key).
  let signatureChecked = false;
  if (opts.verifySignature && opts.statementPayload && st) {
    signatureChecked = true;
    if (!opts.verifySignature(opts.statementPayload(st), file.signature?.sig)) {
      reasons.push(
        "Signatur ungültig — das Verdikt ist nicht vom Spine-Key signiert oder wurde nachträglich verändert.",
      );
    }
  }
  const valid = reasons.length === 0;
  const countersigned =
    valid &&
    Array.isArray(file.countersign) &&
    file.countersign.some((c) => !!c?.signer && !!c?.at && !!c?.sig);
  return {
    valid,
    earned: valid && recomputedEarned,
    signatureChecked,
    countersigned,
    ...(valid && recomputedAxes ? { axes: recomputedAxes } : {}),
    ...(valid && st?.predicate?.finishedAt
      ? { finishedAt: st.predicate.finishedAt }
      : {}),
    reasons,
  };
}
