# Changelog

Alle nennenswerten Änderungen an diesem Template werden in dieser Datei
dokumentiert.

## Unveröffentlicht

### Hinzugefügt

- **Motion-Token-Layer** (`styles.css`, Spec §4.7): `--fv-duration-*` + `--fv-ease-out`,
  globale `transition`-Defaults (150 ms/ease-out), Utilities `fv-transition`/`fv-enter`/
  `fv-card-interactive` + `animate-fv-*`; neues Gate `check:motion` (Ratchet, kein Bounce).
- **KI-Anbindung (Port-only, EU-AI-Act, vendor-neutral):** `KiAssistPort`/`KiChatPort`
  (5 Transparenzelemente, `reviewErforderlich: true`), Agenten-UX (`AgentStatusIndicator`,
  `StreamingText`, `AgentTrace`, `ToolCallCard`, `AssistentPanel`), `KiSteuerung`
  (humanOversight unabschaltbar, `useKiSteuerung` localStorage) — kein Modell/Netz im Kit.
- **Spracheingabe:** `VoicePort` (on-device, Consent-gated), `use-voice-input`, `VoiceInput`
  — kein `getUserMedia`/`SpeechRecognition` im Kit.
- **Eingabe/Berechnung/Währung/Validierung:** `lib/eingabe` (de-DE Parsen, IBAN Mod-97,
  Datum, DATEN-getriebene `validiereFeld`), `BetragEingabe`, `ValidiertesFeld`.
- **Weitere Bausteine:** `WorkflowDiagramm`, `VergleichsAnsicht`, `GebuehrenAnzeige`,
  `NotificationCenter`, `FristenKalender`, `VertretungPanel`, `SprachvariantenText`,
  `DruckAnsicht`, `ExportDialog`, `ThemeToggle` (+`useTheme`), `BarrierefreiheitsPanel`
  (+`useA11ySettings`) — token-only, light/dark/High-Contrast, WCAG 2.2 AA.
- **Governed-Build-Kompatibilität:** `check:leistung-contract` (Vertrags-Frische + Struktur),
  `test:e2e` (Persona-Routen gegen reales Bundle via `app.inject()`), Skill `backend-fastify`,
  `docs/reference/{governed-build-contract,ai-assist-integration}.md`.
- Storybook: Theme-/A11y-Toolbar-Decorator (light/dark/High-Contrast/Groß-Text).

Ab hier: je Zeile EIN Änderungsfragment aus [`.template-changes/`](.template-changes/) —
die Fragmente tragen Begründung und Migrationshinweis, diese Liste nur den Zeiger.

- **Team-Workspace-Fundament** — Workspace-Rollen `admin`/`member`, Permissions und Migration:
  [`2026-07-workspace-foundation.md`](.template-changes/2026-07-workspace-foundation.md).
- **Anmeldepflichtige Landing** — `/` als einzige unauthentifizierte Route plus Session-Gate:
  [`2026-07-landing-auth-gate.md`](.template-changes/2026-07-landing-auth-gate.md).
- **Arbeitsbereiche je Konto** (`buerger`/`sachbearbeitung`/`aufsicht`), fail-closed und OIDC-ready:
  [`2026-07-user-personas-self-signup.md`](.template-changes/2026-07-user-personas-self-signup.md);
  serverseitig geöffnet für beliebige Personas:
  [`2026-07-personas-open.md`](.template-changes/2026-07-personas-open.md).
- **OIDC-Login** (Keycloak, Authorization Code + PKCE, Discovery + JWKS):
  [`2026-07-oidc-keycloak.md`](.template-changes/2026-07-oidc-keycloak.md).
- **Lokaler Dev-Workflow** — Vite-Dev-Proxy auf `/auth`, `/api`, `/runtime-config.json`:
  [`2026-07-dev-workspace-runtime.md`](.template-changes/2026-07-dev-workspace-runtime.md).
- **BFF- und Runtime-Pakete** — `app-runtime-fastify`, `app-bff-contracts`, `app-bff-fastify`,
  interner OpenAPI-Snapshot mit Gate `check:openapi`, Rauchtest `smoke:runtime`:
  [`2026-07-bff-runtime-packages.md`](.template-changes/2026-07-bff-runtime-packages.md).
- **Agentic Composables** — verantwortete Fähigkeitseinheiten mit Spine-Agent:
  [`2026-07-agentic-composables.md`](.template-changes/2026-07-agentic-composables.md).
- **Evidence-Ledger**, hash-verkettet:
  [`2026-07-evidence-ledger.md`](.template-changes/2026-07-evidence-ledger.md); durabel in Postgres:
  [`2026-07-evidence-ledger-postgres.md`](.template-changes/2026-07-evidence-ledger-postgres.md).
- **Verfahrens-Wissens-Store** mit Postgres-Adapter (append-only `app_verfahren_wissen`):
  [`2026-07-verfahren-wissen-postgres.md`](.template-changes/2026-07-verfahren-wissen-postgres.md).
- **Arbeitslisten v2** — Pagination, Suche, gespeicherte Ansichten, Sammelaktionen:
  [`2026-07-worklist-v2.md`](.template-changes/2026-07-worklist-v2.md).
- **DSGVO-Löschung** (Art. 17 / §84 SGB X) über die volle Naht:
  [`2026-07-dsgvo-loeschung.md`](.template-changes/2026-07-dsgvo-loeschung.md), dazu die beiden
  Schutzschichten davor — **Legal Hold**:
  [`2026-07-legal-hold.md`](.template-changes/2026-07-legal-hold.md) und **Aufbewahrungsfrist**:
  [`2026-07-aufbewahrungsfrist.md`](.template-changes/2026-07-aufbewahrungsfrist.md).
- **Rechtsbehelf** — server-autoritative Fristprüfung:
  [`2026-07-rechtsbehelf-fristpruefung.md`](.template-changes/2026-07-rechtsbehelf-fristpruefung.md)
  und Abhilfe/Nichtabhilfe als auditierte Übergänge:
  [`2026-07-rechtsbehelf-entscheidung.md`](.template-changes/2026-07-rechtsbehelf-entscheidung.md).
- **PDF/A-Bescheid** ohne Java (sRGB-OutputIntent + XMP):
  [`2026-07-pdfa-bescheid.md`](.template-changes/2026-07-pdfa-bescheid.md).
- **PWA-Installierbarkeit** für iOS, Android und Desktop:
  [`2026-07-pwa-installability.md`](.template-changes/2026-07-pwa-installability.md).
- **Public-Sector-UI-Styles** — tokenisierte `ps-*`-Komponentenschicht im Kit-Stylesheet:
  [`2026-07-public-sector-ui-styles.md`](.template-changes/2026-07-public-sector-ui-styles.md).
- **Rechtsbehelfs-Slot im Bescheid** — eine Belehrung ohne Pflicht-Slot tötet jeden Bescheid
  (Commit `bb72b68`).
- **Nachweiskette der Aufsicht** wird serverseitig gerechnet (Commits `491212c`, `57909bd`).
- **VA-Pflichtangaben durch die Naht** — `verwaltungsaktInhalt` reist mit, statt am Server zu
  verschwinden (Commit `77d643d`).
- **Die Naht als Werkzeug** (`seam:shape`/`seam:check`/`seam:set`), die Ergebnis-Plakette und der
  fail-closed `HOST`-Default (Commit `8bb5d24`); das Werkzeug findet die Naht auch in jeder
  ERZEUGTEN App (Commit `c7432fa`).
- **Erdungs-Felder im OpenAPI-Snapshot** (`rechtsgrundlagen`, `domainsOhneWissen`) — der BFF lieferte
  sie bereits (Commit `3a3c70c`).

### Geändert

- **Gesunder Scaffold**, durch PR-Builder/CI/Precommit-Gate geschützt:
  [`2026-07-scaffolded-app-ci-health.md`](.template-changes/2026-07-scaffolded-app-ci-health.md);
  identitätsbasierter Selbst-Skip für `scaffold-health` in roh kopierten Konsumenten:
  [`2026-07-scaffold-health-identity-skip.md`](.template-changes/2026-07-scaffold-health-identity-skip.md).
- **Ownership** — `template:update` merged neue `defaultOwnership`-Einträge:
  [`2026-07-ownership-defaults-merge.md`](.template-changes/2026-07-ownership-defaults-merge.md);
  die geteilten Runtime-Pakete sind template-verwaltet:
  [`2026-07-packages-ownership.md`](.template-changes/2026-07-packages-ownership.md).
- **Web-/K8s-Delivery gehärtet** — Cache-/Security-Header, Helm, Service-Worker-Opt-in,
  Supply-Chain-Scans, Policy-Gates:
  [`2026-07-web-k8s-delivery-hardening.md`](.template-changes/2026-07-web-k8s-delivery-hardening.md).
- **Vertrags-Vokabular englisch** — `Ki` → `Ai`, `Wissen` → `Knowledge`, `Herkunft` → `Provenance`
  (Commit `7d177ad`); das TypeScript-Gate deckt jetzt auch `scripts/**` (Commit `6522cc6`).
- **Landing ohne Fehlergrenze** plus Ratsche gegen Hooks nach bedingtem `return` (Commit `6bd6d4b`).

### Sicherheit

- **Sicherheits-Header auf JEDER Antwort** — der Server setzte zuvor keinen einzigen
  (Commit `7fece59`).
- **`fast-uri` auf `^3.1.6` / `^4.1.3` angehoben** (beide Linien, Patch-Ebene). Die Begründung samt
  Messung steht bei den Overrides in `pnpm-workspace.yaml` und wird hier nicht kopiert.

## 0.1.0-rc.1 - 2026-06-25

### Enthalten

- React/Vite-Frontend und Fastify-BFF als dünne Fachverfahren-Vorlage.
- Sachbearbeitungs- und Bürger:innen-Ansicht mit fachneutralen MSW-Mocks.
- Public-Sector-Capability-Contracts, Provider-Packs und Jurisdiction-Packs.
- PostgreSQL-App-Store, Migrations-Workload und erster E2E-Datenpfad.
- Domain-Modul-Struktur mit Manifesten, Screen Contracts, Rechten, Events,
  Migrationen, Compliance-Profilen und Tests.
- Template-Lifecycle mit Scaffold, Update, Doctor, Ownership-Metadaten und
  reproduzierbarer Provenienz unter `.template/`.
- GitHub- und GitLab-CI-Gates für Format, Lint, ESM, TypeScript-only-Policy,
  Storybook-Abdeckung, CSS-Token, Template-Invarianten, Scaffold, Tests,
  Kubernetes-Render und Evidence-Bundle.
- Kaniko-basierter Container-Build für unprivilegierte openCode-/GitLab-Runner.

### Hinweise

- Release Candidate für frühe Adopter und Review in öffentlichen GovTech-Stacks.
- Fachliche Beispiele bleiben außerhalb der Template-Runtime unter
  `docs/examples/`.
- Brechende Änderungen vor `1.0.0` sind möglich und werden über
  `.template-changes/` und Template-Migrationen sichtbar gemacht.
