# Changelog

Alle nennenswerten Änderungen an diesem Template werden in dieser Datei
dokumentiert.

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
