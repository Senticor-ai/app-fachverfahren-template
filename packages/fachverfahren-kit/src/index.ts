// fachverfahren-kit — öffentlicher Einstieg. Vertrag + Datenschicht; die fertigen UI-Bausteine (shadcn/Tailwind)
// folgen in ./components und werden hier re-exportiert.
export * from "./types.js";
export * from "./store.js";
// PROD-Wiring: der HTTP-`WorkspacePort` über die Domain-API (/api/*) + die reinen Server↔Client-Mapper + die
// Umgebungs-Naht (In-Memory-DEV ↔ HTTP-PROD).
export * from "./http-workspace.js";
export * from "./lib/http-mappers.js";
// Board/Kanban-Workspace (aus origin/main).
export * from "./board-types.js";
export * from "./board-store.js";
// Namens-Kollision aufloesen: `BoardColumn` existiert in BEIDEN — types.ts (unsere Arbeitsvorrat-
// Spalten-Config: key/label/tone/gruppe) UND board-types.ts (ihre Kanban-Spalten-Entity:
// columnId/boardId/title/...). Beide sind fachlich verschieden. Der Barrel exportiert die
// Kanban-Variante (board-client/KanbanBoard brauchen sie); die Arbeitsvorrat-Config bleibt intern
// in types.ts bzw. per Direktimport aus "../types.js" verfuegbar.
export type { BoardColumn } from "./board-types.js";
export * from "./contract-snapshot.js";
export * from "./format.js";
// Business-Logik als DATEN: Feldwert-/Options-Auflösung + der generische reine Interpreter (Tarif/Regeln/Codelisten).
export * from "./lib/antrag-felder.js";
export * from "./lib/interpreter.js";
// EINE Wahrheit über die Status-State-Machine (Übergangssuche + strukturelle Validierung).
export * from "./lib/status-machine.js";
// EINE DEV-seitige Wahrheit der Vier-Augen-Kernregel (Vorbereiter des letzten Übergangs).
export * from "./lib/vier-augen.js";
// PM-UPGRADE: reine Fractional-Index-Ordnung (Board-Drag&Drop) + reiner Auswerter des Regeln/Hooks-Frameworks
// + der ausführende Applier (mit Vier-Augen-Block).
export * from "./lib/rank.js";
export * from "./lib/automation.js";
// Collaboration: reine Ableitung von In-App-Benachrichtigungen (Zuweisung/Frist) aus dem Aufgabenbestand.
export * from "./lib/benachrichtigungen.js";
// Builder-Aspekt: reine strukturelle Prüfung + Kennzahlen einer `LeistungConfig` (Verfahren-Inspektor).
export * from "./lib/verfahren-pruefung.js";
export * from "./lib/automation-run.js";
export * from "./lib/portal.js";
export * from "./lib/unteraufgaben.js";
// KI-Extraktions-PORT (Dokument → Feld-Vorschläge mit Konfidenz) — vendor-neutral, Stub-Default.
export * from "./lib/dokument-extraktion.js";
// Nachweis-Upload-Regeln als DATEN: accept-Attribut, Einschränkungs-Text + reine Fail-Fast-Vorprüfung (Typ/Größe).
export * from "./lib/nachweis-pruefung.js";

// `cn` (clsx + tailwind-merge) — der kanonische Klassen-Merger des shadcn/ui-Musters. Öffentlich, damit
// App-Composition-Bausteine (z. B. das Board) Varianten token-konform mergen statt per Template-Literal.
export { cn } from "./lib/utils.js";

// UI-Bausteine (Tailwind + shadcn/ui OSS) — konsumieren ausschließlich den Vertrag (config/port/vorgang).
export * from "./ui/badge.js";
export * from "./components/AntragStepper.js";
// Arbeitsvorrat re-exportiert selektiv: seine interne `StatusPill`-Variante kollidiert sonst mit dem
// kanonischen `./components/StatusPill.js`-Export (gleicher Name) → ambige Star-Re-Exports.
export {
  Arbeitsvorrat,
  type ArbeitsvorratProps,
} from "./components/Arbeitsvorrat.js";
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
export * from "./components/KommentarThread.js";
export * from "./components/RegelwerkPanel.js";
export * from "./components/VerfahrenInspektor.js";
export * from "./components/WissensPanel.js";
export * from "./components/AktivitaetsFeed.js";
export * from "./components/RelationPanel.js";
export * from "./components/TriageInbox.js";
export * from "./components/KiSidecar.js";
export * from "./components/BenutzerEinstellungen.js";
export * from "./components/ReportingPanel.js";
export * from "./components/DateiUpload.js";
export * from "./components/NachweisAutorisierung.js";
export * from "./components/DokumentExtraktion.js";
export * from "./components/AdressValidierung.js";
export * from "./components/ConsentBanner.js";
export * from "./components/KommandoPalette.js";
export * from "./components/StatCard.js";
export * from "./components/ErrorSummary.js";
export * from "./components/KanbanCard.js";
export * from "./components/MoveCardMenu.js";
export * from "./components/KanbanColumn.js";
export * from "./components/KanbanBoard.js";
export * from "./components/CreateBoardDialog.js";
export * from "./components/BoardList.js";
export * from "./components/BoardCardDetail.js";
export * from "./components/ArchivedCardsPanel.js";

// ── Standardisierungs-Layer (M0/M1): der EINE Zustands-/Ansage-/Theming-Vertrag, auf den alle ──
// ── Komponenten zurückgreifen (shadcn/ui + Tailwind-Token). Eine Wahrheit pro Belang. ──
export * from "./hooks/use-view-state.js";
export * from "./hooks/use-step-machine.js";
export * from "./components/StatusRegion.js";
export * from "./components/ErrorState.js";
export * from "./components/ViewStateBoundary.js";
export * from "./components/SaveIndicator.js";
export * from "./components/KommuneTheme.js";

// ── Neue Komponenten (M2–M7): Bürger-Viewer, Sachbearbeitung, Zustellung, KI-Assist, A11y/i18n ──
export * from "./components/PdfViewer.js";
export * from "./components/OfficeDocViewer.js";
export * from "./components/NachweisBrowser.js";
export * from "./components/EPaymentPanel.js";
export * from "./components/TerminFristPanel.js";
export * from "./components/FourEyesReview.js";
export * from "./components/Postfach.js";
export * from "./components/ConfirmDialog.js";
export * from "./components/LanguageSwitch.js";
export * from "./components/Barrierefreiheitserklaerung.js";
export * from "./components/KiAssistPanel.js";

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
export * from "./components/ProzessEditor.js";
export * from "./components/MarkdownEditor.js";
export * from "./components/FileBrowser.js";
// ── Generische Struktur-/Anzeige-Bausteine (Formular-Fortschritt, Fakten-Listen, Verlauf, Hinweise) ──
export * from "./components/Stepper.js";
export * from "./components/DescriptionList.js";
export * from "./components/SummaryList.js";
export * from "./components/Timeline.js";
export * from "./components/Callout.js";

// ── KI-Anbindung (Port-only, EU-AI-Act): transparente Assistenz + Chat-Port + Agenten-UX-Primitives ──
// Vendor-neutral, kein Netz/Modell im Kit — echte Modelle docken an die Ports an. Mensch entscheidet (reviewErforderlich).
export * from "./lib/ai-assist.js";
export * from "./hooks/use-ai-assist.js";
export * from "./hooks/use-assistent.js";
export * from "./components/AgentStatusIndicator.js";
export * from "./components/StreamingText.js";
export * from "./components/AgentTrace.js";
export * from "./components/ToolCallCard.js";
export * from "./components/AssistentPanel.js";

// ── KI-Steuerung: der Mensch schaltet die KI (Präferenz-Schicht), humanOversight unabschaltbar; localStorage-Hook. ──
export * from "./lib/ki-steuerung.js";
export * from "./hooks/useKiSteuerung.js";
export * from "./components/KiSteuerung.js";

// ── Spracheingabe (Voice-PORT): on-device by default, Consent-gated; kein Mikrofon/SpeechRecognition im Kit. ──
export * from "./lib/voice-input.js";
export * from "./hooks/use-voice-input.js";
export * from "./components/VoiceInput.js";

// ── Fristen als DATEN: typisierte Dauer (Tag/Woche/Monat/Jahr) rendern + kalendergenaue Fälligkeit ableiten. ──
export * from "./lib/frist.js";

// ── Eingabe-Seite: de-DE Parsen (Betrag/IBAN/Datum) + DATEN-getriebene Feld-Validierung + barrierefreie Feld-Wrapper. ──
export * from "./lib/eingabe.js";
export * from "./components/BetragEingabe.js";
export * from "./components/ValidiertesFeld.js";

// ── Neue generische Bausteine: Ablauf-Diagramm, Vergleich/Diff, Gebühren-Aufstellung, Kalender, Export, Zustellungs-freie
//    In-App-Hinweise, Vertretung, Sprachvarianten/Leichte Sprache, Druck; Theme- + Barrierefreiheits-Steuerung. ──
export * from "./lib/status-mermaid.js";
export * from "./components/WorkflowDiagramm.js";
export * from "./components/VergleichsAnsicht.js";
export * from "./components/GebuehrenAnzeige.js";
export * from "./lib/export-csv.js";
export * from "./components/ExportDialog.js";
export * from "./components/NotificationCenter.js";
export * from "./components/FristenKalender.js";
export * from "./components/VertretungPanel.js";
export * from "./components/SprachvariantenText.js";
export * from "./components/DruckAnsicht.js";
export * from "./hooks/useTheme.js";
export * from "./components/ThemeToggle.js";
export * from "./hooks/useA11ySettings.js";
export * from "./components/BarrierefreiheitsPanel.js";
