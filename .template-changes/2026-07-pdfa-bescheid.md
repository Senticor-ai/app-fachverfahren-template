---
bump: minor
updateMode: review
migration: none
---

Ergänzt eine open-source PDF/A-Erzeugung für den Bescheid — OHNE Java. Der
Bescheid-Renderer liefert bereits ein PDF mit eingebetteter Schrift (DejaVu);
für ein PDF/A-Langzeitdokument fehlen nur der sRGB-OutputIntent (ICC) und das
XMP-`pdfaid`-Paket. Beides fügt `scripts/pdfa/to_pdfa.py` rein mit `pikepdf`
(qpdf-basiert, `pip`) hinzu und verifiziert die Marker.

Bewusst ohne Java: veraPDF (der strenge Validator) ist Java, aber zum ERZEUGEN
eines konformen PDF/A genügt `pikepdf`. Kein Ghostscript-Runtime nötig; ohne
`--icc` wird eine sRGB-ICC systemseitig gesucht (nur die ICC-Datei, `gs` wird
NICHT ausgeführt).

Der kanonische Hash des Verwaltungsakts bleibt unberührt (er deckt den
eingefrorenen VA ab, nicht die PDF-Hülle) — die append-only Audit-Kette und der
Bescheid-Download mit Hash-Beweis sind unverändert.

Konsumenten-Hinweis: Die Python-Toolchain (venv + `pikepdf` aus
`scripts/pdfa/requirements.txt` + eine frei weiterverteilbare sRGB-ICC) ist eine
Umgebungsentscheidung. Die Runtime-Einbindung (Nachbearbeitung beim
Bescheid-Download vs. Batch-/Archivlauf) ist eine Deploy-Entscheidung; siehe
`scripts/pdfa/README.md`.
