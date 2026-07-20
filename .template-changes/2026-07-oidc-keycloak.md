---
bump: minor
updateMode: review
migration: none
---

# OIDC-Login (Keycloak, Authorization Code + PKCE)

Der bislang nur skizzierte OIDC-Callback ist jetzt implementiert — echte
Identitäts-Föderation gegen Keycloak (Standard-OIDC via Discovery + JWKS),
Public-Client + PKCE (kein Client-Secret nötig).

- Neue Routen `GET /auth/oidc/login` (Redirect zum IdP; state/nonce/PKCE im httpOnly
  Flow-Cookie) und `GET /auth/oidc/callback` (Code→Token-Exchange, ID-Token-Validierung
  mit `jose`: Signatur/JWKS + issuer + audience + exp + nonce, dann
  `resolveActorForIdentity` → dieselbe Session wie der lokale Login).
- **OPT-IN via Umgebung** — ohne diese Variablen ändert sich nichts (die Vorlage läuft
  wie bisher mit lokalem Login):
  - `OIDC_ISSUER_URL` (z.B. `https://id.example.org/realms/verwaltung`)
  - `OIDC_CLIENT_ID` (z.B. `fachverfahren`)
  - `OIDC_REDIRECT_URI` (muss EXAKT der bei Keycloak registrierten URI entsprechen)
  - optional `OIDC_TENANT_ID`, `OIDC_POST_LOGIN_REDIRECT`
- SICHERHEIT: PKCE (S256), `state` gegen CSRF, `nonce` gegen Replay, vollständige
  ID-Token-Validierung; KEINE Auto-Provisionierung (nur explizit verlinkte Identitäten
  lösen einen Actor auf, sonst 403). Neue Dependency `jose` (server-only).
- Der BundID-Login bleibt vorerst ein Mock (`BundIDLoginForm.tsx`); der generische
  OIDC-Flow ersetzt ihn, sobald ein IdP konfiguriert ist.
