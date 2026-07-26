// composable-manifest — der MOUNT-MAPPER (Ziel-1 S7): projiziert ein CHOS-Mesh-Manifest
// (`.chos/mesh/composables/<id>.json`) auf die EINE Composable-Laufzeit-Wahrheit dieses Kits — den
// `AgenticComposable` (composable.ts). So wird eine im Verfahrens-Build EMITTIERTE, in der geteilten Registry
// ZERTIFIZIERTE Stellen-DEFINITION zu einem erstklassigen, wohlgeformten Composable in der generierten App:
// discoverbar (GET /api/composables), chattbar (POST /api/composables/:id/chat), gegatet (Spine-Governance).
//
// REUSE=MOUNTEN, NICHT NACHBAUEN: der Mapper baut kein zweites Composable-Modell — er füllt den bestehenden
// `AgenticComposable`/`SpineAgent` und lässt `assertComposable` die Governance-Invarianten ERZWINGEN (AAL ≤ AAL-3
// global; rechtsnah ⇒ AAL-2 „Advise"). Ein Manifest, das die Decke über-deklariert, wird darum EHRLICH VERWORFEN
// (assertComposable wirft) — evidence-driven fail-closed, kein stilles Kappen der Autonomie.
//
// GENERISCH: kein Domänen-Literal — alles Fachliche kommt aus den Manifest-DATEN (titel/anspruch/faehigkeiten/
// governance/certification). Die wenigen Modell-Felder, die das Manifest NICHT trägt (version/owners/klasse/
// task-Achse), sind aus den Manifest-DATEN abgeleitete, DOKUMENTIERTE Defaults und über `opts` überschreibbar —
// die CHOS-seitige Generierung von `composables.config.ts` reicht die vollen Werte durch (siehe Modul-Ende).
//
// ZERTIFIKAT-DURCHSETZUNG (Anspruch ∧ Beleg): der deklarierte `certification.status` allein macht ein Composable
// NICHT `enabled`. Nur mit einem GÜLTIGEN, VERDIENTEN Verdikt-Beleg (opts.attestation aus verifyMeshCertStructure)
// bleibt ein deklariertes certified/active bestehen; ohne Beleg wird es EHRLICH auf `candidate` gekappt (Spiegel der
// CHOS-Wire-Wahrheit effectiveCertification). Ohne übergebene attestation gilt: nicht belegt ⇒ gekappt (fail-closed).

import { assertComposable, MAX_AUTONOMY_HOCHSICHER } from "./composable.js";
import type {
  AgenticComposable,
  AgenticAutonomyLevel,
  ComposableAssuranceLevel,
  ComposableClass,
  ComposableOwners,
  ComposableStatus,
  SpineAgent,
  SpineAufgabe,
} from "./composable.js";
import type { MeshComposableManifest } from "./composable-cert-verify.js";

export type { MeshComposableManifest } from "./composable-cert-verify.js";

/** Das (aus verifyMeshCertStructure gewonnene) Beleg-Ergebnis, das den effektiven Status steuert. */
export interface MountAttestation {
  valid: boolean;
  earned: boolean;
}

export interface MapManifestOptions {
  /** Content-Version des Composables (das Manifest trägt nur schemaVersion, keine Inhalts-Version). Default „1.0.0". */
  version?: string;
  /** Ownership — das Manifest trägt keine Owner. Default: aus der Domäne abgeleiteter Platzhalter (CHOS-Generierung
   *  reicht die realen Owner durch). */
  owners?: ComposableOwners;
  /** Composable-Klasse. Default: art „struktur" → „operations", sonst „outcome". */
  klasse?: ComposableClass;
  /** Bindung an die deterministische Naht (module-manifest). Default: die Manifest-id. */
  moduleId?: string;
  /** Aufgaben-Achse des Spine. Default: aus dem Manifest abgeleitet (assistenz + pruefung bei HITL-Regeln). */
  aufgaben?: SpineAufgabe[];
  /** Der VERDIENTE Zertifikat-Beleg (verifyMeshCertStructure). Ohne ihn wird deklariertes certified/active gekappt. */
  attestation?: MountAttestation;
}

const KNOWN_STATUS: readonly ComposableStatus[] = [
  "draft",
  "incubated",
  "candidate",
  "certified",
  "active",
  "restricted",
  "superseded",
  "deprecated",
  "retired",
];

/** enabled-Stufen (produktiv nutzbar) — deklariertes certified/active braucht einen verdienten Beleg. */
const ENABLED_STATUS: readonly ComposableStatus[] = ["certified", "active"];

/** Der deklarierte Status aus dem Manifest, auf das bekannte Vokabular normalisiert (Default „draft"). */
export function manifestDeclaredStatus(
  manifest: MeshComposableManifest,
): ComposableStatus {
  const raw = manifest.certification?.status?.trim().toLowerCase();
  return (KNOWN_STATUS as readonly string[]).includes(raw ?? "")
    ? (raw as ComposableStatus)
    : "draft";
}

/** Der EFFEKTIVE Status nach Anspruch ∧ Beleg: certified/active OHNE verdientes Verdikt ⇒ auf „candidate" gekappt. */
export function effectiveComposableStatus(
  manifest: MeshComposableManifest,
  attestation?: MountAttestation,
): ComposableStatus {
  const declared = manifestDeclaredStatus(manifest);
  const earned = attestation?.valid === true && attestation?.earned === true;
  if ((ENABLED_STATUS as readonly string[]).includes(declared) && !earned)
    return "candidate";
  return declared;
}

/** CAL 0..4 (Zahl) → Assurance-Level; unbekannt/leer → CAL-0. */
function manifestAssurance(
  manifest: MeshComposableManifest,
): ComposableAssuranceLevel {
  const cal = manifest.certification?.cal;
  const n =
    typeof cal === "number" && Number.isFinite(cal)
      ? Math.min(4, Math.max(0, Math.trunc(cal)))
      : 0;
  return `CAL-${n}` as ComposableAssuranceLevel;
}

const AAL_RE = /AAL-([0-5])/;

/** Autonomie aus dem Manifest (faehigkeiten.autonomie, Form „AAL-N"); fehlt/ungültig → AAL-2 (der Regelfall). */
function manifestAutonomy(
  manifest: MeshComposableManifest,
): AgenticAutonomyLevel {
  const m = AAL_RE.exec(manifest.faehigkeiten?.autonomie ?? "");
  return (m ? `AAL-${m[1]}` : "AAL-2") as AgenticAutonomyLevel;
}

/** Die AAL-Ordinalität als Zahl (`AAL-3` → 3); nicht-AAL → 0. */
function aalRang(level: string): number {
  const m = AAL_RE.exec(level);
  return m ? Number(m[1]) : 0;
}

/**
 * DIE RECHTSNAH-DECKE (der Handlungs-Wächter). Fasst der Spine eine HITL-pflichtige Aufgabe an
 * (Prüfung/Subsumtion/Review), darf er dort NUR beraten → höchstens AAL-2 „Advise" (composable.ts
 * `assertSpineAgent`). Diese Funktion WENDET die Decke an, statt das Manifest zu verwerfen — und das ist
 * bewusst der Unterschied zu einem über-autonomen Manifest:
 *
 *   · Ein Manifest, das die GLOBALE Obergrenze reißt (AAL-4/AAL-5), ist ein Widerspruch zur Plattform und wird
 *     weiterhin EHRLICH VERWORFEN (assertSpineAgent wirft).
 *   · Ein Manifest mit AAL-3 „Act with Approval" UND HITL-Pflicht ist KEIN Widerspruch — es sagt genau das, was
 *     es sagt. Nur ist die AAL-Semantik dieses Trägers strenger: wo ein Mensch entscheidet, berät die KI. Die
 *     Stelle deshalb GANZ zu verwerfen, wäre ein Falsch-Blocker der teuersten Sorte (das Bescheid-Composable
 *     verschwände aus der App). Also: Decke anwenden, Kappung SICHTBAR machen (mapManifestWithProvenance).
 */
function gedeckelteAutonomie(
  manifest: MeshComposableManifest,
  aufgaben: readonly SpineAufgabe[],
): AgenticAutonomyLevel {
  const deklariert = manifestAutonomy(manifest);
  // ZUERST die globale Obergrenze: ein Manifest ÜBER AAL-3 wird NICHT gedeckelt, sondern unangetastet an
  // assertSpineAgent gereicht — dort wirft es. Würde die Rechtsnah-Decke auch hier greifen, verwandelte sie
  // einen harten Widerspruch in ein stilles Kappen und der fail-closed-Reject verschwände lautlos.
  if (aalRang(deklariert) > aalRang(MAX_AUTONOMY_HOCHSICHER)) return deklariert;
  const rechtsnah = aufgaben.some(
    (a) => a === "pruefung" || a === "subsumtion" || a === "review",
  );
  if (!rechtsnah) return deklariert;
  return aalRang(deklariert) > 2 ? ("AAL-2" as AgenticAutonomyLevel) : deklariert;
}

/**
 * Die Aufgaben-Achse des Spine aus dem Manifest ableiten. Basis ist „assistenz" (ein chatbarer, governter Assistent
 * ist mindestens assistiv — nicht-rechtsnah). Trägt die Stelle eine HITL-Governance-Regel („mit-freigabe" = die
 * Handlung braucht eine menschliche Freigabe), wird sie als rechtsnah behandelt und bekommt „pruefung" — was
 * `assertSpineAgent` auf AAL-2 „Advise" begrenzt (KI berät, entscheidet nie). Eine reichere Achse (subsumtion/review)
 * reicht die CHOS-Generierung über `opts.aufgaben` durch (sie kennt das vollere Modell). REIN, deterministisch.
 */
export function manifestSpineAufgaben(
  manifest: MeshComposableManifest,
): SpineAufgabe[] {
  const aufgaben: SpineAufgabe[] = ["assistenz"];
  // DIE BISHERIGE, ZU ENGE ACHSE: nur eine „mit-freigabe"-Regel machte die Stelle rechtsnah. Ein
  // Bescheid-Composable, dessen Regeln allesamt `verbindlich` sind, sah damit nicht rechtsnah aus — obwohl sein
  // Manifest `befugnis: {entscheidung:"erlaesst-va", hitlPflicht:true}` trägt. Ergebnis: der Chat lief AAL-3
  // gegen eine HITL-pflichtige Verwaltungsakt-Stelle. Die BEFUGNIS ist die eigentliche Achse; die Regel-Klasse
  // ist nur einer von mehreren Wegen, auf denen sie sichtbar wird.
  const hitlRegel = (manifest.governance?.regeln ?? []).some(
    (r) => r?.art === "mit-freigabe",
  );
  const hitlBefugnis = manifest.befugnis?.hitlPflicht === true;
  const erlaesstVa = manifest.befugnis?.entscheidung === "erlaesst-va";
  if (hitlRegel || hitlBefugnis || erlaesstVa) aufgaben.push("pruefung");
  return aufgaben;
}

function dedup(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Der „fuerWen"-Adressat aus dem akteur (mensch/agent/beide) — generische Verwaltungs-Sprache, kein Domänen-Literal. */
function akteurAdressat(akteur: string | undefined): string {
  switch (akteur) {
    case "mensch":
      return "Sachbearbeitung im Fachverfahren";
    case "agent":
      return "agentische Fachstelle im Verfahren";
    case "beide":
      return "Bürgerdienst und Sachbearbeitung";
    default:
      return "Fachbereich";
  }
}

/** Aus der Domäne abgeleiteter Owner-Platzhalter (das Manifest trägt keine Owner; CHOS-Generierung reicht die realen). */
function abgeleiteteOwners(manifest: MeshComposableManifest): ComposableOwners {
  const basis = (manifest.domain || manifest.id || "fachbereich").trim();
  return {
    capabilityOwner: basis,
    serviceOwner: `${basis}-fachdienst`,
  };
}

/**
 * mapManifestToComposable — der eigentliche Mount-Mapper: Mesh-Manifest → wohlgeformter `AgenticComposable`.
 * Ruft `assertComposable` (Spine-Governance wird ERZWUNGEN) und WIRFT bei einem über-autonomen/inkongruenten
 * Manifest (fail-closed reject). Der Status folgt Anspruch ∧ Beleg (effectiveComposableStatus).
 */
export function mapManifestToComposable(
  manifest: MeshComposableManifest,
  opts: MapManifestOptions = {},
): AgenticComposable {
  if (!manifest || typeof manifest.id !== "string" || !manifest.id.trim())
    throw new Error("Mesh-Manifest ohne id — nicht mountbar (fail-closed).");
  if (typeof manifest.domain !== "string" || !manifest.domain.trim())
    throw new Error(
      `Mesh-Manifest „${manifest.id}" ohne domain — nicht mountbar (fail-closed).`,
    );

  const id = manifest.id.trim();
  const status = effectiveComposableStatus(manifest, opts.attestation);
  const earned =
    opts.attestation?.valid === true && opts.attestation?.earned === true;

  const envelope = manifest.certification?.envelope;

  // Spine NUR bei deklarierten KI-Fähigkeiten (sonst rein deterministisches Composable ohne agentische Naht).
  const ki = dedup(manifest.faehigkeiten?.ki ?? []);
  let spine: SpineAgent | undefined;
  if (ki.length > 0) {
    const aufgaben =
      opts.aufgaben && opts.aufgaben.length > 0
        ? opts.aufgaben
        : manifestSpineAufgaben(manifest);
    spine = {
      role: `${id}-spine`,
      autonomy: gedeckelteAutonomie(manifest, aufgaben),
      aufgaben,
      skills: ki,
      knowledgeDomains: dedup([manifest.domain, ...(manifest.wissen ?? [])]),
    };
  }

  const rechtsnah =
    !!spine &&
    spine.aufgaben.some(
      (a) => a === "pruefung" || a === "subsumtion" || a === "review",
    );

  // Evals: das deklarierte Beleg-Vokabular des Manifests; bei verdientem Verdikt zusätzlich der Verdikt-Bezug,
  // damit ein enabled+verdientes Composable die certificationReadiness (evals nicht leer) erfüllt.
  const evals = dedup(manifest.evalSuiten ?? []);
  if (evals.length === 0 && earned) evals.push(`cert:${id}`);

  const composable: AgenticComposable = {
    id,
    version: opts.version ?? "1.0.0",
    displayName: (manifest.titel ?? id).trim() || id,
    klasse:
      opts.klasse ?? (manifest.art === "struktur" ? "operations" : "outcome"),
    status,
    assurance: manifestAssurance(manifest),
    outcome: {
      fuerWen: akteurAdressat(manifest.akteur),
      ergebnis:
        (envelope?.outcome ?? manifest.hinweis)?.trim() ||
        `Zuständigkeit „${manifest.titel ?? id}" im Verfahren „${manifest.domain}"`,
      messung:
        envelope?.evidence?.trim() ||
        "Evidence-Ledger-Vollständigkeit + HITL-Konformität",
      nichtScope: rechtsnah
        ? ["autonome rechtsnahe Entscheidung (bleibt menschlich)"]
        : [],
    },
    owners: opts.owners ?? abgeleiteteOwners(manifest),
    moduleId: opts.moduleId ?? id,
    ...(spine ? { spine } : {}),
    evals,
    replaceableBy: [],
  };

  return assertComposable(composable);
}

/**
 * mapManifestWithProvenance — Bequemlichkeit für Konsumenten/Gates: der gemountete Composable + die Beleg-Provenienz
 * (deklariert vs. effektiv). Nützlich, um „deklariert certified, aber ohne verdienten Beleg auf candidate gekappt"
 * ehrlich anzuzeigen (Registry-Panel / check-composables).
 */
export function mapManifestWithProvenance(
  manifest: MeshComposableManifest,
  opts: MapManifestOptions = {},
): {
  composable: AgenticComposable;
  provenance: {
    deklarierterStatus: ComposableStatus;
    effektiverStatus: ComposableStatus;
    beleg: "verdient" | "deklariert";
    ueberclaim: boolean;
    /** Die im Manifest DEKLARIERTE Autonomie (fehlt ohne Spine). */
    deklarierteAutonomie?: AgenticAutonomyLevel;
    /** Die EFFEKTIVE Autonomie nach der Rechtsnah-Decke. Weicht sie ab, wurde gekappt — SICHTBAR, nie still. */
    effektiveAutonomie?: AgenticAutonomyLevel;
    /** Die Stelle ist HITL-pflichtig/VA-erlassend und wurde deshalb auf „Advise" gedeckelt. */
    autonomieGekappt: boolean;
  };
} {
  const composable = mapManifestToComposable(manifest, opts);
  const deklarierterStatus = manifestDeclaredStatus(manifest);
  const effektiverStatus = composable.status;
  const beleg =
    opts.attestation?.valid === true && opts.attestation?.earned === true
      ? "verdient"
      : "deklariert";
  const deklarierteAutonomie = manifest.faehigkeiten?.ki?.length
    ? manifestAutonomy(manifest)
    : undefined;
  const effektiveAutonomie = composable.spine?.autonomy;
  return {
    composable,
    provenance: {
      deklarierterStatus,
      effektiverStatus,
      beleg,
      ueberclaim: deklarierterStatus !== effektiverStatus,
      ...(deklarierteAutonomie ? { deklarierteAutonomie } : {}),
      ...(effektiveAutonomie ? { effektiveAutonomie } : {}),
      autonomieGekappt:
        !!deklarierteAutonomie &&
        !!effektiveAutonomie &&
        deklarierteAutonomie !== effektiveAutonomie,
    },
  };
}
