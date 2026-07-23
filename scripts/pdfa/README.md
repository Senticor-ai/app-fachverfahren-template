# Bescheid → PDF/A (open source, ohne Java)

Der Bescheid-Renderer (`apps/fachverfahren/server/bescheid/pdf.ts`) erzeugt ein PDF mit **eingebetteter
Schrift** (DejaVu). Für ein **PDF/A-Langzeitdokument** fehlen nur noch der **sRGB-OutputIntent** (ICC) und
das **XMP-`pdfaid`-Paket** — beides fügt dieser Python-Schritt hinzu.

**Bewusst Python (pikepdf), kein Java:** veraPDF (der strenge Validator) ist Java, aber zum ERZEUGEN eines
PDF/A reicht `pikepdf` (qpdf-basiert, `pip`). Kein Ghostscript-Runtime nötig.

## Nutzung

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/pdfa/requirements.txt
# Bescheid-PDF (aus dem Renderer) nach PDF/A-2B konvertieren:
python3 scripts/pdfa/to_pdfa.py bescheid.pdf bescheid.pdfa.pdf   # --icc <sRGB.icc> optional
```

Der Schritt verifiziert am Ende die PDF/A-Marker (OutputIntent(sRGB) + `pdfaid:2B` + eingebettete Schrift).

## sRGB-ICC

Ohne `--icc` sucht das Tool eine sRGB-ICC an gängigen Orten (System-ColorSync, `/usr/share/color/icc`,
Ghostscript-Bundle — nur die ICC-Datei, gs wird NICHT ausgeführt). Für einen reproduzierbaren Build eine
**frei weiterverteilbare** sRGB-ICC (IEC 61966-2.1) beilegen und via `--icc` referenzieren.

## Verhältnis zum Renderer + Integration

- **Erzeugen** (dieser Schritt): PDF → PDF/A-2B, deterministisch, ohne Java.
- **Streng validieren** (optional, separat): veraPDF (Java) als CI-Gate, wenn die Toolchain vorhanden ist —
  nicht nötig, um konforme PDF/A zu ERZEUGEN.
- **Runtime-Einbindung** (Deploy-Entscheidung): entweder ein Nachbearbeitungs-Schritt beim Bescheid-Download
  (Server ruft diesen Konverter) oder ein Batch-/Archiv-Lauf. Der Kern-Hash des Verwaltungsakts bleibt
  unberührt (er deckt den eingefrorenen VA ab, nicht die PDF-Hülle).
