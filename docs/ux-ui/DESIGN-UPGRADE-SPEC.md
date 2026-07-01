# DESIGN-UPGRADE-SPEC — fachverfahren-kit

> **Status:** verbindlich. Diese Datei ist die EINE Wahrheit für Kohärenz. Fundament- und
> Komponenten-Agenten setzen sie 1:1 um. Bei Widerspruch zwischen dieser Spec und Bestandscode
> gewinnt die Spec — der Bestand wird angeglichen.
>
> **Geltungsbereich:** `packages/fachverfahren-kit/src`. Offenes, generisches Template
> (Wettbewerber haben Zugriff). Nur vendor-/domänen-neutrale Inhalte, KEINE Domänen-Literale.
> Stack strikt: shadcn/ui + Tailwind v4 + CSS-Tokens. Import-Endung im Kit ist `.js` (NodeNext).
>
> **Harte Regeln, die diese Spec durchsetzt:**
>
> - `check:css-tokens` — keine rohen Hex/px-Farben in Komponenten, nur semantische Tokens.
> - WCAG 2.2 AA / BITV 2.0 — Fokus-Ringe, aria, Tastatur, Information nie nur über Farbe,
>   `prefers-reduced-motion` respektieren.
> - Keine willkürlichen `text-[10px]/[11px]/[12px]` mehr. Nur die Skala aus Abschnitt 2.

---

## 1. DESIGN-PRINZIPIEN

1. **Eine Wahrheit pro Belang.** Für jede visuelle Entscheidung (Typo-Stufe, Fokus-Ring, Elevation,
   Feld-Layout, Zeitverlauf) gibt es genau EINE Quelle: ein Token, eine Utility oder ein Primitiv.
   Komponenten wählen keine Ad-hoc-Werte. Das ist die Wurzel-Maßnahme gegen die drei Beschwerden
   (Fehlertext zu groß, Stepper-Überlauf, altbacken/flach).

2. **Signal über Farbe + Gewicht + Icon — nie über Größe.** Ein Fehler ist NICHT größer als der
   umgebende Text. Er ist rot (`text-destructive`), semibold, hat ein Warn-Icon und ein
   Screenreader-Präfix. Gleiche Regel für Status: Farbe ist Verstärkung, nie alleiniger Träger.

3. **Verwaltungs-Seriosität, nicht Enterprise-Dichte.** Zielpublikum ist gemischt (Bürger +
   Sachbearbeitung). Control-Höhe komfortabel (default 40px, `lg` 44px = WCAG-Zielgröße), großzügiges
   Card-Padding, ruhiger 4/8-Rhythmus. Flach und dezent statt verspielt: dünne Border + sehr weiche
   Schatten, kein Drop-Shadow-Theater.

4. **Modern durch Geometrie-Konsistenz.** Ein moderater, durchgehender Radius (0.5rem-Basis mit
   abgeleiteter sm/md/lg-Skala), konsistente Border-Stärke, weiche 3px-Fokus-Ringe im shadcn-Stil.
   Modernität entsteht aus Einheitlichkeit, nicht aus Effekten.

5. **Responsiv am Container, nicht am Viewport.** Layout-Umbrüche (allen voran der Stepper)
   orientieren sich am tatsächlichen Zentralbereich. Nichts läuft je horizontal über seinen Container
   hinaus — kein `flex-nowrap`/`whitespace-nowrap` ohne Umbruch- oder Scroll-Fallback.

6. **Barrierefreiheit ist Default, nicht Option.** Jedes interaktive Element hat sichtbaren Fokus
   (3px), korrekte aria-Verdrahtung, Tastaturbedienung und `prefers-reduced-motion`-Respekt.
   Fortschritt/Status wird immer zusätzlich textlich angesagt (`sr-only`), nie nur visuell getragen.

7. **Progressive Enhancement für komplexe Muster.** Der robuste, textliche Kern (z.B. „Schritt X von
   Y — <Name>") funktioniert IMMER; die visuelle Anreicherung (horizontaler Pfad) ist Zugabe. Nach
   dem Progressive-Enhancement-Prinzip (BITV 2.0 / EN 301 549 / WCAG 2.2): der Zähler ist die
   maßgebliche Wahrheit, der Pfad nur Enhancement — nie umgekehrt.

8. **Dezente Bewegung.** 150–200 ms `ease-out` auf Farbe/Border/Opacity/Transform für
   Fokus/Hover/Fehler/Stepper/Toast. Keine Bounce/Spring-Effekte. `motion-reduce:transition-none`
   und der bestehende `.reduce-motion`-Schalter bleiben Pflicht.

---

## 2. TYPO-SKALA (verbindliche Klassen-Zuordnung)

Nur **4 Text-Größen im Fließbereich** (`text-xs`/`text-sm`/`text-base`/`text-lg`) plus die
Überschriften-Skala. Nur **2 Gewichte**: Regular (`font-normal`) und Semibold (`font-medium` für
Labels/Betonung, `font-semibold` für Überschriften/Beträge). **Nichts unter 12px (`text-xs`).**
`text-[10px]`/`[11px]`/`[12px]` sind verboten und werden ausnahmslos ersetzt.

| Rolle                    | Verbindliche Klassen                                    | Größe                                   |
| ------------------------ | ------------------------------------------------------- | --------------------------------------- |
| Seitentitel (h1)         | `text-2xl font-semibold tracking-tight text-foreground` | 24px                                    |
| Sektionstitel (h2)       | `text-lg font-semibold text-foreground`                 | 18px                                    |
| Untersektion (h3)        | `text-base font-semibold text-foreground`               | 16px                                    |
| **Feld-Label**           | `text-sm font-medium text-foreground`                   | **14px, volle Tinte**                   |
| Body / Control-Text      | `text-sm text-foreground`                               | 14px                                    |
| Hilfetext / Description  | `text-sm text-muted-foreground`                         | 14px                                    |
| **Fehlertext**           | `text-sm font-medium text-destructive`                  | **14px = IDENTISCH zu Label/Hilfetext** |
| Caption / Meta / Badge   | `text-xs text-muted-foreground`                         | 12px (Minimum)                          |
| Kennzahl / großer Betrag | `text-2xl font-semibold tabular-nums text-foreground`   | 24px                                    |
| Sekundär-Kennzahl        | `text-xl font-semibold tabular-nums`                    | 20px                                    |

**Kernaussagen (behebt Beschwerde 1 an der Wurzel):**

- **Fehlertext == Hilfetext == Body == 14px.** Der Fehler signalisiert über `text-destructive` +
  `font-medium` + Icon, NIE über Größe. `ErrorSummary`-Titel wird von `text-lg` (18px, bleibt als h2
  ok) belassen, aber die Fehler-**Einträge/Links** und die **Inline-Feldfehler** teilen exakt
  `text-sm` — kein Größensprung mehr zwischen Summary-Link und Inline-Fehler.
- **Feld-Labels sind primäre Information:** `text-sm font-medium text-foreground` (nie
  `text-muted-foreground`, nie `text-[12px]`). Das Basis-`labelVariants` in `ui/label.tsx` ist bereits
  korrekt (`text-sm font-medium`); Konsumenten dürfen es NICHT per `className` verkleinern/muten.
- **Meta-Minimum ist `text-xs` (12px).** Stepper-Nummernkreise, Badges, Chips, uppercase-Labels: alle
  auf `text-xs` heben. `tabular-nums` ist global im `body` gesetzt — für Zahlenspalten reicht das.
- **Eine gemeinsame Fehler-Text-Utility.** Damit Summary und Inline nie divergieren, führt der
  Fundament-Agent die Utility `.fv-text-error` (= `@apply text-sm font-medium text-destructive`) in
  `styles.css` ein; sowohl `ErrorSummary` als auch der `FeldRenderer`-Inline-Fehler nutzen sie.

---

## 3. TOKEN-ERWEITERUNG (`packages/fachverfahren-kit/src/styles.css`)

**Regel:** bestehende Token-NAMEN nicht brechen. Neue Tokens ergänzen; Dark- und High-Contrast-
Varianten IMMER mitziehen. Palette darf dezent an Tiefe gewinnen, aber die HSL-Basis bleibt (warmes
Papier, Fast-Schwarz-Tinte, glass-blue Akzent).

### 3.1 Elevation / Shadow (neu — schließt den größten Token-Gap)

Bisher gibt es keine Shadow-Tokens; Card nutzt Tailwind-Default, der Antragscontainer gar keinen.
Ergänze eine abgestufte, seriös-flache Elevation-Skala in `:root` und im `@theme inline`-Block:

```
--shadow-xs: 0 1px 2px 0 hsl(220 25% 10% / 0.04);
--shadow-sm: 0 1px 3px 0 hsl(220 25% 10% / 0.06), 0 1px 2px -1px hsl(220 25% 10% / 0.06);
--shadow-md: 0 4px 8px -2px hsl(220 25% 10% / 0.08), 0 2px 4px -2px hsl(220 25% 10% / 0.05);
--shadow-lg: 0 12px 20px -6px hsl(220 25% 10% / 0.10), 0 4px 8px -4px hsl(220 25% 10% / 0.06);
```

- Dark: Alpha erhöhen (`/ 0.30`–`/ 0.45`), Basis-Hue beibehalten.
- High-Contrast: Schatten neutralisieren (auf `0 0 0 1px var(--border)` reduzieren — Definition über
  Border statt Schatten), da Schatten bei HC unzuverlässig sind.
- Rollen-Zuordnung: **Card/Antragscontainer = `shadow-sm`**, Popover/Dropdown/Dialog = `shadow-md`,
  Toast/Sheet = `shadow-lg`. Keine dickeren Schatten.

### 3.2 Fokus-Ring (kanonisieren — behebt die zwei widersprüchlichen Konventionen)

`--ring` existiert als Farbe. Ergänze den kanonischen Fokus-Stil als Utility statt als Streuung von
`ring-1` vs. `ring-2`:

```
@utility fv-focus {
  outline: none;
  &:focus-visible {
    border-color: var(--ring);
    box-shadow: 0 0 0 3px hsl(from var(--ring) h s l / 0.5);
  }
}
```

Alternativ (falls `@utility`/`hsl(from …)` im Build zickt) als Tailwind-Klassenkette definieren und
überall identisch anwenden:
`outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`.
**Genau EIN Rezept** auf Input/Select/Textarea/Button/Checkbox/Radio/Tabs/Stepper-Schritt/Links.
Erfüllt KERN-3px + WCAG 2.2 (2.4.11 / 2.4.13). High-Contrast setzt `--ring` bereits separat —
beibehalten.

### 3.3 Feld-Fläche (neu — behebt „Inputs verschmelzen mit Card")

Inputs sind aktuell `bg-transparent` und verschwimmen auf `bg-card`. Ergänze ein dediziertes Token:

```
--input-bg: var(--surface);   /* :root = weiß, hebt sich von bg-background/bg-card ab */
```

Dark: `--input-bg: hsl(220 20% 13%)` (= `--surface-2`, dunkler als Card → Feld sichtbar). Im
`@theme`-Block als `--color-input-bg` verfügbar machen. Inputs nutzen `bg-input-bg` statt
`bg-transparent`.

### 3.4 Fehler-Text-Utility (neu — siehe 2.)

```
@utility fv-text-error { @apply text-sm font-medium text-destructive; }
```

### 3.5 Spacing/Rhythmus (Konvention, kein neues Token nötig)

Tailwind-Standardskala reicht — die EINE Wahrheit ist die **Zuordnung**, nicht neue Tokens:

- Feld-Gap (Label→Control→Description→Error): `gap-2` (8px).
- Feldgruppen-Abstand: `space-y-4` bis `space-y-6` (16–24px).
- Card-/Container-Padding: `p-6` (24px), auf `md:` optional `p-8`.
- Sektions-Gap: `space-y-8` (32px).

### 3.6 Radius (Rollen-Zuordnung festschreiben)

Tokens existieren (`--radius` 0.5rem + sm/md/lg/xl). Verbindliche Rollen:

- Inputs/Buttons/Select/Badge: `rounded-md`.
- Card/Antragscontainer/Popover/Dialog: `rounded-lg` (bzw. `rounded-xl` bleibt für Card ok, aber
  **einheitlich** — Antragscontainer folgt Card).
- Chips/Pills/Nummernkreise: `rounded-full`.
  Keine gemischten Rundungen mehr (`rounded-md` neben `rounded-xl` in derselben Ebene).

---

## 4. KOMPONENTEN-MUSTER

### 4.1 Inputs / Select / Textarea

```
h-10 w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm
shadow-xs transition-colors placeholder:text-muted-foreground
outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
disabled:cursor-not-allowed disabled:opacity-50
aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30
```

- Höhe **default `h-10` (40px)**, Größenvariante **`lg` = `h-11` (44px)** für Touch/Bürgerfluss.
- `bg-input-bg` (nicht `bg-transparent`) → klare Feldfläche gegen Card.
- Fokus-Rezept identisch zu 3.2. Fehlerzustand über `aria-invalid` → Border + dezenter Ring in
  `destructive`.
- Kein `text-base md:text-sm`-Split mehr; durchgehend `text-sm`. (Zoom-Schutz auf iOS bei Bedarf über
  16px via `lg`-Variante lösen, nicht über abweichende Chrome-Größen.)

### 4.2 Card / Container

```
rounded-lg border border-border bg-card text-card-foreground shadow-sm
```

- CardHeader/Content/Footer: `p-6` (bestehend beibehalten).
- **Verschachtelte Blöcke** (Hinweis-/Review-/Berechnungs-Karten) nutzen eine zweite Ebene:
  `bg-surface-2 border border-border rounded-md` OHNE eigenen Schatten (Elevation nur auf der
  äußeren Card). So entsteht ein klarer, aber ruhiger Ebenen-Rhythmus.
- Der **Antragscontainer nutzt die `Card`-Komponente** (eine Quelle der Wahrheit) statt handgebautem
  `div rounded-md border p-6` ohne Schatten.

### 4.3 Buttons

- Fokus auf das kanonische Rezept (3.2) heben (aktuell `ring-1` ohne offset).
- Größen: `default h-10`, `sm h-9`, `lg h-11`, `icon h-10 w-10` (Touch-Zielgröße; `sm`/`icon` nie
  unter 36px, `icon` auf Touch ≥44px durch `lg`-Verwendung).
- Neue Props (optional, generisch): `loading` → Spinner + `aria-busy` + `disabled` (Absenden-Buttons
  brauchen das kit-weit).

### 4.4 Feld-Layout — EINE Quelle

Das bestehende `ui/form-field.tsx` (`FormField`/`FormLabel`/`FormControl`/`FormDescription`/
`FormMessage`, id-Context, `aria-invalid`, `aria-describedby`) ist das a11y-Fundament und wird zur
**einzigen** Formular-Layout-Quelle:

- Vertikaler Stack Label → Control → Description → Error mit `gap-2`.
- `FormMessage` rendert Fehler mit `.fv-text-error` + Warn-Icon + `sr-only`-Präfix „Fehler:".
- Konsumenten (allen voran `AntragStepper` `FeldRenderer`) setzen KEINE eigenen Text-/Spacing-Klassen
  mehr, sondern reichen nur Inhalt + `invalid` durch.
- Für Gruppen (Radio/Checkbox/Adressblock) das neue `Fieldset`-Primitiv (Abschnitt 5) verwenden.

### 4.5 Fehlerdarstellung (mehrkanalig)

1. `border-destructive` links/rundum am Feld (Verbindung Fehler↔Frage).
2. `aria-invalid` am Control + `aria-describedby` → Fehler-ID.
3. Sichtbares Warn-Icon (`AlertCircle`, `text-destructive`, `aria-hidden`).
4. `sr-only`-Präfix „Fehler:" vor dem Text.
5. Bei mehreren Fehlern die `ErrorSummary` oben, mit Ankerlinks; optionaler Zähler („3 Probleme").
   Soft-Token (`status-block-soft`) als dezenter Feld-/Box-Hintergrund, `status-block`/`destructive` als
   Rand/Icon/Text. Keine rohen Hex.

### 4.6 RESPONSIVER STEPPER (behebt Beschwerde 2 — präzise & reproduzierbar)

Zwei-Modus-Muster nach KERN (Deutschlands Design-System) / EU Europa Component Library (ECL), BITV 2.0 /
EN 301 549 / WCAG 2.2. Der **textliche Zähler ist die maßgebliche Wahrheit**, der horizontale Pfad ist
Progressive Enhancement. Kein `flex-nowrap`/`whitespace-nowrap` ohne Umbruch.

**A. Immer sichtbares Text-Heading (robuster Kern, funktioniert ohne den Pfad):**

```
<p className="text-sm font-medium text-foreground">
  Schritt <span className="tabular-nums">{idx + 1}</span> von
  <span className="tabular-nums">{total}</span> — {aktuellerSchrittName}
</p>
```

Zusätzlich eine `sr-only` Live-Region (`aria-live="polite"`), die den Schrittwechsel ansagt:
„Schritt 3 von 9, <Name>, <offen|aktuell|abgeschlossen>".

**B. Dünner Fortschrittsbalken (immer sichtbar, läuft nie über):**
`div.h-1.w-full.rounded-full.bg-muted` mit innerem `div` `bg-primary`, Breite = `(idx+1)/total`.
`role="progressbar"` + `aria-valuenow/min/max`.

**C. Horizontaler Segment-Pfad NUR ab genügend Breite — mit garantiertem Nicht-Überlauf:**

- Container: `@container` (Tailwind v4 container queries) ODER Fallback `hidden md:flex`.
- Die `ol` verwendet **`flex flex-wrap`** (nicht `flex-nowrap`) mit `gap-x-2 gap-y-2` → bei zu vielen
  Schritten bricht die Zeile um statt überzulaufen.
- Jedes `li`: `flex items-center gap-2 min-w-0`; das Label-`span` bekommt
  `truncate max-w-[12ch]` (kein `whitespace-nowrap` ohne Truncate).
- Nummernkreis: `h-6 w-6 rounded-full text-xs font-semibold` (nicht mehr `text-[10px]`/`h-5`),
  Fokus-Rezept 3.2, `aria-current="step"` am aktiven Segment.
- Zustände über Farbe **und** Icon/Text: aktiv = `bg-primary text-primary-foreground`,
  abgeschlossen = `bg-status-ok` + Check-Icon, offen = `bg-muted text-muted-foreground`,
  invalid = `bg-status-block` + „!". Je Segment `sr-only`-Status.
- Alternative bei sehr schmalen Seitenspalten: **vertikale Variante** (`flex-col`, Marker links,
  Label rechts) — dieselben Zustände/aria.

**Merksatz:** A + B rendern immer und passen in jeden Container; C erscheint nur, wenn Platz da ist,
und kann durch `flex-wrap` + `truncate` selbst dann nicht überlaufen.

### 4.7 Motion

Einheitlich `transition-* duration-150 ease-out` (bis 200 ms) auf Farbe/Border/Opacity/Transform.
`motion-reduce:transition-none` überall. Stepper-, Toast-/Sonner- und Fehler-Einblendungen teilen
dieselbe Dauer/Dezenz.

---

## 5. NEUE KOMPONENTEN (Auswahl: 5 — höchster Nutzen, kein Duplikat)

Alle unter `packages/fachverfahren-kit/src/components`, Import-Endung `.js`, generisch, token-only,
BITV-konform. `Fieldset`/`Field-Layout` bauen auf dem bestehenden `ui/form-field.tsx` auf — nicht
duplizieren.

Siehe strukturierte Ausgabe `newComponents` für Pfad + Props-Skizze je Komponente:
`Stepper`, `DescriptionList`, `SummaryList`, `Timeline`, `Callout`.

---

## 6. REFACTOR-GUIDANCE je Gruppe

### antrag — `AntragStepper.tsx`

- Eingebetteten Stepper-Kopf (Z.~529 `ol flex-nowrap … text-[11px]`, Nummernkreis `text-[10px] h-5`)
  durch das neue `Stepper`-Primitiv ersetzen (Muster 4.6): Text-Heading + Progressbar + `flex-wrap`-
  Segmente mit `truncate`, `h-6 w-6` `text-xs`-Kreise, kanonischer Fokus. Damit ist der Überlauf weg.
- `FeldRenderer` auf `FormField`/`FormLabel`/`FormControl`/`FormDescription`/`FormMessage` umstellen:
  Label `text-sm font-medium text-foreground` (nicht `text-[12px] muted`), Hint `text-sm muted`,
  Inline-Fehler `.fv-text-error` + Icon + `sr-only`„Fehler:" — GLEICHE Größe wie Label/Hint.
- `BerechnungKarte`: Betrag `text-2xl`, Positionen `text-sm`, Kontext-Label `text-xs`; alle
  `text-[10/11/12px]` (Badges/Chips/Positionen) auf Skala. Karte als `bg-surface-2 rounded-md`
  (zweite Ebene), Antragscontainer als `Card` (`shadow-sm rounded-lg p-6`).
- Section/ReviewRow: Review-Schritt auf neues `SummaryList` (Label/Wert + „Ändern"-Link zum Schritt).
- Schrittwechsel: Fokus auf die Schritt-Überschrift setzen, Live-Region ansagen.

### feedback — `ErrorSummary.tsx`, `ErrorState.tsx`, `Banner.tsx`

- `ErrorSummary`: Titel bleibt `text-lg` (h2). **Fehler-Links von aktuellem Stand auf `text-sm`**
  (`.fv-text-error` als Basis, plus Underline) — identisch zur Inline-Größe. Icon `h-5 w-5` ok.
  Box-Fokus/Border bleiben; nutzt `status-block`-Tokens (bereits korrekt).
- `ErrorSummary` und `FormMessage` teilen den `FieldError`-Kontrakt (eine Quelle) → nie divergent.
- `ErrorState`: Fehler-Body auf `text-sm`, Fokus-Rezept 3.2 auf Aktions-Buttons.
- `Banner`: Rolle schärfen (seitenweit/dismissible/live-region) vs. neues `Callout` (inline). Ton-
  Varianten mit `ui/alert.tsx` auf gemeinsame `cva`-Basis ziehen (identisches `status-*`-Mapping).

### sachbearbeitung — `Arbeitsvorrat.tsx`, `FilterBar.tsx`, `StatusPill.tsx`, `StatCard.tsx`, `EvidenceCard.tsx`

- `Arbeitsvorrat`: lokale `StatusPill`-Variante entfernen, kanonische `StatusPill` nutzen (löst die
  Barrel-Namenskollision); Filter-Chips durch `FilterBar` + Chip/Segment-Primitiv; handgerollte
  Sortiertabelle Richtung `ui/data-table.tsx`; alle `text-[10/11/12px]` auf Skala (`text-xs` Minimum).
- `FilterBar`: Chip-Group als Slot verankern; als kanonische Filterleiste im `Arbeitsvorrat` setzen.
- `StatusPill`/`badge`: `size`-Variante (sm/md), Fokus-Rezept, `text-xs` als Minimum; Ton immer über
  `status-*`-Tokens.
- `StatCard`: als Ziel für `AufsichtDashboard`-Kacheln; Kennzahl `text-2xl tabular-nums`, Label
  `text-xs muted`; Skeleton-Variante ergänzen.
- `EvidenceCard`: auf `Card` (`shadow-sm`) + `DescriptionList` für Key-Value; Labels aus roher
  `text-[11px] uppercase` in `text-xs`-Skala überführen.

### chrome — `FachverfahrenShell.tsx`, `PageHeader.tsx`, `PersonaSwitcher.tsx`, `MobileNav.tsx`

- `FachverfahrenShell`: handgerollte Nav Richtung `ui/sidebar.tsx` (collapsible/mobil); Off-Canvas
  über vorhandene `MobileNav`/`Sheet`; Header-Slot für globale Aktionen (KommandoPalette-Trigger,
  LanguageSwitch, A11y/Theme-Schalter) standardisieren; Skip-Link/Landmarks beibehalten.
- `PageHeader`: Seitentitel `text-2xl font-semibold tracking-tight`, Untertitel `text-sm muted`;
  konsistenter Bottom-Rhythmus (`space-y-1` intern, `mb-6` außen).
- `PersonaSwitcher`: Fokus-Rezept 3.2; Trigger-Höhe `h-10`; Tastatur/aria über Radix.
- `MobileNav`: Touch-Ziele ≥44px; Fokus-Rezept; `prefers-reduced-motion` beim Off-Canvas-Übergang.

---

## 7. AKZEPTANZ (was der Umsetzungs-Agent prüft)

- Kein `text-[10px]/[11px]/[12px]` mehr im Kit (grep = 0).
- Inline-Feldfehler und `ErrorSummary`-Links haben dieselbe berechnete Schriftgröße (14px).
- Feld-Labels sind `text-foreground` (volle Tinte), nie `muted`.
- Ein einziges Fokus-Rezept (3px Ring) auf allen interaktiven Elementen; kein `ring-1` ohne offset.
- Der Stepper läuft in keinem Container-Breitenbereich horizontal über (flex-wrap + truncate greifen).
- Antragscontainer und verschachtelte Karten haben definierten Elevation-Rhythmus (Card `shadow-sm`,
  zweite Ebene `bg-surface-2` ohne Schatten).
- Alle Farben über Tokens; Dark + High-Contrast intakt; keine rohen Hex/px in Komponenten.
