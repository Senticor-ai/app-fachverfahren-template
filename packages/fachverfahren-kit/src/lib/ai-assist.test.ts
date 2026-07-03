import { describe, it, expect } from "vitest";
import {
  createStubAiAssistPort,
  createStubChatPort,
  STANDARD_KI_KENNZEICHNUNG,
  type KiChatAbschluss,
  type KiChatNachricht,
} from "./ai-assist.js";

// Bewusst VERFAHRENSFREIE Beispieldaten — der Assistenz-/Chat-PORT ist domaenen-agnostisch.

describe("createStubAiAssistPort — transparenter Vorschlag aus DATEN (kein Modell)", () => {
  it("liefert alle fuenf Transparenzelemente; reviewErforderlich bleibt true", async () => {
    const port = createStubAiAssistPort({
      quelle: "Test-Modell",
      kennzeichnung: "KI-Test",
      vorschlag: "Vorgeschlagener Wert",
      begruendung: "Aus dem Kontext abgeleitet.",
      standardKonfidenz: 0.66,
    });
    const v = await port.schlageVor({ text: "Eingabe" });

    expect(v.wert).toBe("Vorgeschlagener Wert");
    expect(v.quelle).toBe("Test-Modell"); // source
    expect(v.konfidenz).toBe(0.66); // confidence
    expect(v.begruendung).toBe("Aus dem Kontext abgeleitet."); // why
    expect(v.kennzeichnung).toBe("KI-Test"); // marking
    expect(v.reviewErforderlich).toBe(true); // HITL — nie abschaltbar
  });

  it("faellt ohne Options auf sichere, sichtbare Defaults (Stub-Kennzeichnung)", async () => {
    const port = createStubAiAssistPort();
    const v = await port.schlageVor({ text: "x" });
    expect(v.quelle).toContain("Stub");
    expect(v.kennzeichnung).toBe(STANDARD_KI_KENNZEICHNUNG);
    expect(v.konfidenz).toBe(0.75); // Standard-Konfidenz
    expect(v.reviewErforderlich).toBe(true);
  });

  it("ein generator hat Vorrang und darf Konfidenz/Begruendung liefern; Konfidenz wird auf 0..1 gekappt", async () => {
    const port = createStubAiAssistPort({
      vorschlag: "ausOptions",
      generator: (e) => ({
        wert: e.text.toUpperCase(),
        konfidenz: 5, // wird gekappt
        begruendung: "vom Generator",
      }),
    });
    const v = await port.schlageVor({ text: "ok" });
    expect(v.wert).toBe("OK"); // Generator verdraengt `vorschlag`
    expect(v.konfidenz).toBe(1); // gekappt
    expect(v.begruendung).toBe("vom Generator");
    expect(v.reviewErforderlich).toBe(true);
  });

  it("ein String-Generator wird als reiner Wert gedeutet (Konfidenz aus standardKonfidenz)", async () => {
    const port = createStubAiAssistPort({
      standardKonfidenz: 0.4,
      generator: (e) => `Antwort auf: ${e.text}`,
    });
    const v = await port.schlageVor({ text: "Frage" });
    expect(v.wert).toBe("Antwort auf: Frage");
    expect(v.konfidenz).toBe(0.4);
  });
});

/** Konsumiert den Antwort-Strom manuell: sammelt die Token und liest die Abschluss-Metadaten (Return-Wert). */
async function stromZuTexten(
  strom: AsyncGenerator<string, KiChatAbschluss>,
): Promise<{ chunks: string[]; abschluss: KiChatAbschluss }> {
  const chunks: string[] = [];
  let res = await strom.next();
  while (!res.done) {
    chunks.push(res.value);
    res = await strom.next();
  }
  return { chunks, abschluss: res.value };
}

describe("createStubChatPort — gestreamte Antwort aus DATEN (kein Modell)", () => {
  const verlauf: KiChatNachricht[] = [{ rolle: "nutzer", text: "Hallo" }];

  it("yieldet exakt die konfigurierten Chunks und liefert am Ende die Abschluss-Metadaten", async () => {
    const port = createStubChatPort({
      quelle: "Chat-Test",
      kennzeichnung: "KI-Chat",
      chunks: ["Guten ", "Tag."],
    });
    const { chunks, abschluss } = await stromZuTexten(port.sende(verlauf));
    expect(chunks).toEqual(["Guten ", "Tag."]);
    expect(abschluss).toEqual({ quelle: "Chat-Test", kennzeichnung: "KI-Chat" });
  });

  it("ein generator leitet die Chunks aus dem Verlauf ab (Vorrang vor chunks)", async () => {
    const port = createStubChatPort({
      chunks: ["ignoriert"],
      generator: (v) => v.map((n) => `${n.rolle}:${n.text} `),
    });
    const { chunks } = await stromZuTexten(port.sende(verlauf));
    expect(chunks).toEqual(["nutzer:Hallo "]);
  });

  it("ohne Options liefert der Stub eine generische, sichtbar gekennzeichnete Antwort", async () => {
    const port = createStubChatPort();
    const { chunks, abschluss } = await stromZuTexten(port.sende(verlauf));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("prüfen");
    expect(abschluss.kennzeichnung).toBe(STANDARD_KI_KENNZEICHNUNG);
    expect(abschluss.quelle).toContain("Stub");
  });

  it("`for await` liest nur die Token (der Return-Wert bleibt dabei aussen vor)", async () => {
    const port = createStubChatPort({ chunks: ["a", "b", "c"] });
    const gesammelt: string[] = [];
    for await (const token of port.sende(verlauf)) {
      gesammelt.push(token);
    }
    expect(gesammelt).toEqual(["a", "b", "c"]);
  });
});
