// antrag-client — die HTTP-Persistenz-Naht der BÜRGER-Anträge gegen /api/buerger/antraege.
//
// Sie implementiert `VorgangPersistence` (fachverfahren-kit): der Store rechnet den Vorgang wie bisher,
// diese Naht bewahrt ihn auf. DIESELBE Konvention wie case-client (Session-Cookie, BASE_URL-Präfix,
// DTOs aus @senticor/app-bff-contracts — nicht dupliziert). Die Server-Topologie
// (tenant/authority/jurisdiction) und die Eigentümerschaft bleiben verborgen: sie kommen serverseitig
// AUSSCHLIESSLICH aus der Sitzung.
//
// DIE ABBILDUNG Vorgang ↔ AntragDto ist der Kern:
//  - Der reiche `Vorgang` (antragsdaten, berechnung, nachweise, history, vorgangsnummer, …) reist als
//    OPAKE Nutzlast in `AntragDto.data` — der Server interpretiert sie nicht (er kann es nicht; die
//    fachliche Config liegt ausserhalb seines rootDir).
//  - Der `status` des Vorgangs bildet den fachlichen `state` des Falls ab (der Server kennt ihn als
//    Zustand seiner Zustandsmaschine).
//  - Die `id` ist die vom SERVER vergebene `antragId` (caseId) — verbindlich, damit ein Reload denselben
//    Vorgang findet.
import type {
  AntragDto,
  AntragEinreichenRequestDto,
  AntragListDto,
} from "@senticor/app-bff-contracts";
import type { Vorgang, VorgangPersistence } from "@senticor/fachverfahren-kit";
import { apiPath, CaseRequestError } from "./case-client.js";

/** Die Vorgang-Felder, die NICHT in `data` gehören, weil sie oben am DTO stehen (id/status). Alles
 *  Übrige bildet die opake Nutzlast. */
type VorgangRumpf<T> = Omit<Vorgang<T>, "id" | "status">;

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
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new CaseRequestError(
      response.status,
      `request to ${path} returned "${contentType || "unknown"}" instead of JSON — is the API server running?`,
    );
  }
  return (await response.json()) as T;
}

/** AntragDto → Vorgang: id/status von oben, der Rest aus der opaken `data`-Nutzlast. */
function toVorgang<T>(dto: AntragDto): Vorgang<T> {
  const rumpf = dto.data as unknown as VorgangRumpf<T>;
  return {
    ...rumpf,
    id: dto.antragId,
    status: dto.state,
  };
}

/**
 * Baut die HTTP-Persistenz-Naht. `procedureId`/`procedureVersion` identifizieren das Verfahren
 * server-seitig (Verfahren = DATEN in der ProcedureRegistry) — sie stammen aus der Konfiguration der
 * App, nicht aus Nutzereingaben.
 */
export function createHttpVorgangPersistence<
  T = Record<string, unknown>,
>(opts: {
  procedureId: string;
  procedureVersion: string;
}): VorgangPersistence<T> {
  return {
    async laden() {
      const body = await request<AntragListDto>("/api/buerger/antraege");
      return body.antraege.map((dto) => toVorgang<T>(dto));
    },

    async einreichen(vorgang) {
      // status/id gehören ans DTO, nicht in die opake Nutzlast → aus dem Rumpf herauslösen.
      const { id: _id, status: _status, ...rumpf } = vorgang;
      const payload: AntragEinreichenRequestDto = {
        procedureId: opts.procedureId,
        procedureVersion: opts.procedureVersion,
        // Der ganze fachliche Rumpf reist als opake data — der Server bewahrt ihn unverändert auf.
        data: rumpf as unknown as Record<string, unknown>,
      };
      const dto = await request<AntragDto>("/api/buerger/antraege", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // Die kanonische Fassung: der Server hat id (caseId) + Zeit vergeben und den Zustand gesetzt.
      return toVorgang<T>(dto);
    },
  };
}
