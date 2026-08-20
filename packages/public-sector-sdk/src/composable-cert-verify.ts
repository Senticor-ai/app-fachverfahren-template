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
// SIGNATUR (ASYMMETRISCH, Ed25519): CHOS signiert das Verdikt-Statement zusätzlich zur CHOS-internen HMAC mit einem
// ASYMMETRISCHEN Cert-Signing-Key und lässt die Signatur + den ÖFFENTLICHEN Verify-Key mitreisen (`attestation`). Der
// KIT prüft sie mit dem PUBLIC Key — er kann VERIFIZIEREN, aber NIE FÄLSCHEN (der private Signier-Key bleibt CHOS-seitig).
// TRUST-ANKER: der ÖFFENTLICHE Key kommt OUT-OF-BAND (`opts.certSigningPublicKey` — vom Aufrufer aus einer well-known
// Datei `cert-signing-key.pub` bzw. ENV aufgelöst); der IN der `attestation` mitgereiste `publicKey` ist NUR Auditdatum
// und muss dem vertrauten Key GLEICHEN (sonst fälschte ein Angreifer Signatur+Key gemeinsam). Fehlt der vertraute Key,
// bleibt die Signatur ungeprüft (`signatureChecked:false`) — der Aufrufer kappt dann deklariertes certified/active
// fail-closed auf candidate. Eine vorhandene, aber GEBROCHENE/fremde Attestation ⇒ NICHT valid (forged/unsigniert).
// (Der ältere HMAC-Injektions-Seam `verifySignature`+`statementPayload` bleibt rückwärts-kompatibel erhalten.)
//
// REIN: keine Laufzeit-Imports, KEIN node:crypto, kein I/O — dieses Paket ist plattform-agnostisch (kein @types/node).
// Die kryptografischen Primitive (sha256, Ed25519-Verify) werden vom NODE-Aufrufer INJIZIERT (opts.sha256Hex /
// opts.verifyEd25519); die SICHERHEITS-Logik (Attestation-Form, Trust-Anker-Gleichheit, Domäne, Digest-Quelle) bleibt
// hier EINE Wahrheit. So bleibt das Modul auch über `node --experimental-strip-types` (check-composables.mts) ladbar.

/** Signatur-Domäne der Ed25519-Cert-Attestation — byte-gleich zu CHOS `COMPOSABLE_CERT_SIGNATURE_DOMAIN`. */
export const COMPOSABLE_CERT_SIGNATURE_DOMAIN = "senticor/composable-cert/v1";

/** Kanonische (schlüssel-sortierte) Serialisierung — byte-gleich zu CHOS `stableStringify` (verbund-edge-verify.ts).
 *  Der Cert-Signatur-Digest ist `sha256(stableStringify(statement))`; die KIT-Seite MUSS exakt so serialisieren. REIN. */
export function stableStringify(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableStringify(o[k]))
      .join(",") +
    "}"
  );
}

// ── Manifest-Typen (die EINE Identität einer zuständigen Stelle, CHOS mesh-derive/mesh-emit) ─────────────────────────
/** Eine Anspruchsgrundlage im Manifest (Rechtsgrundlage der Stelle). */
export interface MeshRechtsgrundlage {
  id: string;
  titel: string;
  ubiquitaer?: boolean;
  [k: string]: unknown;
}

/** Die mitgereiste, VERSIEGELTE Governance-Projektion einer Stelle — die Felder, die der KIT zum BEURTEILEN
 *  braucht. Weitere Felder bleiben erhalten (Index-Signatur) und gehen in die Siegel-Nachrechnung ein: das Siegel
 *  geht über ALLES außer `digest`, ein ignoriertes Feld wäre also eine Lücke. */
export interface MeshGovernanceProjektion {
  schemaVersion?: number;
  art?: string;
  composableId?: string;
  domain?: string;
  regime?: { normativ?: boolean };
  stellen?: {
    id: string;
    art?: string;
    zone?: string;
    akteur?: string;
    titel?: string;
  }[];
  regeln?: {
    id: string;
    label: string;
    art: string;
    class?: string;
    verify?: string;
    role?: string;
    requirement?: string;
  }[];
  capabilities?: {
    id: string;
    ergebnis: string;
    wissen?: string[];
    evalSuite?: string;
  }[];
  befugnis?: { entscheidung?: string; hitlPflicht?: boolean; aal?: number };
  faehigkeiten?: {
    ki?: string[];
    entitlements?: string[];
    autonomie?: string;
    aal?: number;
    /** DIE ZWEITE, GLEICHRANGIGE SEITE. Es reist der ANSPRUCH — `programm` ist eine KENNUNG (`tarif:…`,
     *  `regel:…`, `dmn:…`), nie der Koerper: der ist nachbaubare Substanz und bleibt beim Herausgeber (§7).
     *  Ohne diese Zeilen faellt die Seite in die Index-Signatur unten und ist dem KIT unbekannt — genau der
     *  Weg, auf dem `befugnis` schon einmal verloren ging (s. Kommentar am Manifest-Typ). */
    strukturiert?: {
      id: string;
      ergebnis: string;
      klasse?: string;
      programm?: string;
      grundlagen?: string[];
      evalSuite?: string;
      /** Erzeugt von einer Wissens-Faehigkeit — und von wem freigegeben. OHNE Freigabe ist das ein Befund,
       *  der im fremden Traeger sichtbar bleiben MUSS: der Betreiber entscheidet damit, ob er eine
       *  ungelesene Regel betreibt. */
      erzeugtVon?: string;
      freigegebenVon?: string;
    }[];
    /** WERKZEUG-KANTEN: welche Wissens-Faehigkeit welches Programm aufruft. Eine Governance-Aussage
     *  (WER WEN benutzen darf), kein Bauplan (WIE das Programm rechnet). */
    benutzt?: { wissen: string; werkzeug: string }[];
  };
  herkunft?: { verfassungDigest?: string; revision?: number };
  digest?: string;
  [k: string]: unknown;
}

/** Die SCHEMA-VERSION der Projektion, die dieser KIT versteht. FAIL-CLOSED statt Schema-Raten: eine ältere/neuere
 *  Projektion wird nicht „irgendwie“ gelesen, sondern abgelehnt — byte-gleich zur CHOS-Konstante
 *  GOVERNANCE_PROJEKTION_SCHEMA_VERSION. */
export const MESH_GOVERNANCE_PROJEKTION_SCHEMA_VERSION = 2;

/** Der Subjekt-NAME der Governance-Projektion im in-toto-Statement — byte-gleich zur CHOS-Seite
 *  (`composableCertGovernanceSubject`). Das ZWEITE Subjekt neben dem Manifest. */
export function meshCertGovernanceSubject(composableId: string): string {
  return `${composableId.trim()}#governance`;
}

/** Das Verdikt einer nachgerechneten Governance-Projektion (Spiegel CHOS `ProjektionVerdict`). */
export interface MeshGovernanceVerdict {
  /** Überhaupt eine Projektion vorhanden (Absenz ist etwas ANDERES als Manipulation). */
  vorhanden: boolean;
  /** Siegel intakt: der nachgerechnete Digest stimmt mit dem mitgeführten überein. */
  intakt: boolean;
  digest?: string;
  projektion?: MeshGovernanceProjektion;
  gruende: string[];
}

/**
 * verifyMeshGovernanceProjektion — LESER GLAUBEN NIE, SIE RECHNEN NACH. Rechnet das Siegel der mitgereisten
 * Verfassung im aufnehmenden Träger nach: `sha256(stableStringify(projektion ohne digest))` ≡ `digest`.
 * Dieselbe kanonische Serialisierung wie die Cert-Signatur (stableStringify) — kein zweiter Dialekt.
 *
 * REIN: die sha256-Funktion wird INJIZIERT (dieses Paket bleibt plattform-agnostisch). Ohne sie kann nicht
 * nachgerechnet werden ⇒ fail-closed `intakt:false` (nie „ist schon in Ordnung“).
 */
export function verifyMeshGovernanceProjektion(
  value: unknown,
  opts: { composableId: string; sha256Hex?: (input: string) => string },
): MeshGovernanceVerdict {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      vorhanden: false,
      intakt: false,
      gruende: [
        "Diese Stelle führt keine versiegelte Governance-Projektion mit — sie behauptet nichts darüber, unter welcher Governance sie zertifiziert wurde.",
      ],
    };
  }
  const p = value as MeshGovernanceProjektion;
  const gruende: string[] = [];
  const id = opts.composableId.trim();
  if (p.schemaVersion !== MESH_GOVERNANCE_PROJEKTION_SCHEMA_VERSION) {
    gruende.push(
      `Die mitgereiste Verfassung trägt schemaVersion ${String(p.schemaVersion)} — dieser Träger versteht ${MESH_GOVERNANCE_PROJEKTION_SCHEMA_VERSION} (fail-closed statt Schema-Raten).`,
    );
  }
  if (p.art !== "projektion")
    gruende.push(
      'Die mitgereiste Verfassung gibt sich nicht als abgeleitete Projektion aus (art ≠ "projektion") — kein Vertrauen.',
    );
  if (typeof p.digest !== "string" || !p.digest)
    gruende.push(
      "Die mitgereiste Verfassung trägt kein Siegel (digest) — nicht prüfbar, also nicht belastbar.",
    );
  if (p.composableId !== id)
    gruende.push(
      `Die mitgereiste Verfassung gehört zur Stelle „${String(p.composableId)}“, gemountet wird „${id}“ — inkongruent (fail-closed).`,
    );
  if (gruende.length) return { vorhanden: true, intakt: false, gruende };
  if (!opts.sha256Hex) {
    return {
      vorhanden: true,
      intakt: false,
      gruende: [
        "Das Siegel der mitgereisten Verfassung konnte nicht nachgerechnet werden (keine sha256-Funktion injiziert) — fail-closed: ungeprüft ist nicht in Ordnung.",
      ],
    };
  }
  const { digest, ...ohneSiegel } = p as Record<string, unknown> & {
    digest: string;
  };
  const nachgerechnet = opts.sha256Hex(stableStringify(ohneSiegel));
  if (nachgerechnet !== digest) {
    return {
      vorhanden: true,
      intakt: false,
      gruende: [
        "Die mitgereiste Verfassung wurde nach ihrer Erzeugung verändert (Siegel stimmt nicht) — sie ist ein ABGELEITETES Artefakt und darf nicht von Hand editiert werden. Das erzeugende Verfahren muss sie neu erzeugen und die Stelle neu zertifizieren.",
      ],
    };
  }
  return { vorhanden: true, intakt: true, digest, projektion: p, gruende: [] };
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
  /** `strukturiert`/`benutzt` stehen hier fuer den Alt-Bestand OHNE mitgereiste Projektion. Wo eine
   *  Projektion vorliegt, ist SIE der Traeger (versiegelt) — dieser Block ist dann nicht die Wahrheit,
   *  sondern nur ihre unversiegelte Kopie. Die Rangfolge setzt `mapManifestToComposable` durch. */
  faehigkeiten?: {
    ki?: string[];
    autonomie?: string;
    strukturiert?: {
      id: string;
      ergebnis: string;
      klasse?: string;
      programm?: string;
      grundlagen?: string[];
      evalSuite?: string;
      erzeugtVon?: string;
      freigegebenVon?: string;
    }[];
    benutzt?: { wissen: string; werkzeug: string }[];
  };
  wissen?: string[];
  evalSuiten?: string[];
  /** WAS die Stelle im laufenden Verfahren ENTSCHEIDET — abgeleitet aus der Zustandsmaschine (Uebergaenge x
   *  `rollen`), nie handgepflegt. Bis hierher deklariert, damit es nicht — wie `befugnis` vor ihm — in die
   *  Index-Signatur faellt und dem KIT unbekannt bleibt. */
  leistungen?: {
    schritt: string;
    ergebnis: string;
    vierAugen: boolean;
    begruendungsPflicht: boolean;
    erlaesstBescheid: boolean;
  }[];
  /** WAS in welcher BAU-Phase entsteht (aus RACI x produces) — die Herstellungs-Sicht neben `leistungen`. */
  artefakte?: { ziel: string; phase: string; art: "datei" | "ergebnis" }[];
  /** Die VERANTWORTUNG/BEFUGNIS der Stelle — „darf sie entscheiden“. Bisher fiel dieses Feld in die
   *  Index-Signatur und war dem KIT damit UNBEKANNT: `hitlPflicht` erreichte weder den Mount-Mapper noch die
   *  Chat-Route. Genau daran lief ein HITL-pflichtiges Bescheid-Composable als nicht-rechtsnaher AAL-3-Agent. */
  befugnis?: {
    entscheidung?: "erlaesst-va" | "entwurf-only" | "keine";
    hitlPflicht?: boolean;
    aal?: number;
  };
  /** Die VERSIEGELTE Governance-Projektion (CHOS `composable-governance-projektion`) — die mitgereiste
   *  Verfassung dieser Stelle. Ebenfalls bisher nur Index-Signatur; ohne Typ konnte der KIT das Siegel weder
   *  nachrechnen noch das zweite in-toto-Subjekt darauf beziehen. */
  governanceProjektion?: MeshGovernanceProjektion;
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
// ── DIE IDENTITAET EINER DEFINITION — dieselbe Formel wie beim Erzeuger, sonst passt kein Verdikt ─────────────────
//
// GEMESSEN 2026-08-04 an 44 echten Manifest/Ausweis-Paaren aus einem CHOS-Arbeitsbereich: die Frische-Pruefung
// dieses Hauses rechnete `sha256(Datei-Bytes)` und traf das Subjekt des Verdikts in NULL von 44 Faellen. CHOS hat
// die Formel am 2026-08-03 gewechselt (Commit 852e532d, „das Verdikt zertifiziert die DEFINITION, nicht die
// BINDUNG") und die eigene Leseseite mitgezogen — diese Seite nicht. Folge: `certified` war hier strukturell
// unerreichbar, jedes zertifizierte Composable fiel fail-closed auf `candidate`, und niemand sah einen Fehler:
// die Kappung ist ja der richtige Reflex bei einem nicht passenden Digest. Ein Waechter, der IMMER kappt, sieht
// aus wie ein strenger Waechter.
//
// WARUM DIE BINDUNGS-FELDER RAUS MUESSEN: dieselbe Stelle (z. B. „fachdienst") steht in mehreren Verfahren und
// ist dort auf verschiedene Rechtsgrundlagen geerdet. Haengte die Identitaet an den vollen Bytes, waere ein
// Verdikt per Konstruktion an EIN Verfahren gekettet und koennte nie ein zweites decken — genau die
// Wiederverwendung, um derentwillen es die Registry gibt. Die Bindung geht nicht verloren: sie steht weiter in
// der Datei und wird beim Mount gegen die Ziel-Verfassung geprueft.
//
// KOPIE MIT PFLICHT ZUR KONGRUENZ: die Quelle ist `packages/fachverfahren/composable-identitaet.ts` im
// Erzeuger-Repo (CHOS). Zwei Repos koennen keine Funktion teilen — aber sie koennen dieselbe Antwort schulden.
// Weicht eine Seite ab, ist die Wirkung STILL und total (siehe oben). Wer hier etwas aendert, aendert es dort
// mit; die Kongruenz-Probe im Erzeuger-Repo haelt beide Listen gegeneinander.
export const BINDUNGS_FELDER = [
  "domain",
  "amt",
  "anspruch",
  "governanceProjektion",
  "version",
] as const;

/** Rekursiv die Bindungs-Felder entfernen und kanonisch (schluessel-sortiert) serialisieren. Deterministisch:
 *  gleiche Definition ⇒ gleiche Bytes, unabhaengig von der Feld-Reihenfolge der Quelle. BYTE-GLEICH mit dem
 *  Erzeuger — inklusive Einrueckung 2 und abschliessendem Zeilenumbruch. */
export function definitionsBytes(manifest: unknown): string {
  const ohneBindung = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(ohneBindung);
    if (o && typeof o === "object") {
      const raus = new Set<string>(BINDUNGS_FELDER);
      return Object.fromEntries(
        Object.entries(o as Record<string, unknown>)
          .filter(([k]) => !raus.has(k))
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => [k, ohneBindung(v)]),
      );
    }
    return o;
  };
  return JSON.stringify(ohneBindung(manifest), null, 2) + "\n";
}

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
  /** ASYMMETRISCHE (Ed25519) Attestation — grenzübergreifend mit dem PUBLIC Key prüfbar. `publicKey` = base64url-SPKI
   *  (nur Auditdatum; die Autorität kommt aus `opts.certSigningPublicKey`, gegen den `publicKey` gleichen muss). */
  attestation?: { alg?: string; publicKey?: string; sig?: string };
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
  /** Wurde die kryptografische Signatur geprüft? (nur, wenn ein vertrauter Cert-Signing-Public-Key vorlag UND die
   *  Ed25519-Attestation dagegen gültig verifizierte; bzw. der ältere injizierte HMAC-Verifier bestand). */
  signatureChecked: boolean;
  countersigned: boolean;
  /** Bezeugt das Verdikt die konkrete GOVERNANCE, unter der zertifiziert wurde (zweites in-toto-Subjekt
   *  `<id>#governance`)? Bisher prüfte der KIT nur `subject[0]` — ein Verdikt konnte also „zertifiziert“ sagen,
   *  ohne dass irgendwer wusste, unter welcher Verfassung. false = das Verdikt sagt über Governance NICHTS
   *  (ehrliche Absenz), nicht „Governance ist in Ordnung“. */
  governanceAttested: boolean;
  /** Der vom Verdikt bezeugte Projektions-Digest (nur bei governanceAttested). */
  governanceSha256?: string;
  axes?: Record<CertAxis, CertAxisVerdict>;
  finishedAt?: string;
  reasons: string[];
}

export interface MeshCertVerifyOptions {
  composableId: string;
  /** SHA-256 (hex) der EXAKTEN Manifest-Bytes — für die Frische-Prüfung (Digest im Subjekt). `null`/undefined ⇒ Frische
   *  wird NICHT geprüft (der Aufrufer hat das Manifest nicht); das Verdikt kann dann veraltet sein (ehrlich gemeldet). */
  manifestSha256?: string | null;
  /** Der VERTRAUTE (out-of-band) ÖFFENTLICHE Cert-Signing-Key (base64url-SPKI) — der TRUST-ANKER der Ed25519-Attestation.
   *  Der Aufrufer löst ihn aus der well-known Datei `cert-signing-key.pub` neben den Verdikten bzw. aus ENV auf. Fehlt er
   *  (`null`/undefined), bleibt die Signatur ungeprüft (signatureChecked=false) — der Aufrufer kappt certified fail-closed. */
  certSigningPublicKey?: string | null;
  /** INJIZIERTE sha256-Hex-Funktion (node:crypto beim Aufrufer) — der Cert-Signatur-Digest ist
   *  `sha256Hex(stableStringify(statement))`. Ohne sie (oder ohne verifyEd25519) bleibt die Attestation ungeprüft. */
  sha256Hex?: (input: string) => string;
  /** INJIZIERTE public-only Ed25519-Verifikation (node:crypto beim Aufrufer): Nachricht = `${domain}\0${digestHex}`,
   *  `publicKey`/`signature` base64url. Die Autoritäts-/Form-Prüfung (Trust-Anker-Gleichheit, alg, Domäne) bleibt HIER. */
  verifyEd25519?: (
    publicKey: string,
    domain: string,
    digestHex: string,
    signature: string | undefined,
  ) => boolean;
  /** ÄLTERER, rückwärts-kompatibler HMAC-Injektions-Seam (nur genutzt, wenn KEINE asymmetrische Prüfung möglich ist). */
  verifySignature?: (payload: string, sig: string | undefined) => boolean;
  /** Kanonische Serialisierung des Statements für den HMAC-Payload (muss byte-gleich zur CHOS-Signier-Seite sein). */
  statementPayload?: (statement: MeshCertStatement) => string;
  /** Der NACHGERECHNETE Digest der mitgereisten Governance-Projektion (verifyMeshGovernanceProjektion). Das Verdikt
   *  gilt nur für EXAKT die Governance, unter der es verdient wurde. `null` = die Stelle führt keine (mehr) mit;
   *  `undefined` = der Aufrufer hat nicht geprüft (dann bleibt die Achse ehrlich ungeprüft, kein stiller Freispruch). */
  governanceSha256?: string | null;
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
      governanceAttested: false,
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
  // GOVERNANCE-SUBJEKT (das ZWEITE in-toto-Subjekt `<id>#governance`): bezeugt das Verdikt eine konkrete
  // Governance-Projektion — und ist es DIESE? Ein ausgetauschtes/verändertes Governance-Artefakt macht das Verdikt
  // UNGÜLTIG: das Zertifikat gilt nur für exakt die Verfassung, unter der es verdient wurde. Kein Subjekt ⇒
  // governanceAttested:false (ehrliche Absenz, kein stiller Über-Claim). Spiegel der CHOS-Seite.
  const govSubject = st?.subject?.find(
    (subject) => subject?.name === meshCertGovernanceSubject(id),
  );
  const bezeugterGovDigest = govSubject?.digest?.sha256;
  if (bezeugterGovDigest && opts.governanceSha256 !== undefined) {
    if (opts.governanceSha256 === null) {
      reasons.push(
        "Das Verdikt bezeugt eine Governance-Projektion, die Stelle führt aber keine (gültige) mehr mit — die Governance, unter der zertifiziert wurde, ist nicht mehr nachweisbar.",
      );
    } else if (opts.governanceSha256 !== bezeugterGovDigest) {
      reasons.push(
        "Governance-Projektion weicht ab — die Stelle steht nicht mehr unter der Governance, unter der sie zertifiziert wurde (Verdikt veraltet, Re-Zertifizierung nötig).",
      );
    }
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
  // KRYPTOGRAFISCHE Signatur-Prüfung (fail-closed):
  //   1) ASYMMETRISCH (bevorzugt): gegen den VERTRAUTEN Cert-Signing-Public-Key (out-of-band) — der KIT prüft mit dem
  //      PUBLIC Key und kann NIE fälschen. Der in der Attestation mitgereiste `publicKey` ist nur Auditdatum und muss
  //      dem vertrauten Key GLEICHEN; die Ed25519-Signatur geht über `sha256(stableStringify(statement))` unter der
  //      Cert-Domäne. Fehlt/bricht/fremd ⇒ Reason (forged/unsigniert) ⇒ NICHT valid.
  //   2) HMAC (rückwärts-kompatibel): nur, wenn KEIN vertrauter Key vorliegt und ein Verifier injiziert wurde.
  let signatureChecked = false;
  if (st && opts.certSigningPublicKey && opts.sha256Hex && opts.verifyEd25519) {
    const att = file.attestation;
    const digest = opts.sha256Hex(stableStringify(st));
    const okSig =
      !!att &&
      att.alg === "Ed25519" &&
      typeof att.publicKey === "string" &&
      att.publicKey === opts.certSigningPublicKey &&
      opts.verifyEd25519(
        att.publicKey,
        COMPOSABLE_CERT_SIGNATURE_DOMAIN,
        digest,
        att.sig,
      );
    if (okSig) signatureChecked = true;
    else {
      reasons.push(
        "Cert-Signatur (Ed25519) ungültig/fehlend gegen den vertrauten Cert-Signing-Public-Key — das Verdikt ist nicht authentisch (gefälscht/unsigniert oder von fremdem Signer).",
      );
    }
  } else if (opts.verifySignature && opts.statementPayload && st) {
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
    governanceAttested: valid && !!bezeugterGovDigest,
    ...(valid && bezeugterGovDigest
      ? { governanceSha256: bezeugterGovDigest }
      : {}),
    ...(valid && recomputedAxes ? { axes: recomputedAxes } : {}),
    ...(valid && st?.predicate?.finishedAt
      ? { finishedAt: st.predicate.finishedAt }
      : {}),
    reasons,
  };
}
