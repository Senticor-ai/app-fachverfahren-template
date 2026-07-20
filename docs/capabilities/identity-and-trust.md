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

## OIDC-Login (Keycloak, implementiert)

Keycloak ist **nicht** verpflichtend; OIDC ist ein austauschbarer Provider.
Der Flow ist implementiert (Authorization Code + PKCE, Standard-OIDC via
Discovery + JWKS): `apps/fachverfahren/server/auth/oidc.ts` (purer, testbarer
Kern) + `auth/oidc-routes.ts` (Fastify-Verdrahtung). **OPT-IN** via Umgebung —
ohne diese Variablen läuft die Vorlage mit lokalem Login weiter:

- `OIDC_ISSUER_URL` · `OIDC_CLIENT_ID` · `OIDC_REDIRECT_URI` (exakt wie bei
  Keycloak registriert) · optional `OIDC_TENANT_ID`, `OIDC_POST_LOGIN_REDIRECT`.

Routen: `GET /auth/oidc/login` (Redirect zum IdP; state/nonce/PKCE im httpOnly
Flow-Cookie) → `GET /auth/oidc/callback` (Code→Token-Exchange, ID-Token-
Validierung mit `jose`: Signatur/JWKS + issuer + audience + exp + **nonce**,
`state`-Vergleich = CSRF) → `resolveActorForIdentity({ tenantId, provider:
"oidc:<issuer>", subject })` → dieselbe Session-Ausstellung wie der lokale Login.
Die Autorisierung bleibt unverändert (die Guard-Tests sichern das ab). KEINE
Auto-Provisionierung: eine nicht verlinkte Identität ergibt 403.

Beispielwerte (Keycloak): `issuerUrl = https://id.example.org/realms/verwaltung`,
`clientId = fachverfahren`. Entra ID: `issuerUrl =
https://login.microsoftonline.com/<tenant>/v2.0`. Identitäten werden pro
Tenant über die Benutzerverwaltung bzw. Provisioning explizit verlinkt
(`linkIdentity`).

Beispielwerte (Keycloak): `issuerUrl = https://id.example.org/realms/verwaltung`,
`clientId = fachverfahren`. Entra ID: `issuerUrl =
https://login.microsoftonline.com/<tenant>/v2.0`. Identitäten werden pro
Tenant über die Benutzerverwaltung bzw. Provisioning explizit verlinkt
(`linkIdentity`).
