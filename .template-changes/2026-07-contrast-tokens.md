---
bump: patch
updateMode: auto
migration: none
---

# Kontrastlücken an semantischen Tokens beheben und statisch prüfen

Behebt eine konkrete, rechnerisch nachvollziehbare Kontrastlücke: `--status-warn`
war auf der Warn-Soft-Fläche mit 3,99:1 zu hell. Der dunklere Token erreicht für
diese Kombination mindestens 4,5:1. Der reine Token-Change ändert keine API.

Das neue Gate `check:contrast-tokens` (`scripts/check-contrast-tokens.mjs`, in
`precommit:check`) berechnet den Kontrast der explizit gelisteten semantischen
Text-auf-Fläche-Paare und schlägt unter 4,5:1 fehl. Es deckt nur diese statische
Farbliste ab und ist kein Nachweis für die vollständige Barrierefreiheit einer
Komponente oder Anwendung. Neue semantische Töne benötigen einen Eintrag in
`PAARE`.

Konsumenten mit eigenen Token-Overrides sollten das Gate ausführen. Manuelle
Prüfungen für Tastatur, Screenreader, 400-Prozent-Reflow und Kontrast in realen
Komponenten und Zuständen bleiben erforderlich.
