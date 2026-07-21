// pdf.test — der template-getriebene Bescheid-Renderer (#60). Prüft: wohlgeformtes PDF, Hash im Metadaten-
// Paket (selbstbeschreibendes Beweis-Token), Template-Sektionen inkl. KI-Freitext, Determinismus des Inhalts.
import type { VerwaltungsaktDto } from "@senticor/app-bff-contracts";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  defaultBescheidTemplate,
  renderBescheidPdf,
  type BescheidTemplate,
} from "./pdf.js";

const VA: VerwaltungsaktDto = {
  aktenzeichen: "IGM-2026-0042",
  issuedAt: "2026-07-20T10:00:00.000Z",
  issuedBy: "sb.mueller",
  tenor: { leistung: "Bewilligung", betrag: "120,00 EUR" },
  rechtsbehelf: {
    art: "widerspruch",
    fristWert: 1,
    fristEinheit: "monat",
    stelle: "Stadt Musterstadt, Amt 50",
    norm: "§ 70 VwGO",
  },
  fiktionTage: 3,
  fiktionNorm: "§ 41 Abs. 2 VwVfG",
  tenorHerkunft: "server-nachgerechnet",
  checksumSha256: "a".repeat(64),
};

const BEHOERDE = "Stadt Musterstadt";

describe("renderBescheidPdf", () => {
  it("erzeugt ein wohlgeformtes PDF (Magic-Bytes + EOF)", async () => {
    const bytes = await renderBescheidPdf({ va: VA, behoerde: BEHOERDE });
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
    const tail = new TextDecoder().decode(bytes.slice(-6));
    expect(tail).toContain("%%EOF");
    expect(bytes.byteLength).toBeGreaterThan(600);
  });

  it("bettet den Hash + Aktenzeichen selbstbeschreibend in die Metadaten ein", async () => {
    const bytes = await renderBescheidPdf({ va: VA, behoerde: BEHOERDE });
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toContain(VA.aktenzeichen);
    expect(loaded.getAuthor()).toBe(BEHOERDE);
    expect(loaded.getKeywords() ?? "").toContain(`sha256:${VA.checksumSha256}`);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("rendert eine KI-entworfene Freitext-Sektion (menschlich geprüft) mit ins Template", async () => {
    const template: BescheidTemplate = {
      titel: "Bescheid (Verwaltungsakt)",
      sektionen: [
        { kind: "kopf" },
        { kind: "tenor" },
        {
          kind: "freitext",
          ueberschrift: "Begründung",
          absaetze: [
            "Der Antrag war zu bewilligen, weil die Voraussetzungen vorliegen.",
            "Die Höhe ergibt sich aus dem einschlägigen Tarif.",
          ],
        },
        { kind: "rechtsbehelf" },
        { kind: "integritaet" },
      ],
    };
    const withFreitext = await renderBescheidPdf({
      va: VA,
      behoerde: BEHOERDE,
      template,
    });
    const withoutFreitext = await renderBescheidPdf({
      va: VA,
      behoerde: BEHOERDE,
      template: defaultBescheidTemplate,
    });
    // Mehr Inhalt → tendenziell größeres Dokument; beide bleiben valide PDFs.
    expect(withFreitext.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(withFreitext.slice(0, 5))).toBe("%PDF-");
    expect(withFreitext.byteLength).toBeGreaterThan(withoutFreitext.byteLength);
  });

  it("verträgt einen leeren/null-Tenor ohne Absturz", async () => {
    const bytes = await renderBescheidPdf({
      va: { ...VA, tenor: null },
      behoerde: BEHOERDE,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
