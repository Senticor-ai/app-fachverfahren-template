// testzugang-client — liest die Selbstauskunft des Entwicklungsstands (GET /dev/testzugang).
//
// Der Server ist DIE Wahrheit: er entscheidet, ob es Testkonten gibt, und nennt sonst den Grund.
// Diese Naht rät nichts und hat keinen eigenen Zustand. Antwortet der Server nicht mit JSON
// (Produktivbetrieb ⇒ die Route existiert dort nicht ⇒ SPA-Fallback/404), gilt: kein Testzugang.
import { apiPath } from "./api-base.js";

export type TestkontoRolle = "citizen" | "member" | "admin";

export interface TestzugangKonto {
  email: string;
  name: string;
  passwort: string;
  rolle: TestkontoRolle;
  personas: string[];
  zweck: string;
  einstieg: string;
}

export interface TestzugangAktiv {
  aktiv: true;
  hinweis: string;
  konten: TestzugangKonto[];
}

export interface TestzugangGesperrt {
  aktiv: false;
  grund: string;
  erklaerung: string;
}

export type TestzugangAusweis = TestzugangAktiv | TestzugangGesperrt;

function istAusweis(wert: unknown): wert is TestzugangAusweis {
  return (
    typeof wert === "object" &&
    wert !== null &&
    typeof (wert as { aktiv?: unknown }).aktiv === "boolean"
  );
}

/** Lädt den Ausweis. `null` = keine Auskunft (Route nicht vorhanden, kein JSON, Netzfehler) —
 *  die Oberfläche zeigt dann schlicht keinen Testzugang an. */
export async function ladeTestzugang(
  fetchImpl: typeof fetch = fetch,
): Promise<TestzugangAusweis | null> {
  try {
    const antwort = await fetchImpl(apiPath("/api/dev/testzugang"), {
      credentials: "include",
    });
    if (!antwort.ok) return null;
    const typ = antwort.headers.get("content-type") ?? "";
    if (!typ.toLowerCase().includes("application/json")) return null;
    const daten: unknown = await antwort.json();
    return istAusweis(daten) ? daten : null;
  } catch {
    return null;
  }
}
