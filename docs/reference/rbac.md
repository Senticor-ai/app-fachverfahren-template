# Rollen und RBAC

Der erste RBAC-Vertrag lebt in `@senticor/public-sector-sdk`.
Code-Bezeichner bleiben Englisch; deutsche Rollenbezeichnungen sind
Anzeige- und Dokumentationscopy.

Drei getrennte Konzepte, drei Begriffe:

- **Workspace-Rolle** (`app_users.role`): admin / member / citizen — bestimmt
  Permissions.
- **Permissions** (`workspace-permissions.ts`): autorisieren AKTIONEN — die
  einzige Autorisierungsquelle für Routen und UI-Guards.
- **Arbeitsbereiche** (Personas, `app_users.local_personas`/`oidc_personas`):
  steuern das Produkt-Erlebnis (sichtbare Sichten, Navigation) — **nie**
  Server-Autorisierung.

## Workspace-Rollen (`app_users.role`)

Die laufende Anwendung nutzt für den Mitarbeiter-Workspace (Boards,
Benutzerverwaltung, Audit, Export) ein schlankes, produktives Rollenmodell
direkt am Benutzerkonto: `admin`, `member` und `citizen` (selbstregistrierte
Bürger:innen). Routen prüfen **nie** Rollen-Literale, sondern immer
Workspace-Permissions über die EINE Autorisierungs-Pipeline
(`apps/fachverfahren/server/auth/authorization.ts`: Routen deklarieren ihre
Policy als Route-Config via `routeAuth`, daraus werden die preHandler
abgeleitet; eine `/auth`-/`/api`-Route ohne Policy bricht den Server-Start):

| Permission           | admin | member | citizen |
| -------------------- | ----- | ------ | ------- |
| `users.manage`       | ✅    | —      | —       |
| `boards.manage`      | ✅    | —      | —       |
| `boards.collaborate` | ✅    | ✅     | —       |
| `audit.read`         | ✅    | —      | —       |
| `tenant.export`      | ✅    | —      | —       |

In API-Antworten heißt das Feld `workspaceRole` (`role` bleibt EIN Release
als deprecated Alias). Feinere Rollen (Sachbearbeiter, Teamleiter,
Fachadministrator, Revision) entstehen später ausschließlich durch
Erweiterung dieses Mappings — ohne Routen-Refactoring. Abgrenzung: die
SDK-RBAC-Registry unten (citizen/ caseworker + `app_rbac_*`-Tabellen) ist der
Vertrag für fachliche Domain-Permissions und bewusst noch nicht mit dem
Workspace verdrahtet; `app_users.role` ist die heutige Wahrheit für
Workspace-Zugriffe.

`principal_version` (`app_users`) zählt JEDE principal-relevante Mutation
(Status, Rolle, Arbeitsbereiche, Modus) — Anker für optimistische
Nebenläufigkeit (`If-Match` im Admin-PATCH → 409 bei Konflikt) und künftige
Principal-Invalidierung. No-op-Mutationen (unveränderte Werte) erhöhen die
Version NICHT und erzeugen kein Audit-Event. Autorisierungsentscheidungen
laden das Konto ohnehin LIVE pro Request — entzogene Rechte wirken sofort.

## Arbeitsbereiche (Personas)

`buerger | sachbearbeitung | aufsicht` sind SICHT-Zugänge des Kontos, keine
Berechtigungen. Zwei Quellen plus Autoritäts-Policy
(`app_users.persona_management_mode`):

| Modus                | Wirksame Arbeitsbereiche | Lokale Pflege (Admin) |
| -------------------- | ------------------------ | --------------------- |
| `local` (Default)    | `local_personas`         | erlaubt               |
| `oidc_additive`      | Union aus lokal + extern | erlaubt               |
| `oidc_authoritative` | `oidc_personas` (extern) | gesperrt (409)        |

Die Ableitung ist `effectivePersonas()` (`@senticor/app-store-postgres`) —
deterministisch, kanonische Reihenfolge, dupe-frei. Der Client blendet
Wechsler/Landing-Kacheln entsprechend; Deep-Links auf fremde Arbeitsbereiche
leitet `RequirePersonaExperience` (App) um — ausdrücklich NUR Navigation,
keine Autorisierungsgrenze. **Null Arbeitsbereiche ist ein gültiger
Zustand**: die Landing zeigt dann den Hinweis „Für Ihr Konto ist noch kein
Arbeitsbereich freigeschaltet".

Fail-closed-Defaults: neue Konten starten OHNE Arbeitsbereiche
(Spalten-Default leer); jede Anlage entscheidet explizit (Admin-API:
Pflichtfeld `personas`; Self-Signup: `["buerger"]`; Bootstrap-Admin: alle
drei). Die Migration `20260713000000_user_personas` backfillt NUR
Bestandskonten (NULL-Legacy-Marker, replay-sicher).

Der Client fällt einzig bei ALT-Servern ohne die in `GET /auth/status`
gemeldete Capability `userPersonas` auf „alle drei" zurück (rollendes
Upgrade); meldet der Server die Capability und liefert trotzdem keine
`personas`, gilt fail closed LEER.

## Self-Signup (Registrierung)

`AUTH_REGISTRATION_MODE`: `disabled` (Default) | `open_unverified`. Der
offene Modus heißt ehrlich so, bis E-Mail-Verifikation existiert. `POST
/auth/register` legt atomar (`createLocalUserWithCredential`: User +
Credential + local-Identity-Link in EINER Transaktion) ein Konto
`workspaceRole=citizen`, `localPersonas=["buerger"]` an — Antwort NEUTRAL
(Anti-Enumeration, kein Auto-Login), Tenant NUR aus dem
Deployment-Kontext (`RegistrationContextResolver`), nie aus dem Request.
Drosselung über das `RateLimiter`-Interface (In-Memory-Default = nur
Single-Process; Multi-Instanz braucht eine verteilte Implementierung).

Offene Ausbaupunkte vor einem ehrlichen `open` (PLAN): E-Mail-Verifikation
(braucht capability:notification), Passwort-Reset, Invite-Flow
(`invite_only`), Terms-Versionierung, verteiltes Rate-Limiting.

## OIDC-Vorbereitung (Keycloak & Co.)

Ausführbarer Claim-Vertrag in
`apps/fachverfahren/server/auth/external-personas.ts` (Parser + Tests
existieren VOR dem OIDC-Flow). Kanonischer Claim — bewusst NUR
Arbeitsbereiche, Workspace-Rollen/Permissions bleiben lokal verwaltet:

```json
{ "senticor_claims_version": 1, "senticor_personas": ["sachbearbeitung"] }
```

Claim-Zustands-Semantik:

| Zustand                  | Bedeutung / Verhalten                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Werte vorhanden          | validierte Übernahme (`sync`, Voll-Set, No-op-erkennend)                                    |
| leeres Array             | BEWUSSTES Entfernen externer Zuweisungen                                                    |
| Claim fehlt              | `local`/`oidc_additive`: keine Mutation; `oidc_authoritative`: Login ablehnen (fail closed) |
| unbekannte Werte         | filtern + auditieren                                                                        |
| malformed (kein Array …) | `MalformedPersonaClaimError` — nie überschreiben                                            |

Der Adapter (später) übersetzt Provider-Strukturen in diesen Claim — die App
liest nie `realm_access`/Gruppen direkt; Persona-Keys sind KEINE
Keycloak-Rollennamen (Mapping z.B. `fachverfahren-buerger` → `buerger` lebt
im Adapter). Externe Identitäten binden an issuer+subject (Identity-Links);
nie Re-Link über E-Mail. Login/Bootstrap/Registrierung konvergieren in ein
internes `AuthenticationResult` — der OIDC-Callback produziert später
dasselbe Objekt und läuft durch dieselbe Session-/Autorisierungs-Pipeline.

Ausbaupfad Datenmodell (dokumentiert, V1 bewusst Array-Spalten):
Assignment-Tabellen (`app_persona_assignments` mit source/validity) und
Mandanten-Mitgliedschaften (`app_tenant_memberships`), sobald Mehr-Mandanten-
oder Provenienz-Anforderungen real werden.

## Eingebaute Rollen

| Code-Rolle   | Anzeige         | Zweck                                                    |
| ------------ | --------------- | -------------------------------------------------------- |
| `citizen`    | Bürgerin/Bürger | Eigene Sitzung, Einstellungen, Posteingang und Ausgang   |
| `caseworker` | Sachbearbeitung | Behördlicher Posteingang/Ausgang und Vorgangsbearbeitung |

`caseworker` ist der technische Rollen-Key für Sachbearbeiterinnen und
Sachbearbeiter.

Die UI-Rolle ist keine Autorisierung. Fastify-Routen prüfen serverseitig gegen
Permissions aus der RBAC-Registry.

## Wichtige Permissions

- `preferences.read`
- `preferences.write`
- `mailbox.own.read`
- `mailbox.own.write`
- `mailbox.authority.read`
- `mailbox.authority.write`
- `case.read`
- `case.decision.prepare`

Schreiben reitet nie auf einem Leserecht: Mailbox-POSTs verlangen die
eigenen `*.write`-Permissions (Bürger nur `mailbox.own.write`,
Sachbearbeitung nur `mailbox.authority.write`).

## Neue Rollen ergänzen

Neue Rollen werden nicht als verstreute `if`-Bedingungen eingeführt. Vorgehen:

1. Rolle mit `extendRbacRegistry(...)` registrieren.
2. Rolle in einer Migration in `app_rbac_roles` eintragen.
3. Permissions in `app_rbac_permissions` und `app_rbac_role_permissions`
   verknüpfen.
4. Actor-Zuordnungen in `app_actor_roles` schreiben.
5. API- und Storybook-Tests für erlaubte und verbotene Pfade ergänzen.

Domain-Module (Generator-Pfad, PLAN) dürfen eigene Permissions definieren,
müssen sie aber im `domain.module.yaml` und in Migrationen nachvollziehbar
machen.
