// Der Vertrag darf den PROZESS nicht ueberholen.
//
// ⛔ DER BEZAHLTE FALL (live gemessen 2026-09-14): `antragProcedure` war eine MODUL-KONSTANTE — genau EINE
// Auswertung beim Import. Der Vertrag, aus dem sie sich ableitet, wird von einer SPAETEREN Bau-Phase
// geschrieben; gemessen startete der Vorschau-Prozess um 01:00:36 und `leistung.contract.json` entstand um
// 01:27:46, also 27 Minuten danach. Die Ableitung fiel deshalb auf MUSTER_ANTRAG zurueck, waehrend der
// Client laengst seine eigene Kennung sendete — und JEDER Buerger-Antrag endete mit 422
// „Dieser Antrag kann derzeit nicht angenommen werden".
//
// BELEG in BEIDE Richtungen, am laufenden Prozess: vor dem Neustart eigene Kennung → 422 und
// `musterantrag` → 201; nach dem Neustart genau umgekehrt. Gleicher Code, gleicher Vertrag auf der Platte
// — allein der ZEITPUNKT des Imports unterschied sich.
//
// Dieser Zeuge misst die EIGENSCHAFT, die das verhindert: die Ableitung wird neu ausgewertet, sobald sich
// der Stempel ihrer Quelle aendert — und sonst nie.
import { describe, expect, it } from "vitest";
import {
  antragProcedureJetzt,
  frischGehalten,
  procedureRegistryDerNaht,
} from "./procedure.config.js";

/** Die ALTE Form, nur fuer die Gegenprobe: einmal auswerten, danach nie wieder fragen. */
function einmalGehalten<T>(ableiten: () => T): () => T {
  const wert = ableiten();
  return () => wert;
}

describe("der Vertrag bleibt frisch", () => {
  it("(1) ohne Aenderung wird GENAU EINMAL abgeleitet — der Puffer traegt", () => {
    let rufe = 0;
    const lies = frischGehalten(
      () => "gleich",
      () => ++rufe,
    );
    expect(lies()).toBe(1);
    expect(lies()).toBe(1);
    expect(lies()).toBe(1);
    expect(rufe).toBe(1);
  });

  it("(2) DER GEMESSENE FALL: die Quelle entsteht ERST NACH dem Import — und wird trotzdem gelesen", () => {
    // Stempel "" = der Vertrag existiert beim ersten Ruf noch nicht (die Lage um 01:00:36).
    let stempel = "";
    let rufe = 0;
    const ableiten = (): string => {
      rufe += 1;
      return stempel === "" ? "musterantrag" : "schuelerfahrtkostenbeihilfe";
    };
    const lies = frischGehalten(() => stempel, ableiten);
    expect(lies()).toBe("musterantrag");
    stempel = "1757808466000:4711"; // die Bau-Phase schreibt den Vertrag, 27 Minuten spaeter
    expect(lies()).toBe("schuelerfahrtkostenbeihilfe");
    expect(rufe).toBe(2);
  });

  it("(2b) GEGENPROBE AN DER ALTEN FORM: eine einmalige Auswertung sieht den spaeteren Vertrag NIE", () => {
    // Ohne diese Kontrolle waere (2) auch dann gruen, wenn der Unterschied gar keiner ist.
    let stempel = "";
    const alt = einmalGehalten(() =>
      stempel === "" ? "musterantrag" : "schuelerfahrtkostenbeihilfe",
    );
    expect(alt()).toBe("musterantrag");
    stempel = "1757808466000:4711";
    expect(alt()).toBe("musterantrag"); // ⇐ genau der 422-Zustand, den wir gemessen haben
  });

  it("(3) auch der RUECKWEG traegt: aendert sich der Stempel erneut, gilt die neue Ableitung", () => {
    let stempel = "a";
    const lies = frischGehalten(
      () => stempel,
      () => stempel,
    );
    expect(lies()).toBe("a");
    stempel = "b";
    expect(lies()).toBe("b");
    stempel = "a";
    expect(lies()).toBe("a");
  });

  it("(4) FUGE: die Antrags-Ableitung ist eine FUNKTION, keine Modul-Konstante", () => {
    expect(typeof antragProcedureJetzt).toBe("function");
    const a = antragProcedureJetzt();
    const b = antragProcedureJetzt();
    expect(a).toBe(b); // unveraenderter Vertrag ⇒ dieselbe Instanz, der Puffer greift
    expect(a.procedureId.length).toBeGreaterThan(0);
  });

  it("(5) FUGE: das aus dem Vertrag abgeleitete Verfahren ist ueber die Registry auffindbar", () => {
    const reg = procedureRegistryDerNaht();
    const eigen = antragProcedureJetzt();
    const treffer = reg.get(eigen.procedureId, eigen.version);
    // Ohne diesen Treffer endet JEDER Buerger-Antrag in 422 — der gemessene Fall.
    expect(treffer).toBeDefined();
    expect(treffer?.procedureId).toBe(eigen.procedureId);
    expect(reg.list().length).toBeGreaterThanOrEqual(2); // Dossier UND Antrag
  });

  it("(6) POSITIV-KONTROLLE: eine unbekannte Kennung bleibt unbekannt (fail-closed)", () => {
    // Ohne sie waere (5) auch dann gruen, wenn die Registry ALLES beantwortet.
    expect(
      procedureRegistryDerNaht().get("gibt-es-nicht", "1"),
    ).toBeUndefined();
  });
});
