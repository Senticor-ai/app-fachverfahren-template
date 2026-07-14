# Fachverfahren Kit Component Catalog

This catalog is the stable lookup surface for build agents. The reusable
Fachverfahren UI building blocks live in the GitHub template repository, not in
generated `modules/<domain>/` scaffolds.

## Canonical Paths

| Purpose                                | Path                                         | Agent rule                                                    |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Complete Fachverfahren building blocks | `packages/fachverfahren-kit/src/components/` | Use first for citizen, caseworker and audit screens.          |
| shadcn/Radix/Tailwind primitives       | `packages/fachverfahren-kit/src/ui/`         | Use only when no complete building block fits.                |
| Package entrypoint                     | `packages/fachverfahren-kit/src/index.ts`    | Import from `@senticor/fachverfahren-kit`; keep exports here. |
| App shell + the ONE exchange seam      | `apps/fachverfahren/src/`                    | Thin composition; a build only edits `leistung.config.ts`.    |
| Storybook review surface               | `packages/fachverfahren-kit/src/stories/`    | Add or update stories for new reusable UI.                    |
| Public-sector facade                   | `packages/public-sector-ui/src/`             | Lower-level public-sector patterns and stories.               |

Domain modules under `modules/<domain>/` are generated outputs. They should
compose these package components and provide domain data/contracts. They should
not carry copied component templates.

## Component Groups

### Shell, Navigation And Layout

- `FachverfahrenShell`
- `MobileNav`
- `PageHeader`
- `ResponsiveContainer`
- `PersonaSwitcher`
- `BarrierefreiheitsPanel`
- `KommuneTheme`
- `ResponsiveWorkspaceShell` (public-sector-ui)
- `CaseContextPanel` (public-sector-ui)
- `ProcessTimeline` (public-sector-ui)
- `TaskQueuePanel` (public-sector-ui)
- `DeadlinePanel` (public-sector-ui)
- `QuickFilterChips` (public-sector-ui)
- `BulkActionBar` (public-sector-ui)
- `StickyActionBar` (public-sector-ui)
- `SavedViewsToolbar` (public-sector-ui)

### Citizen Intake And Self-Service

- `BundIDLoginForm`
- `AntragStepper`
- `DateiUpload`
- `DokumentExtraktion`
- `AdressValidierung`
- `ConsentBanner`
- `EPaymentPanel`
- `StatusVerfolgung`
- `Postfach`
- `CommunicationThread` (public-sector-ui)
- `ProcessTimeline` (public-sector-ui)
- `DocumentChecklistPanel` (public-sector-ui)
- `BescheidView`
- `HilfePanel`
- `InstallPrompt`

### Caseworker And Audit Workspaces

- `Arbeitsvorrat`
- `VorgangDetail`
- `CaseContextPanel` (public-sector-ui)
- `ProcessTimeline` (public-sector-ui)
- `ReviewWorkspace`
- `EntscheidungPanel`
- `DecisionComposer` (public-sector-ui)
- `CalculationTrace` (public-sector-ui)
- `CommunicationThread` (public-sector-ui)
- `ReadinessGatePanel` (public-sector-ui)
- `TaskQueuePanel` (public-sector-ui)
- `DeadlinePanel` (public-sector-ui)
- `HandoffPanel` (public-sector-ui)
- `QuickFilterChips` (public-sector-ui)
- `BulkActionBar` (public-sector-ui)
- `EvidenceReviewGrid` (public-sector-ui)
- `DocumentChecklistPanel` (public-sector-ui)
- `AssumptionRegisterPanel` (public-sector-ui)
- `SourceCoveragePanel` (public-sector-ui)
- `ResponsiveWorkspaceShell` (public-sector-ui)
- `SavedViewsToolbar` (public-sector-ui)
- `StickyActionBar` (public-sector-ui)
- `FourEyesReview`
- `AufsichtDashboard`
- `AuditTimeline`
- `ReportingPanel`
- `TerminFristPanel`
- `VerfahrenInspektor` (Storybook-/Diagnosefläche für die Struktur der `LeistungConfig`)

`Arbeitsvorrat` rendert Desktop als sortierbare Tabelle mit sticky Header und
auf Mobil als touchfähige Kartenliste mit eigener Sortierkontrolle. Die
Schnellfilter bleiben mehrfach aktivierbar und lassen den letzten aktiven
Status nicht abwählen. Optional aktiviert `Arbeitsvorrat` Pagination und
seitenbezogene Bulk-Auswahl über Props; ohne diese Props bleibt das bestehende
Einzelauswahl-Verhalten erhalten.

`CaseInbox` in `packages/public-sector-ui` deckt denselben Arbeitslistenvertrag
für generische Master-Detail-Flächen ab: Suche über ID, Antragsteller:in,
Betreff und Status, gespeicherte Ansichten, Pagination, mobile Auswahlkarten
und deaktivierte Bulk-Actions ohne Auswahl.

### Evidence, Documents And Rich Content

- `CommunicationThread` (public-sector-ui)
- `EvidenceReviewGrid` (public-sector-ui)
- `DocumentChecklistPanel` (public-sector-ui)
- `SourceCoveragePanel` (public-sector-ui)
- `NachweisBrowser`
- `DocumentPreview`
- `PdfViewer`
- `OfficeDocViewer`
- `MarkdownView`
- `MarkdownEditor`
- `MermaidView`
- `RichTextEditor`
- `FileBrowser`

### AI, Status And Feedback

- `CaseContextPanel` (public-sector-ui)
- `ProcessTimeline` (public-sector-ui)
- `DecisionComposer` (public-sector-ui)
- `CalculationTrace` (public-sector-ui)
- `ReadinessGatePanel` (public-sector-ui)
- `TaskQueuePanel` (public-sector-ui)
- `HandoffPanel` (public-sector-ui)
- `DeadlinePanel` (public-sector-ui)
- `AssumptionRegisterPanel` (public-sector-ui)
- `SourceCoveragePanel` (public-sector-ui)
- `KiVorschlag`
- `KiAssistPanel`
- `EvidenceCard`
- `StatusPill`
- `StatusRegion`
- `ViewStateBoundary`
- `ErrorState`
- `ErrorSummary`
- `SaveIndicator`
- `EmptyState`
- `Banner`
- `StatCard`
- `FilterBar`

### Media And Interaction Helpers

- `CameraCapture`
- `ImageCropper`
- `MapView`
- `SignaturePad`
- `KommandoPalette`
- `LanguageSwitch`
- `BarrierefreiheitsPanel`
- `Barrierefreiheitserklaerung`
- `pwa`

## Primitive Library

`packages/fachverfahren-kit/src/ui/` contains the shadcn/Radix/Tailwind
primitive layer: accordion, alert, alert-dialog, avatar, badge, breadcrumb,
button, calendar, card, chart, checkbox, collapsible, combobox, context-menu,
data-table, date-picker, dialog, dropdown-menu, form-field, hover-card, input,
label, multi-select, pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner,
switch, table, tabs, textarea, toggle, toggle-group, tooltip and utils.

## Build Agent Contract

1. Read this catalog before adding UI.
2. Prefer complete `fachverfahren-kit` components over one-off screen code.
3. Import through `@senticor/fachverfahren-kit` when possible; add missing
   exports to `packages/fachverfahren-kit/src/index.ts`.
4. Keep reusable UI in packages, not in generated domain modules.
5. Use `modules/<domain>/` only for domain contracts, config, tests and thin
   screen composition.
6. Run Storybook/type/test checks after changing package components.
