// external-personas — der AUSFÜHRBARE OIDC-Claim-Vertrag (Nahtstelle, KEIN OIDC-Flow):
// Ein späterer Keycloak-/OIDC-Adapter übersetzt Provider-Strukturen (realm_access,
// Gruppen, Mapper) in EINEN kanonischen Claim und ruft dann `decideExternalPersonaSync`
// + `authStore.updateUserAccess({ patch: { oidcPersonas } })` (idempotentes Voll-Set,
// No-op ohne Version-Bump). Die App liest NIE Provider-Interna direkt.
//
// Kanonischer Claim-Vertrag (V1 — bewusst NUR Personas; Workspace-Rollen/Permissions
// bleiben lokal verwaltet):
//   { "senticor_claims_version": 1, "senticor_personas": ["sachbearbeitung"] }
//
// Identitäts-Bindung: externe Identitäten sind issuer+subject (Identity-Links,
// provider-Key ≙ genau ein konfigurierter Issuer) — NIE Re-Link über E-Mail.
import {
  normalizePersonas,
  USER_PERSONAS,
  type PersonaManagementMode,
  type UserPersona,
} from "@senticor/app-store-postgres";

export const PERSONA_CLAIM = "senticor_personas";
export const CLAIMS_VERSION_CLAIM = "senticor_claims_version";

/** Obergrenze gegen absurde Token (Angriff/Fehlkonfiguration): das Tripel + Luft. */
const MAX_CLAIM_ENTRIES = 16;

/** Malformed ≠ unbekannt: ein strukturell kaputter Claim ist ein Authentifizierungs-/
 *  Konfigurationsfehler — es wird NIE „ein bisschen" synchronisiert oder überschrieben. */
export class MalformedPersonaClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedPersonaClaimError";
  }
}

/** Geparster Claim-Zustand. `absent` heißt „Mapping nicht verfügbar" (Claim fehlt) und
 *  ist ETWAS ANDERES als `present` mit leerem Array (bewusstes Entfernen). `ignored`
 *  sammelt unbekannte Werte für das Audit des Aufrufers. */
export type ExternalPersonaClaim =
  | { kind: "absent" }
  | { kind: "present"; personas: UserPersona[]; ignored: string[] };

export function parseExternalPersonaClaim(
  claims: Record<string, unknown>,
): ExternalPersonaClaim {
  const raw = claims[PERSONA_CLAIM];
  if (raw === undefined) {
    return { kind: "absent" };
  }
  if (!Array.isArray(raw)) {
    throw new MalformedPersonaClaimError(
      `${PERSONA_CLAIM} must be an array of strings`,
    );
  }
  if (raw.length > MAX_CLAIM_ENTRIES) {
    throw new MalformedPersonaClaimError(
      `${PERSONA_CLAIM} exceeds ${MAX_CLAIM_ENTRIES} entries`,
    );
  }
  if (!raw.every((entry) => typeof entry === "string")) {
    throw new MalformedPersonaClaimError(
      `${PERSONA_CLAIM} must contain only strings`,
    );
  }
  const known = raw.filter((entry): entry is UserPersona =>
    (USER_PERSONAS as readonly string[]).includes(entry),
  );
  const ignored = [
    ...new Set(raw.filter((entry) => !known.includes(entry as UserPersona))),
  ];
  return { kind: "present", personas: normalizePersonas(known), ignored };
}

/** Autoritäts-Entscheidung je Modus. Fail closed: im authoritative-Modus ist ein
 *  FEHLENDER Claim ein Provider-/Konfigurationsfehler und lehnt den Login ab —
 *  „authoritative" heißt nicht „letzter bekannter Stand für immer". */
export type ExternalSyncDecision =
  | { action: "noop" }
  | { action: "sync"; personas: UserPersona[]; ignored: string[] }
  | { action: "reject_login"; reason: "claim_missing_in_authoritative_mode" };

export function decideExternalPersonaSync(
  mode: PersonaManagementMode,
  claim: ExternalPersonaClaim,
): ExternalSyncDecision {
  if (mode === "local") {
    // Lokal verwaltete Konten: externe Claims sind bewusst irrelevant.
    return { action: "noop" };
  }
  if (claim.kind === "absent") {
    return mode === "oidc_authoritative"
      ? {
          action: "reject_login",
          reason: "claim_missing_in_authoritative_mode",
        }
      : { action: "noop" };
  }
  return { action: "sync", personas: claim.personas, ignored: claim.ignored };
}
