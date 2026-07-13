import type { AuthStore } from "@senticor/app-store-postgres";

/** Identity-Naht (Authentifizierung ≠ Autorisierung): externe Identität
 *  (provider/issuer + subject) → Application Actor. Der IdP beweist NUR Identität;
 *  Actor, Tenant-Zugehörigkeit, Rollen/Permissions und Audit-Identität gehören der
 *  Anwendung. Ein OIDC-Callback ruft nach der Token-Validierung genau diese Funktion
 *  und stellt danach dieselbe Session aus wie der lokale Login — die Autorisierung
 *  (workspace-permissions.ts) bleibt unberührt. Konfigurationspfad:
 *  docs/capabilities/identity-and-trust.md.
 *
 *  Policy: KEIN Auto-Provisioning für externe Provider — nur explizit verlinkte
 *  Identitäten lösen auf (`linkIdentity` via Benutzerverwaltung/Provisioning).
 *  Der lokale Login registriert seinen Link (provider "local", subject = actorId)
 *  bei Bootstrap bzw. Konto-Anlage. */
export async function resolveActorForIdentity(
  authStore: AuthStore,
  input: { tenantId: string; provider: string; subject: string },
): Promise<string | undefined> {
  return authStore.findActorByIdentity(input);
}
