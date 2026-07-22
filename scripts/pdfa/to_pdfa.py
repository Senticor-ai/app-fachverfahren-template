#!/usr/bin/env python3
"""to_pdfa — konvertiert ein Bescheid-PDF (aus dem pdf-lib-Renderer, eingebettete Schrift) nach PDF/A-2B.

OPEN SOURCE, KEIN JAVA: nutzt ausschliesslich pikepdf (qpdf-basiert). Fuegt den fehlenden PDF/A-Baustein
hinzu — einen sRGB-OutputIntent (ICC) + ein XMP-Paket mit pdfaid:part/conformance. Die Schrift ist bereits
vom Renderer eingebettet (DejaVu), die kanonischen Hash-Bytes des Verwaltungsakts bleiben unberuehrt (der
Hash deckt den eingefrorenen VA ab, nicht die PDF-Huelle).

Nutzung (Python 3, pikepdf via scripts/pdfa/requirements.txt):
    python3 scripts/pdfa/to_pdfa.py <eingang.pdf> <ausgang.pdf> [--icc <sRGB.icc>]
Ohne --icc wird eine sRGB-ICC an gaengigen Orten gesucht (Ghostscript-Bundle, System-ColorSync,
/usr/share/color/icc). Verifiziert am Ende die PDF/A-Marker (OutputIntent + pdfaid + eingebettete Schrift).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pikepdf
from pikepdf import Array, Dictionary, Name, Pdf, String

# Gaengige Fundorte einer sRGB-ICC (open source / systemseitig) — der Aufrufer kann via --icc ueberschreiben.
_ICC_CANDIDATES = [
    "/usr/share/color/icc/sRGB.icc",
    "/usr/share/color/icc/colord/sRGB.icc",
    "/System/Library/ColorSync/Profiles/sRGB Profile.icc",
]


def _find_icc(explicit: str | None) -> str:
    if explicit:
        return explicit
    for c in _ICC_CANDIDATES:
        if Path(c).is_file():
            return c
    # Ghostscript-Bundle (falls installiert) — nur die ICC-Datei, gs selbst wird NICHT ausgefuehrt.
    for base in ("/opt/homebrew/Cellar/ghostscript", "/usr/local/Cellar/ghostscript"):
        for p in Path(base).glob("*/share/ghostscript/iccprofiles/srgb.icc"):
            return str(p)
    raise SystemExit(
        "Keine sRGB-ICC gefunden. Mit --icc <pfad.icc> angeben "
        "(z. B. eine frei weiterverteilbare sRGB IEC61966-2.1)."
    )


def to_pdfa(inp: str, outp: str, icc_path: str) -> None:
    pdf = Pdf.open(inp)
    icc_bytes = Path(icc_path).read_bytes()
    icc = pdf.make_stream(icc_bytes)
    icc[Name.N] = 3  # sRGB = 3 Farbkomponenten
    output_intent = pdf.make_indirect(
        Dictionary(
            Type=Name.OutputIntent,
            S=Name("/GTS_PDFA1"),  # Subtyp fuer ALLE PDF/A-Teile
            OutputConditionIdentifier=String("sRGB IEC61966-2.1"),
            RegistryName=String("http://www.color.org"),
            Info=String("sRGB IEC61966-2.1"),
            DestOutputProfile=pdf.make_indirect(icc),
        )
    )
    pdf.Root.OutputIntents = Array([output_intent])
    with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
        meta["pdfaid:part"] = "2"
        meta["pdfaid:conformance"] = "B"
    pdf.save(outp)


def verify(outp: str) -> None:
    v = Pdf.open(outp)
    assert Name.OutputIntents in v.Root, "kein OutputIntents"
    meta = v.open_metadata()
    assert meta.get("pdfaid:part") == "2", "kein pdfaid:part=2"
    assert meta.get("pdfaid:conformance") == "B", "kein pdfaid:conformance=B"
    for page in v.pages:
        fonts = page.get("/Resources", {}).get("/Font", {})
        for font in list(fonts.values()):
            for descendant in list(font.get("/DescendantFonts", [font])):
                fd = descendant.get("/FontDescriptor", {})
                if any(k in fd for k in ("/FontFile", "/FontFile2", "/FontFile3")):
                    print(
                        f"PDF/A-2B-Marker OK: OutputIntent(sRGB) + pdfaid:2B + eingebettete Schrift; "
                        f"{len(v.pages)} Seite(n)"
                    )
                    return
    raise SystemExit("Keine eingebettete Schrift gefunden — Eingang war nicht selbsttragend.")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Bescheid-PDF -> PDF/A-2B (pikepdf, kein Java).")
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--icc", default=None, help="Pfad zu einer sRGB-ICC (sonst Auto-Erkennung).")
    args = parser.parse_args(argv)
    icc = _find_icc(args.icc)
    to_pdfa(args.input, args.output, icc)
    verify(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
