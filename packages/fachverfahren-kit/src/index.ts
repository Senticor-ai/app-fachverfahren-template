// fachverfahren-kit — öffentlicher Einstieg. Vertrag + Datenschicht; die fertigen UI-Bausteine (shadcn/Tailwind)
// folgen in ./components und werden hier re-exportiert.
export * from "./types.js";
export * from "./store.js";
export * from "./contract-snapshot.js";

// UI-Bausteine (Tailwind + shadcn/ui OSS) — konsumieren ausschließlich den Vertrag (config/port/vorgang).
export * from "./ui/badge.js";
export * from "./components/AntragStepper.js";
// Arbeitsvorrat re-exportiert selektiv: seine interne `StatusPill`-Variante kollidiert sonst mit dem
// kanonischen `./components/StatusPill.js`-Export (gleicher Name) → ambige Star-Re-Exports.
export { Arbeitsvorrat, type ArbeitsvorratProps } from "./components/Arbeitsvorrat.js";
export * from "./components/AufsichtDashboard.js";
export * from "./components/StatusPill.js";
export * from "./components/StatusVerfolgung.js";
export * from "./components/KiVorschlag.js";
export * from "./components/EvidenceCard.js";
export * from "./components/PersonaSwitcher.js";
export * from "./components/FachverfahrenShell.js";
export * from "./components/VorgangDetail.js";
export * from "./components/EntscheidungPanel.js";
export * from "./components/ReviewWorkspace.js";
export * from "./components/HilfePanel.js";
// Neue generische Bausteine (Bürger + Sachbearbeitung), config-getrieben + barrierefrei (BITV 2.2 AA).
export * from "./components/BundIDLoginForm.js";
export * from "./components/BescheidView.js";
export * from "./components/AuditTimeline.js";
export * from "./components/ReportingPanel.js";
export * from "./components/DateiUpload.js";
export * from "./components/ConsentBanner.js";
export * from "./components/KommandoPalette.js";
export * from "./components/StatCard.js";
export * from "./components/ErrorSummary.js";

// ── Standardisierungs-Layer (M0/M1): der EINE Zustands-/Ansage-/Theming-Vertrag, auf den alle ──
// ── Komponenten zurückgreifen (shadcn/ui + Tailwind-Token). Eine Wahrheit pro Belang. ──
export * from "./hooks/use-view-state.js";
export * from "./hooks/use-step-machine.js";
export * from "./components/StatusRegion.js";
export * from "./components/ErrorState.js";
export * from "./components/ViewStateBoundary.js";
export * from "./components/SaveIndicator.js";
export * from "./components/KommuneTheme.js";

// ── Vollständige Primitiv-Bibliothek (shadcn/Radix, MIT) — öffentlich für Konsumenten ──
export * from "./ui/accordion.js";
export * from "./ui/alert.js";
export * from "./ui/alert-dialog.js";
export * from "./ui/avatar.js";
export * from "./ui/breadcrumb.js";
export * from "./ui/button.js";
export * from "./ui/card.js";
export * from "./ui/chart.js";
export * from "./ui/checkbox.js";
export * from "./ui/collapsible.js";
export * from "./ui/context-menu.js";
export * from "./ui/dialog.js";
export * from "./ui/dropdown-menu.js";
export * from "./ui/form-field.js";
export * from "./ui/hover-card.js";
export * from "./ui/input.js";
export * from "./ui/label.js";
export * from "./ui/pagination.js";
export * from "./ui/popover.js";
export * from "./ui/progress.js";
export * from "./ui/radio-group.js";
export * from "./ui/resizable.js";
export * from "./ui/scroll-area.js";
export * from "./ui/select.js";
export * from "./ui/separator.js";
export * from "./ui/sheet.js";
export * from "./ui/sidebar.js";
export * from "./ui/skeleton.js";
export * from "./ui/slider.js";
export * from "./ui/switch.js";
export * from "./ui/table.js";
export * from "./ui/tabs.js";
export * from "./ui/textarea.js";
export * from "./ui/toggle.js";
export * from "./ui/toggle-group.js";
export * from "./ui/tooltip.js";
// ── Generische gov-Blöcke ──
export * from "./components/Banner.js";
export * from "./components/EmptyState.js";
export * from "./components/FilterBar.js";
export * from "./components/PageHeader.js";
export * from "./ui/calendar.js";
export * from "./ui/combobox.js";
export * from "./ui/data-table.js";
export * from "./ui/date-picker.js";
export * from "./ui/multi-select.js";
export * from "./ui/sonner.js";
export * from "./components/CameraCapture.js";
export * from "./components/DocumentPreview.js";
export * from "./components/ImageCropper.js";
export * from "./components/InstallPrompt.js";
export * from "./components/MapView.js";
export * from "./components/MobileNav.js";
export * from "./components/ResponsiveContainer.js";
export * from "./components/RichTextEditor.js";
export * from "./components/SignaturePad.js";
export * from "./components/pwa.js";
export * from "./components/MarkdownView.js";
export * from "./components/MermaidView.js";
export * from "./components/MarkdownEditor.js";
export * from "./components/FileBrowser.js";
