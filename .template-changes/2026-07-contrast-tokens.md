---
bump: patch
updateMode: auto
migration: none
---

# WCAG-2.1-AA-Kontrast: Warn-Token gehärtet + Text-Dimming-Anti-Pattern entfernt + Gate

Zwei am echten Browser (axe-core) verifizierte, generische Barrierefreiheits-Root-Causes behoben
(BITV 2.0 / WCAG 2.1 AA ist für deutsche Verwaltung verpflichtend):

- **Warn-Text-Token zu hell.** `--status-warn` war `hsl(38 95% 34%)` → auf der Warn-Soft-Fläche
  nur **3.99:1** (unter AA). Jetzt `hsl(38 95% 30%)` → **≥4.5:1**. Betrifft jede Verwendung des
  Warn-Tons als Text (Badges/Eyebrows auf `/amt/board`, `/amt/liste`, `/amt/regeln`); Rahmen/Icons
  gewinnen an Kontrast. Reiner Token-Wert, keine API-Änderung.
- **`opacity` auf Text-Blöcken.** `RegelwerkPanel` dimmte inaktive Regel-Karten per `opacity-70`,
  was auch den Text (muted `dt`-Labels 3.06:1, mono-Chips 3.35:1) unter AA zog. Der Zustand wird
  ohnehin per Badge „inaktiv" getragen; die Karte wird jetzt per `border-dashed` de-emphasized
  (kontrast-neutral).

Nach dem Fix: `/amt/regeln`, `/amt/board`, `/amt/liste`, `/amt/inbox`, `/amt/dashboard` = **0**
axe-WCAG-Verstöße.

Neues Gate `check:contrast-tokens` (`scripts/check-contrast-tokens.mjs`, in `precommit:check`):
rein statisch (kein Browser), rechnet den WCAG-Kontrast der semantischen Text-auf-Fläche-Token-Paare
(Status-Töne, foreground/background, card, muted, primary) und schlägt unter 4.5:1 fehl — der
Regressions-Wächter für genau die Klasse, in die der Warn-Token gerutscht war. Generisch: neue Töne
→ Paar in der `PAARE`-Liste ergänzen.

Konsumenten mit **eigenen** Status-Token-Overrides sollten `pnpm run check:contrast-tokens` prüfen.
