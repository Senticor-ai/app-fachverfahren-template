# Capability: identity-and-trust

Verwende `IdentityAndTrustPort` aus `@senticor/platform-contracts` für
Identität, Rollenabbildung und Assurance-Prüfung. Domain-Module dürfen keine
eigene Authentifizierung, Session-Verwaltung oder Passwortlogik aufbauen.

## Authentifizierung ≠ Autorisierung

Der Identity Provider beweist nur Identität. Der Anwendung gehören: Actor,
Tenant-Zugehörigkeit, Rollen/Permissions und Audit-Identität.

```
Externe Identität (issuer/provider + subject)
        │
        ▼
Identity-Link (app_identity_links, tenant-scoped)
        │
        ▼
Application Actor (app_users: role, status)
        │
        ▼
Autorisierungs-Entscheidung (workspace-permissions)
```

Die Naht im App-Server ist `resolveActorForIdentity`
(`apps/fachverfahren/server/auth/identity.ts`): sie löst eine externe
Identität tenant-scoped auf einen Actor auf. Der lokale Passwort-Login ist
nur EIN Provider (`provider: "local"`, `subject = actorId`) und registriert
seinen Link bei Bootstrap bzw. Konto-Anlage. Policy: **kein
Auto-Provisioning** für externe Provider — nur explizit verlinkte
Identitäten lösen auf.

## Lokale Authentifizierung (heute)

Vollwertig für Entwicklung, Demos und self-hosted Deployments — ohne externe
Abhängigkeiten: argon2id-Passwörter, Login-Lockout (5 Versuche/15 min),
Server-Sessions (httpOnly-Cookie, 12 h TTL), Admin-Bootstrap über
`BOOTSTRAP_TOKEN` (HTTP) oder `AUTH_BOOTSTRAP_ADMIN_*` (Serverstart,
idempotent).

## OIDC-Konfigurationspfad (Folge-Iteration)

Keycloak ist **nicht** verpflichtend; OIDC ist ein austauschbarer Provider.
Der vorgesehene Vertrag existiert bereits: `ServerRuntimeConfig.identity`
(`@senticor/public-sector-sdk`) mit `issuerUrl`, `clientId`,
`sessionCookieName`, `tokenStorage: "server-session"`.

Ein OIDC-Callback implementiert später: Token-Validierung (issuer/jwks) →
`resolveActorForIdentity({ tenantId, provider: "oidc:<issuer>", subject })` →
dieselbe Session-Ausstellung wie der lokale Login. Die Autorisierung bleibt
unverändert — genau das sichern die Guard-Tests ab (ein via Mapping
aufgelöster Principal passiert dieselben Permission-Guards).

Beispielwerte (Keycloak): `issuerUrl = https://id.example.org/realms/verwaltung`,
`clientId = fachverfahren`. Entra ID: `issuerUrl =
https://login.microsoftonline.com/<tenant>/v2.0`. Identitäten werden pro
Tenant über die Benutzerverwaltung bzw. Provisioning explizit verlinkt
(`linkIdentity`).
