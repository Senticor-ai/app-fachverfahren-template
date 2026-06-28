# UX- & Build-Qualitäts-Upgrade-Plan — fachverfahren-kit

> Autoritativer Implementierungs-Fahrplan für das generische, offene Fachverfahren-Kit.
> Recherche-gestützt, adversarial auf Vollständigkeit + Compliance geprüft. Generisch / data-driven
> (ein Kit → alle Fachverfahren: Kommune · HR · Web), kein Domänen-Hardcode. Validierung ausschließlich
> über die Builder-UI (DOM-Check + Screenshots + Vision-Judge auf dem gerenderten Ergebnis).

## 1. Executive Summary

**Ziel:** UX, Qualität der UX-Ausgaben und Build-Qualität gemeinsam maximieren — über EINEN schmalen,
generischen Standardisierungs-Layer statt verstreutem Eigenbau je Komponente.

**Leitprinzipien (nicht verhandelbar):**
- **Eine Wahrheit pro Belang** — Status-Wortlaut, Lade-Ansage, Validierungs-Text, Tokens, Bewegungs-Policy je genau EINMAL gepflegt; alle Ausgaben daraus erzeugt → kein Drift.
- **Generisch / data-driven** — Spalten/Felder/Schritte aus Config/Schema; ein Kit für alle Apps.
- **BITV 2.0 / WCAG 2.2 AA** — eingebaut, nicht nachgerüstet (2.2-Kriterien explizit, siehe §2).
- **Compliance-konforme KI** — Broker-only, assist-only, je Funktion EU-AI-Act-risikoklassifiziert, transparent (5 Elemente), HITL serverseitig erzwungen, nie autonom bindend (§4).
- **Zonen-Trennung** — Bürger / Sachbearbeitung / Aufsicht getrennt gebündelt + deployt, Kopplung nur über governte API (§5).
- **Zurückhaltend statt verspielt** — 200–500 ms, Information nie allein über Bewegung/Farbe, abschaltbar.

**2-Schicht-Architektur:** (1) Fundament = KERN-UX / design-system.gov.de (gehärtete Inputs/Fieldset/Tokens — übernehmen statt Eigenbau); (2) dünner Standardisierungs-Layer darüber (5+-Zustands-Vertrag, StatusRegion, FormField, Token-Bridge) als Vertrags-Schicht, auf die ALLE ~39 Komponenten zurückgreifen.

**Größter Hebel zuerst:** Layer 2 (geteilte Primitive). Erst danach fehlende Komponenten + KI-Layer — sonst erbt jede neue Komponente erneut den lückenhaften Eigenbau.

---

## 2. Standardisierungs-Layer (geteilte Primitive — höchste Priorität)

Diese Primitive sind die EINZIGEN erlaubten Wege für ihren Belang; Ad-hoc-Lösungen je Komponente werden per Custom-Lint-Regel verboten (eigenes Build-Gate vor M2).

### Verbindliche Vertrags-Regeln (kit-weit)
1. **EINE Status-Wahrheit:** `useViewState` ist der einzige Weg für async/zustandsbehaftete Zustände. Ad-hoc `isLoading`/`hasError` → Lint-Fehler.
2. **EINE Ansage-Quelle:** alle dynamischen Meldungen über genau EINE `StatusRegion` (role=status/alert, aria-live). Verstreute `role=alert` je Widget → verboten.
3. **EINE Validierungs-Wahrheit:** ein Ergebnis erzeugt SIMULTAN Inline-Meldung + ErrorSummary-Eintrag aus EINEM Wortlaut.
4. **EINE Bewegungs-Policy:** Animation nur über Motion-Tokens + `prefers-reduced-motion`-Gate; 200–500 ms, abschaltbar.
5. **EINE Token-Wahrheit:** Farbe/Abstand/Typo/Radius/Fokus/Motion nur aus KERN-UX-Tokens; keine Hardcode-Werte. Zusätzlich `forced-colors`/`prefers-contrast` (Windows High Contrast) bedient.
6. **Validierungs-Default:** Server-Validierung Pflicht, `novalidate`, on-submit-Default, on-blur/live nur opt-in; Eingaben bei Fehler IMMER erhalten (WCAG 3.3.4).
7. **Flow-Contract:** CheckAnswers-Review + sprechender Submit als erzwungener Teil jedes bindenden Antrags-Flows.
8. **Provenienz-Pflicht:** vorbefüllte (Once-Only) Felder einheitlich „übernommen aus &lt;Quelle&gt;", editierbar, mit Einwilligungs-/Bestätigungsschritt (DSGVO Art. 13; WCAG 3.3.7 Redundant Entry).
9. **WCAG-2.2-Pflicht-Kriterien (kit-weit verankert):** 2.4.11/2.4.12 Focus Not Obscured (Sticky-Header/StatusRegion/Dialoge), 2.5.7 Dragging Movements (Tastatur-Alternative zu Drag in DataTable/ImageCropper), 2.5.8 Target Size min 24px (Tabellen-Icons/Countdown-Tags/Pagination), 3.2.6 Consistent Help, 3.3.8 Accessible Authentication (siehe Auth, §3).

### Primitive (Reihenfolge = Implementierungsreihenfolge)

| # | Primitive | Zweck | States/Vertrag | Prio | Aufwand |
|---|-----------|-------|----------------|------|---------|
| 2.1 | **Design-Tokens (KERN-UX-Bridge)** | Eine getypte Token-Wahrheit (CSS-Custom-Properties + TS-Konstanten), themable ohne Komponenten-Eingriff. | statisch; Motion-Tokens mit reduced-motion-Varianten; Fokus-Ring 2px, AA-Kontraste; forced-colors | **P0** | M |
| 2.2 | **useViewState (erweiterter Zustands-Vertrag)** | Getypte Maschine; jede Komponente leitet daraus ab, verdrahtet StatusRegion automatisch. | `idle\|loading\|empty\|error\|ready\|success` + erweitert: `offline\|forbidden(403)\|sessionExpired\|partialSuccess\|conflict(409)\|readOnly`; generisch `<T,E>` | **P0** | M |
| 2.3 | **StatusRegion** | Generische, gedrosselte EINE Ansage-Quelle. | leer\|polite\|assertive\|busy; role=status/alert, aria-live, aria-busy | **P0** | S |
| 2.4 | **Skeleton / LoadingState** | FEHLT heute. Layout-treuer Platzhalter (kein CLS) + Spinner nur für kurze Aktionen. | loading (aria-hidden+aria-busy, nicht fokussierbar) \| done (StatusRegion meldet „geladen") | **P0** | S |
| 2.5 | **FormField (gekoppelte Inline-Validierung)** | Label/Legend + Hint + Input-Slot + Inline-Fehler als EINE aria-korrekte Einheit; liefert Issue simultan an ErrorSummary. | pristine\|valid\|invalid\|disabled; aria-describedby, aria-invalid, novalidate | **P0** | M |
| 2.6 | **ErrorSummary (an FormField gekoppelt)** | EINE Zusammenfassung oben mit Sprungankern, gleicher Wortlaut wie Inline. | leer (verborgen) \| aktiv (1..n); erhält Fokus, `<title>`-Präfix „Fehler:", role=alert | **P0** | S |
| 2.7 | **ErrorState (Pflicht-Recovery)** | error-Zustand mit ERZWUNGENER Recovery-Aktion; schließt Audit-Lücken (ImageCropper/CameraCapture/MermaidView). | error (immer ≥1 Recovery); role=alert, echtes `<button>`, kein Stacktrace | **P0** | S |
| 2.8 | **EmptyState** | empty-Zustand als Handlungsaufforderung. | empty (genau ein primärer CTA); Icon dekorativ, kein reiner Farbsinn | P1 | S |
| 2.9 | **SaveIndicator** | Autosave/Entwurf-Status, speist StatusRegion. | speichern\|gespeichert vor X\|fehler+Retry; `<time datetime>` | P1 | S |
| 2.10 | **ConfirmDialog (destruktiv) + SessionTimeoutDialog** | Bestätigung für Löschen/Zurückziehen; Inaktivitäts-Warnung mit „Sitzung verlängern" + Entwurf-Sicherung. | offen\|bestätigend\|abgebrochen; Fokus-Trap + Esc; Timeout speichert vor Ablauf | P1 | M |
| 2.11 | **useStepMachine (XState-leicht)** | Generische Wizard-Maschine; erzwingt Flow-Contract deklarativ, data-driven. | global in-progress\|review\|submitting\|confirmed\|error; `requireReviewBeforeSubmit:true` (fix) | P1 | L |
| 2.12 | **useOptimistic (opt-in, Pflicht-Rollback)** | nur „leichte" lokale Aktionen; bindende Transaktionen NIE optimistisch; conflict(409) → useViewState. | pending\|committed\|rolledback; Rollback über StatusRegion (assertive) | P2 | M |

**Hebel:** Mit 2.1–2.7 erben MapView/ImageCropper/CameraCapture/RichTextEditor/AntragStepper ihre fehlenden loading/error/recovery-Zustände ohne Eigenbau.

### 2a. Kommunales Theming / White-Labeling (über die Token-Bridge)
Gibt der Nutzer im Prompt eine **Kommune** an, soll die generierte App **deren Webauftritt-Design + Wappen** tragen.
Das teilt sich sauber an der Token-Bridge:
- **Kit (umgesetzt, `KommuneTheme.tsx`):** nimmt ein `KommuneTheme` als DATEN (Markenfarben + Logo/Wappen + Provenienz) und injiziert es in genau die CSS-Custom-Properties, aus denen das ganze Kit seine Farben zieht (`--primary`/`--accent`/`--ring`/…). `KommuneThemeProvider` (ganzseitig), `useKommuneTheme()`, `KommuneLogo` (Wappen mit Pflicht-alt + Quelle). **BITV-AA:** fehlt eine Vordergrundfarbe, wird sie kontrast-sicher (schwarz/weiß per Luminanz) abgeleitet. Generisch — jede Kommune/Behörde ohne Code-Änderung.
- **Fabrik (CHOS-Code, offen):** ein Build-Schritt, der den Kommune-Namen aus dem Prompt nimmt, per **WebSearch den offiziellen Webauftritt findet + als echte Kommune verifiziert** (Domain/Impressum), Markenfarben aus der Seiten-CSS + das Wappen extrahiert/herunterlädt und als `KommuneTheme` (Token-Overrides + Logo-Asset) ins Projekt emittiert.
- **COMPLIANCE-Vorgabe:** das **Wappen ist ein Hoheitszeichen** — Nutzung nur im eigenen Behörden-Dienst zulässig. Das Theme trägt Provenienz (Quelle-URL + Prüfdatum + verifiziert-Flag); die Herkunft bleibt nachvollziehbar. Asset-Download respektiert die Seiten-Nutzungsbedingungen; Provenienz wird im Evidence-Bundle protokolliert.

---

## 3. Fehlende + interaktive Komponenten

Jede konsumiert StatusRegion + gekoppelte ErrorSummary/Inline + Skeleton-Loading; bindende Aktionen warten echten Server-Status ab (kein Optimistic-UI). Lizenz: nur MIT/Apache-2.0/BSD-3/ISC/EUPL-1.2/MPL-2.0 (kein (A)GPL/SSPL/BUSL/proprietär), lazy-loaded + code-split, nie im Kern-Bundle; SBOM (CycloneDX) + CVE-block-high als Vorbedingung (§7).

### 3a. Dokumente / Interaktion / Daten
| Komponente | Zweck | Library (Lizenz) | Kern-States | a11y-Kern | Prio | Aufwand |
|-----------|-------|------------------|-------------|-----------|------|---------|
| **PdfViewer** | Barrierearme PDF-Anzeige (Nachweise/Bescheide; Nav/Zoom/Suche/Download/Print). | pdf.js (Apache-2.0), lazy | loading(Seiten-Skeleton)\|empty\|error(+Retry+Roh-Download)\|ready\|rendering\|restricted | Text-Layer statt nur Canvas; Tastatur; „Seite X von Y"; Fokus-Trap nur Vollbild+Esc | **P0** | L |
| **NachweisBrowser** | Dokumentenmappe: Status (eingereicht/geprüft/fehlend), Provenienz, Vorschau, Anforderungs-CTA. | 0-dep (über DateiUpload + Viewer) | loading\|empty(+Upload)\|error\|ready\|partial(Pflicht fehlt→blockiert)\|complete | Status Text+Farbe; fokussierbar; Vollständigkeit über StatusRegion; Vorschau-Dialog+Esc | **P0** | L |
| **DateiUpload (Primitive)** | Eigenständiger Upload mit Tastatur-Alternative zu Drag&Drop, Fortschritt, Virenscan-Status, Format/Größe server-autoritativ. | 0-dep | idle\|dragover\|uploading(Fortschritt)\|scanning\|rejected(Format/Größe/Virus)\|done\|error | Tastatur statt nur Drag (2.5.7); Fortschritt angesagt; Fehler server-autoritativ | **P0** | M |
| **OfficeDocViewer** | Vorschau DOC(X)/XLS(X)/ODT/ODS ohne Editor; Server→HTML/PDF, Download des Originals. | server-render bevorzugt; client: SheetJS Community (Apache-2.0)/mammoth (BSD/MIT), lazy | loading\|empty\|error(→Download-only)\|ready\|unsupported(+Download)\|truncated | semantischer HTML-Render vor Bild; Bild-Fallback mit Pflicht-Textalternative | P1 | L |
| **DataTable** | Verwaltungs-Tabelle: Sortier/Filter/Suche/Spaltenwahl/Paginierung/Virtualisierung/Export (CSV/XLSX/PDF), Schema data-driven. | TanStack Table (MIT, headless) + virtualizer | loading(Zeilen-Skeleton)\|empty\|filteredEmpty(+Reset)\|error\|ready\|loadingMore\|exporting | echte `<table>` + `<th scope>` + aria-sort; „X Ergebnisse"-Ansage; Tastatur; Target-Size 24px | P1 | L |
| **TerminFristPanel** | Fristen mit Countdown/Status, Slot-Buchung, ICS-Export. | 0-dep (`<time>`, ICS data-driven) | loading\|empty\|ready\|dueSoon\|overdue(assertive)\|booking\|submitting\|booked(+ICS)\|conflict\|error | `<time>` maschinen-+menschenlesbar; Status Text+Tag nie nur Farbe; „überfällig"=role=alert; Zeitzone explizit | P1 | M |
| **EPaymentPanel** | Bezahl-UI (Betrag/Aufschlüsselung, Zahlart via konfigurierbarem PSP/ePayBL-Adapter), verbindlicher Server-Zahlstatus. **Kein Optimistic-UI, keine KI.** | 0-dep Kern + PSP-Adapter (extern, austauschbar) | idle\|reviewing\|submitting(disabled+Spinner)\|redirecting\|pending\|success(Beleg)\|failed(+Retry, Betrag erhalten)\|cancelled\|timeout | echtes Formular; sprechender Submit („Jetzt 24,00 € zahlen"); kein Doppel-Submit (disabled+Idempotenz); Status angesagt | **P0** | L |

### 3b. Identität, Sachbearbeitung, Aufsicht, Zustellung (Governance-Pflicht-Surfaces)
| Komponente | Zweck | Kern-States | Compliance/a11y | Prio | Aufwand |
|-----------|-------|-------------|------------------|------|---------|
| **AuthGate / SessionProvider** | BundID/OIDC-Login, Session, SSO; Step-up-Auth vor rechtsverbindlichen Aktionen (Zahlung/Submit). | unauthenticated\|authenticating\|authenticated\|stepUpRequired\|sessionExpired\|reauth | de:bundid/OIDC Pflicht; WCAG 3.3.8 Accessible Authentication; Re-Login OHNE Datenverlust (Entwurf gesichert) | **P0** | L |
| **Arbeitsvorrat (caseworker-inbox)** | Master-Detail-Arbeitsvorrat der Sachbearbeitung (Filter/Zuweisung/Priorität). | loading\|empty(„0 offen")\|ready\|error\|readOnly | über DataTable; zone-getrennt (SB-Bundle) | **P0** | L |
| **EntscheidungPanel / SubsumtionPanel** | Wertende Entscheidung mit Subsumtion (Norm→Sachverhalt→Ergebnis), Vorlage zur Zweitprüfung. | entwurf\|vorgelegt\|inZweitpruefung\|freigegeben\|abgelehnt | 4-Augen (siehe FourEyes); KI nur assistiv (KiAssist) | **P0** | L |
| **FourEyesReview (4-Augen-UX)** | Vorlage→Zweitprüfung→Freigabe/Ablehnung; verhindert Selbstfreigabe (Antragsteller≠Prüfer) auf UI-Ebene; serverseitig erzwungen. | wartetAufZweitprüfung\|inPrüfung\|freigegeben\|abgelehnt\|konflikt | four-eyes-server; „wartet auf zweite Person"; jede Aktion an audit-append-only gekoppelt | **P0** | M |
| **Postfach / BescheidZustellung** | Bescheid ins Nutzer-Postfach, Zustellnachweis + Bekanntgabedatum/Zustellungsfiktion (§41 VwVfG). | leer\|neu\|gelesen\|zugestellt(+Nachweis+Datum)\|fehlgeschlagen | Zustell-Provenienz; Druckansicht; PdfViewer für Bescheid | **P0** | M |
| **AdressValidierung (deterministisch)** | XÖV/XMeld-Registerprüfung (NICHT KI): Treffer/Kein-Treffer/Mehrdeutig, markiert + editierbar. | idle\|prüfend\|treffer\|keinTreffer\|mehrdeutig\|fehler | deterministische Quelle; Treffer editierbar; getrennt von KiPrefill | P1 | M |
| **AufsichtDashboard / ReportingPanel / StatCard** | Aufsicht/Reporting aggregiert + pseudonymisiert. | loading(Skeleton)\|empty\|ready\|error | audit-pseudonymized; KPIs nie nur Farbe; zone-getrennt (Aufsichts-Bundle) | P1 | M |
| **LanguageSwitch (i18n / Leichte Sprache)** | Umschaltung Sprache + Leichte Sprache; Gebärdensprache-Video-Slot (BITV §3/Anlage 2). | — | zentralisierte Wortlaute B1-geprüft (language-b1); i18n der Status-/Validierungs-Texte | P1 | M |
| **Barrierefreiheitserklärung + Feedback** | Gesetzliche BITV-§7-Erklärung + Feedback-Mechanismus. | — | Pflicht für öffentliche Stellen; verlinkt im Footer | P1 | S |

---

## 4. KI-Support-Layer — KiAssist-Familie (compliance-first)

**Architektur-Invariante:** KI ist **Broker-only** — jede Funktion läuft über den gegateten `AiAssistPort`
(de:inference-broker), KEINE Direkt-Calls aus Komponenten (no-direct-llm, plattformweit per Code-Gate +
Lint erzwungen; forbidden: openai/anthropic direkt). KI liefert NUR Vorschläge in einen separaten,
gekennzeichneten Bereich, überschreibt nie Originaldaten, ist menschlich korrigierbar, **nie autonom bindend**
(DSGVO Art. 22; kein Verwaltungsakt §35 VwVfG ohne menschliche, serverseitig erzwungene Bestätigung). KI nie im
sicherheitskritischen Pfad (Zahlung, bindende Übermittlung, rechtsverbindliche Frist).

**Generelle Invariante:** *Kein Statuswechsel / Bescheid / Festsetzung ohne menschliche, serverseitig erzwungene
Bestätigung* (humanDecisionsServerSide); bei Außenwirkung zusätzlich 4-Augen (four-eyes-server). UI-Kennzeichnung
allein genügt nicht — die Aufsicht ist serverseitig, nicht client-umgehbar.

### EU-AI-Act-Risikoklassifizierung JE Funktion (Pflicht, dokumentiert)
| KiAssist-Funktion | Zweck | Risikoklasse (Annex-III-Prüfung) | Zwingende Compliance |
|-------------------|-------|----------------------------------|----------------------|
| **KiPrefill** | Feldwert-Vorschlag aus Quellen/Registern | begrenzt (assistiv, editierbar, keine Entscheidung) | 5 Transparenz-Elemente (marking·source·confidence·**why**·override); Einwilligung VOR Übernahme (Art. 6/7/13); StatusRegion meldet Lauf |
| **KiClassify** | Nachweis-/Vollständigkeits-Vorschlag | **Annex-III-Prüfung Pflicht** (Zugang zu Leistungen → ggf. Hochrisiko) | HITL-Bestätigung PFLICHT vor Status „geprüft"; 4-Augen bei Außenwirkung; Konfidenz + „warum"; falls Hochrisiko: §4-Hochrisiko-Pflichten |
| **KiSummarize** | Zusammenfassung in Pdf/OfficeViewer | begrenzt | separater KI-Bereich; Originaltext nie überschreiben; Quelle verlinkt; SR-Ansage „KI-generiert" (Art. 50(2) maschinenlesbar) |
| **KiExplainDiff** | Erklärung von Versions-/Bescheid-Diffs | begrenzt | KI-Kennzeichnung + Quellbezug; rein erläuternd |
| **KiFilterSuggest** | Vorschlag „risikobehaftete Vorgänge" (DataTable) | **Annex-III-Prüfung Pflicht** | als KI-gefiltert gekennzeichnet; deterministische Roh-Liste jederzeit ohne KI erreichbar; nie Entscheidung; „warum" je Vorschlag |
| **KiFristHint** | Fristen-Priorisierung (TerminFristPanel) | **Annex-III-Prüfung Pflicht** | rechtsverbindliche Frist IMMER deterministisch, nie KI; override-bar; „warum" |

### Quer für ALLE KiAssist
- **Transparenz (5 Elemente vollständig):** marking · source · confidence · **why (Begründung je Vorschlag)** · override; zusätzlich maschinenlesbare Kennzeichnung KI-generierter Inhalte (EU-AI-Act Art. 50(2)).
- **BITV-AA der KI-UI:** KI-Badge/Konfidenz nie NUR Farbe/Icon (1.4.1) → Textalternative; Annehmen/Verwerfen tastaturbedienbar + fokussierbar; KI-Bereiche als Landmark/Überschrift; SR-Ansage „KI-generiert".
- **DSGVO:** Art. 22 (kein autonomer Einzelfall mit Rechtswirkung) explizit; Art. 30 (VVT-Eintrag) + Retention/Löschfristen für KI-Vorschläge/Eingaben; Datenminimierung (pii-server-side); DSFA/DPIA bei (potenziell) Hochrisiko.
- **LLM-Firewall / Prompt-Injection (Pflicht ab ≥2 KI-Affordances):** Eingabe-/Ausgabe-Filterung im Broker; Schutz davor, dass aus bürger-hochgeladenen Dokumenten (NachweisBrowser→KiClassify/KiSummarize) Injection in den Broker gelangt.
- **Audit:** jede KI-Beteiligung (Vorschlag, Übernahme, Verwerfen) an `audit-append-only` gekoppelt (wer/wann/was/KI-Anteil) — Grundlage AI-Act-Logging.

### Hochrisiko-Pflichten (bedingt, falls eine Funktion als Annex-III einzustufen ist)
Risikomanagement-System · Daten-Governance/Bias-Prüfung der Vorschläge · technische Doku · automatische
Protokollierung (mit audit-append-only) · Genauigkeit/Robustheit/Cybersicherheit · menschliche Aufsicht nach Art. 14.

---

## 5. Zonen-Trennung (Bürger / Sachbearbeitung / Aufsicht)

Mandat `zone-separation`: die drei Surfaces werden **getrennt gebündelt + deployt**, Kopplung nur über die governte
API. KiAssist/DataTable/Broker dürfen NICHT zonenübergreifend ins Bürger-Bundle geraten.
- **Build-Gate:** Bundle-Analyse weist nach, dass SB-/Aufsichts-Komponenten + KI-Broker nicht im Bürger-Bundle landen.
- Geteilte Primitive (§2) sind zonen-neutral und dürfen geteilt werden; zonen-spezifische Komponenten (§3b) nicht.

---

## 6. Upgrade-Roadmap bestehender Komponenten

**Definition-of-Done je Komponente:** (1) alle Zustände aus `useViewState` korrekt verdrahtet (kein stiller Wechsel);
(2) StatusRegion + gekoppelte ErrorSummary/Inline; (3) Tokens statt Hardcode; (4) Storybook-Story je Zustand (inkl.
error+Recovery, empty, reduced-motion, forced-colors) — Vision-Judge-fähig; (5) a11y grün (axe + Tastatur + Screenreader-Matrix);
(6) Lint-Regel (kein ad-hoc isLoading/hasError) erfüllt; (7) Provenienz/ADR-Eintrag (provenance-complete).

- **Welle A — Bürger (P0):** AntragStepper→useStepMachine+FormField+ErrorSummary (CheckAnswers erzwungen); DateiUpload→Primitive; ImageCropper/CameraCapture→ErrorState+Skeleton; MapView→loading/error+Tastatur-Pan (2.5.7).
- **Welle B — Sachbearbeitung (P1):** RichTextEditor→SaveIndicator+Tokens; MermaidView→ErrorState mit Alternative; Listen→DataTable.
- **Welle C — Aufsicht/Audit (P1/P2):** Übersichten→DataTable+EmptyState; Optimistic nur wo nachweislich „leicht".

---

## 7. Sequenz / Meilensteine + Validierung

Validierung **ausschließlich über die Builder-UI**: vorhandene Projekte löschen → flow-server mit aktuellem Code neu
starten → Build (MVP volle Business-Logik) → kompletten DOM prüfen → Screenshots ins Projektverzeichnis → Vision-Judge.

| M | Inhalt | DoD-Validierung (DOM + Screenshot) |
|---|--------|-------------------------------------|
| **M0 Fundament** | Tokens·useViewState·StatusRegion·Skeleton | aria-live da, Skeleton statt Spinner, kein CLS, forced-colors |
| **M1 Formular-Wahrheit** | FormField·ErrorSummary·ErrorState | ErrorSummary fokussiert+Sprunganker, Inline aria-verknüpft, novalidate, gleicher Wortlaut beidseitig |
| **M2 Identität + Zonen** | AuthGate/Session·Step-up·zone-separation-Gate | Login-Zustände, Re-Login ohne Datenverlust; Bundle-Gate grün |
| **M3 Bürger-Komponenten** | PdfViewer·NachweisBrowser·DateiUpload·EPaymentPanel; Welle A | Zahl-Submit disabled bei submitting, kein Doppel-Submit, „Seite X von Y" |
| **M4 Flow + Save** | useStepMachine·SaveIndicator·EmptyState·ConfirmDialog; CheckAnswers erzwungen | Submit erst nach Review; Timeout sichert Entwurf |
| **M5 Sachbearbeitung + 4-Augen** | Arbeitsvorrat·EntscheidungPanel·FourEyesReview·Postfach/Zustellung·DataTable·OfficeDocViewer·TerminFrist; Welle B | „wartet auf zweite Person" blockt Selbstfreigabe; `<th scope>`+aria-sort; Zustellnachweis+Bekanntgabedatum |
| **M6 KI-Layer** | AiAssistPort-Broker + LLM-Firewall; KiPrefill/KiClassify, dann Summarize/Diff/Filter/Frist; je Funktion Risikoklasse dokumentiert | KI-Badge sichtbar, Einwilligung, HITL blockt „geprüft", „warum" je Vorschlag, KI-UI tastaturbedienbar |
| **M7 Aufsicht + i18n + Nachweis** | AufsichtDashboard/Reporting; LanguageSwitch/Leichte Sprache; Barrierefreiheitserklärung; Welle C | pseudonymisiert; Sprachumschaltung; axe-Matrix-Nachweis (bitv-aa measured) |

---

## 8. Doku / Evidence (Governance-blocking)

- **Screen-Contract-first:** je neue/zu-upgradende Komponente der Screen-Contract VOR der UI (screen-contract-first blocking).
- **Storybook + Vision-Judge-Stories** für alle Zustände je Komponente (DoD §6).
- **Migrations-Doku** für die ~39 Bestandskomponenten: Reihenfolge, Breaking Changes, Codemods.
- **Test/Coverage:** tests-wired + minCoverage ≥ 60.
- **ADR/Provenienz** je Primitive (provenance-complete); **Evidence-Bundle** (OSCAL/OZG-Export) angebunden (evidence-bundle blocking).
- **Barrierefreiheitserklärung** (BITV §7) + prefers-contrast/forced-colors-Nachweis.

## 9. Risiken / Abhängigkeiten

- **Bundle/Performance:** pdf.js/SheetJS/mammoth/TanStack schwer → strikt lazy + code-split, nie Kern-Bundle. **Quantifizierte Budgets:** LCP/INP/CLS-Schwellen + Bundle-Size-Budget je Route, CI-Fehler bei Überschreitung.
- **Lizenz/SCA:** nur erlaubte Lizenzen (s. §3); SBOM (CycloneDX) + CVE-block-high + licenseAllow-Abgleich als **Vorbedingung**, nicht vertagt. PSP-Adapter austauschbar (kein Lock-in im offenen Template).
- **opencode-Generierung:** der governte Agent generiert diese Primitive/Komponenten SELBST data-driven (kein Hand-Code der Ausgabe). L-Komponenten erst wenn Fundament steht; DAG-Variante + Self-Healing gegen Turn-Budget/Tool-Storm.
- **Vorgaben-Konflikte:** Optimistic vs. „bindend immer Server" → useOptimistic-Guard; KI-Innovation vs. Transparenz/HITL → Broker-only + Pflicht-Kennzeichnung; on-submit vs. Live → opt-in-Flag.
- **KERN-UX-Abhängigkeit:** Token-Bridge (2.1) als einzige Kontaktfläche + Versionspinning gegen Upstream-Drift.
- **Lint-Enforcement:** Custom-Lint-Regel (kein ad-hoc isLoading/hasError) als eigenes Build-Gate vor M2 — sonst driftet der Layer zurück in Eigenbau.

**Aufwand ehrlich:** Fundament (M0/M1) überschaubar (S/M), größter Hebel. Die L-Komponenten (PdfViewer, EPaymentPanel,
NachweisBrowser, DataTable, useStepMachine, OfficeDocViewer, AuthGate, Arbeitsvorrat, EntscheidungPanel) sind die
eigentliche Arbeit — je 1 substanzieller Build-Zyklus inkl. a11y + Storybook + Builder-UI-Validierung. KI-Layer
innovativ, aber durch Compliance-Gates bewusst eng geführt.
