// amt-client — die HTTP-Persistenz-Naht der AMTS-Sicht auf die Vorgänge (/api/cases).
//
// DER GESCHLOSSENE BRUCH: die Sachbearbeitungs-Sichten (/amt, /amt/vorgang/:id) rendern bisher den
// DEMO-Bestand aus der Config (`leistung.config.seed`). Ein Bürger konnte einen Antrag stellen — im
// Amt tauchte er nie auf. Die Kette endete exakt beim „201". Diese Naht schliesst sie: das Amt lädt,
// was der Server hat, und vollzieht Übergänge dort, wo sie hingehören.
//
// UNTERSCHIED ZUR BÜRGER-NAHT (antrag-client.ts): dieselbe Abbildung Vorgang ↔ DTO, aber der ANDERE
// Scope. Der Bürger liest owner-scoped seine eigenen Anträge; das Amt liest behörden-scoped die Fälle
// seiner Stelle. Beide Scopes stecken in der ROUTE, nicht in einem Parameter — deshalb zwei Nähte
// und keine `scope`-Fahne, die man verwechseln könnte.
//
// NIE EINREICHEN: das Amt reicht keine Bürger-Anträge ein. `einreichen` wirft absichtlich — ein
// stiller lokaler Fallback hätte einen Vorgang erzeugt, den der Server nicht kennt.
import { slugifyAction } from "@senticor/public-sector-sdk";
import type { CaseDto } from "@senticor/app-bff-contracts";
import type {
  LeistungConfig,
  Vorgang,
  VorgangPersistence,
} from "@senticor/fachverfahren-kit";
import { apiPath, CaseRequestError } from "./case-client.js";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new CaseRequestError(
      response.status,
      `request to ${path} failed (${response.status}): ${text}`,
    );
  }
  return (await response.json()) as T;
}

/** Die Vorgang-Felder, die oben am DTO stehen (id/status) — alles Übrige ist die opake `data`-Nutzlast. */
type VorgangRumpf<T> = Omit<Vorgang<T>, "id" | "status">;

/**
 * CaseDto → Vorgang. Die Amts-Sicht zeigt EXAKT das, was der Bürger eingereicht hat (`data`), plus
 * die server-autoritativen Felder Zustand und Eingangszeit. Defensiv gegen partielle `data`:
 * `history`/`nachweise` MÜSSEN Arrays sein, sonst iterieren die Bausteine ins Leere.
 */
export function caseZuVorgang<T>(dto: CaseDto): Vorgang<T> {
  const rumpf = (dto.data ?? {}) as unknown as VorgangRumpf<T>;
  return {
    ...rumpf,
    id: dto.caseId,
    status: dto.state,
    // SERVER-WAHRHEIT vor Client-Nutzlast: der Eingangszeitpunkt ist der des Servers, nicht der,
    // den der Browser des Antragstellers in die `data` geschrieben hatte.
    eingangIso: dto.openedAt,
    vorgangsnummer:
      typeof rumpf.vorgangsnummer === "string" && rumpf.vorgangsnummer
        ? rumpf.vorgangsnummer
        : dto.caseId,
    history: Array.isArray(rumpf.history) ? rumpf.history : [],
    nachweise: Array.isArray(rumpf.nachweise) ? rumpf.nachweise : [],
  } as Vorgang<T>;
}

/**
 * Baut die Amts-Persistenz. `config` liefert die Zustandsmaschine — daraus wird die server-seitige
 * `action` abgeleitet (`slugifyAction(label)`, dieselbe Funktion, die auch die ProcedureVersion aus
 * der Zustandsmaschine ableitet: EINE Wahrheit, kein zweites Mapping).
 */
export function createHttpAmtVorgangPersistence<T = Record<string, unknown>>(
  config: Pick<LeistungConfig<T>, "statusMachine">,
): VorgangPersistence<T> {
  return {
    async laden() {
      const body = await request<{ cases: CaseDto[] }>("/api/cases");
      return body.cases.map((dto) => caseZuVorgang<T>(dto));
    },

    async einreichen() {
      // Ein Amt reicht keinen Bürger-Antrag ein. Ein stiller lokaler Fallback erzeugte einen Vorgang,
      // den der Server nicht kennt — genau die Sorte Phantom-Datensatz, die später niemand erklärt.
      throw new Error(
        "Die Sachbearbeitungs-Sicht reicht keine Anträge ein — Anträge kommen über die Bürger-Fläche.",
      );
    },

    async uebergang(vorgang, to, detail) {
      const t = (config.statusMachine?.transitions ?? []).find(
        (x) => x.from === vorgang.status && x.to === to,
      );
      if (!t)
        throw new Error(`Übergang ${vorgang.status} → ${to} nicht erlaubt`);
      // Der Server kennt den Übergang unter der aus dem LABEL abgeleiteten `action`.
      const dto = await request<CaseDto>(
        `/api/cases/${encodeURIComponent(vorgang.id)}/transitions`,
        {
          method: "POST",
          body: JSON.stringify({
            action: slugifyAction(t.label),
            ...(detail !== undefined ? { detail } : {}),
          }),
        },
      );
      return caseZuVorgang<T>(dto);
    },
  };
}
