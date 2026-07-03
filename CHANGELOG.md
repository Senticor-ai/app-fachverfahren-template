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
