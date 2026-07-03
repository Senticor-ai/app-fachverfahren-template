import { describe, it, expect } from "vitest";
import { createStubVoicePort } from "./voice-input.js";

describe("createStubVoicePort — Datenschutz-Profil (on-device, EU, kein Audio-Versand)", () => {
  it("liefert per Default ein on-device-Profil ohne Audio-Versand", () => {
    const port = createStubVoicePort();
    expect(port.datenschutz()).toEqual({
      onDevice: true,
      euResidenz: true,
      sendetAudio: false,
    });
  });

  it("erlaubt ein teilweises Überschreiben des Profils (Rest bleibt Default)", () => {
    const port = createStubVoicePort({
      datenschutz: { onDevice: false, sendetAudio: true },
    });
    expect(port.datenschutz()).toEqual({
      onDevice: false,
      euResidenz: true,
      sendetAudio: true,
    });
  });
});

describe("createStubVoicePort — transkribiere liefert den konfigurierten Text (deterministisch, kein Modell)", () => {
  it("gibt den konfigurierten Text, die Quelle und die Konfidenz zurück", async () => {
    const port = createStubVoicePort({
      text: "Hallo Welt",
      quelle: "Test-Stub",
      konfidenz: 0.77,
    });
    const res = await port.transkribiere({ dauerMs: 1200 });
    expect(res.text).toBe("Hallo Welt");
    expect(res.quelle).toBe("Test-Stub");
    expect(res.konfidenz).toBe(0.77);
  });

  it("kappt die Konfidenz auf 0..1", async () => {
    const port = createStubVoicePort({ text: "X", konfidenz: 5 });
    const res = await port.transkribiere({});
    expect(res.konfidenz).toBe(1);
  });

  it("ein generator hat Vorrang vor text und leitet deterministisch aus dem Deskriptor ab", async () => {
    const port = createStubVoicePort({
      text: "wird ignoriert",
      generator: (audio) => ({
        text: `Dauer ${audio.dauerMs ?? 0} ms`,
        konfidenz: 0.5,
      }),
    });
    const res = await port.transkribiere({ dauerMs: 300 });
    expect(res.text).toBe("Dauer 300 ms");
    expect(res.konfidenz).toBe(0.5);
  });

  it("liefert per Default einen generischen, nicht leeren Text und macht den Stub sichtbar", async () => {
    const port = createStubVoicePort();
    const res = await port.transkribiere({});
    expect(res.text.length).toBeGreaterThan(0);
    expect(res.quelle).toContain("Stub");
  });
});

describe("createStubVoicePort — hoere() streamt kumulative Zwischenergebnisse (deterministisch, ohne Timer)", () => {
  it("leitet ohne explizite chunks den Text wortweise kumulativ ab; nur der letzte ist final", async () => {
    const port = createStubVoicePort({ text: "eins zwei drei" });
    const teile: { text: string; final: boolean }[] = [];
    for await (const t of port.hoere!()) teile.push(t);
    expect(teile.map((t) => t.text)).toEqual([
      "eins",
      "eins zwei",
      "eins zwei drei",
    ]);
    expect(teile[teile.length - 1]!.final).toBe(true);
    expect(teile.slice(0, -1).every((t) => !t.final)).toBe(true);
  });

  it("nutzt explizit gesetzte chunks unverändert (letzter final)", async () => {
    const port = createStubVoicePort({ chunks: ["a", "ab", "abc"] });
    const texte: string[] = [];
    let letzterFinal = false;
    for await (const t of port.hoere!()) {
      texte.push(t.text);
      letzterFinal = t.final;
    }
    expect(texte).toEqual(["a", "ab", "abc"]);
    expect(letzterFinal).toBe(true);
  });
});
