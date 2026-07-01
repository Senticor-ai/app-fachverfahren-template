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
| App shell                              | `apps/fachverfahren-template/src/app/`       | Thin module mount and shell, no domain logic.                 |
| Storybook review surface               | `apps/fachverfahren-template/src/stories/`   | Add or update stories for new reusable UI.                    |
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
- `KommuneTheme`

### Citizen Intake And Self-Service

- `BundIDLoginForm`
- `AntragStepper`
- `DateiUpload`
- `AdressValidierung`
- `ConsentBanner`
- `EPaymentPanel`
- `StatusVerfolgung`
- `Postfach`
- `BescheidView`
- `HilfePanel`
- `InstallPrompt`

### Caseworker And Audit Workspaces

- `Arbeitsvorrat`
- `VorgangDetail`
- `ReviewWorkspace`
- `EntscheidungPanel`
- `FourEyesReview`
- `AufsichtDashboard`
- `AuditTimeline`
- `ReportingPanel`
- `TerminFristPanel`

### Evidence, Documents And Rich Content

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
