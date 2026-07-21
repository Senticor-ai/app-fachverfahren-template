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
  NachweisDownloadDto,
  NachweisListDto,
  NachweisRefDto,
  VerwaltungsaktDto,
  WiderspruchDto,
} from "@senticor/app-bff-contracts";
import type { Vorgang, VorgangPersistence } from "@senticor/fachverfahren-kit";
import { apiPath, CaseRequestError } from "./case-client.js";

export type {
  NachweisDownloadDto,
  NachweisRefDto,
  VerwaltungsaktDto,
  WiderspruchDto,
};

/** Die eigenen Nachweise eines Antrags auflisten (nur Metadaten). */
export async function ladeNachweise(
  antragId: string,
): Promise<NachweisRefDto[]> {
  const body = await request<NachweisListDto>(
    `/api/buerger/antraege/${encodeURIComponent(antragId)}/nachweise`,
  );
  return body.nachweise;
}

/** Einen Nachweis (base64-kodiert) zum eigenen Antrag hochladen. */
export async function nachweisHochladen(
  antragId: string,
  datei: { fileName: string; mimeType: string; contentBase64: string },
): Promise<NachweisRefDto> {
  return request<NachweisRefDto>(
    `/api/buerger/antraege/${encodeURIComponent(antragId)}/nachweise`,
    { method: "POST", body: JSON.stringify(datei) },
  );
}

/** Einen eigenen Nachweis herunterladen (Metadaten + base64-Inhalt). */
export async function nachweisHerunterladen(
  antragId: string,
  attachmentId: string,
): Promise<NachweisDownloadDto> {
  return request<NachweisDownloadDto>(
    `/api/buerger/antraege/${encodeURIComponent(antragId)}/nachweise/${encodeURIComponent(attachmentId)}`,
  );
}

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

/**
 * Lädt den EINGEFRORENEN Bescheid des eigenen Antrags (owner-scoped, server-seitig). Der Abruf ist
 * bekanntgabe-relevant — der Server auditiert ihn als `case.disclosed`. Liefert `null`, wenn noch kein
 * Bescheid erlassen wurde (404) oder der Antrag fremd/nicht vorhanden ist (404, kein Existenz-Orakel).
 */
export async function ladeBescheid(
  antragId: string,
): Promise<VerwaltungsaktDto | null> {
  try {
    return await request<VerwaltungsaktDto>(
      `/api/buerger/antraege/${encodeURIComponent(antragId)}/bescheid`,
    );
  } catch (fehler) {
    if (fehler instanceof CaseRequestError && fehler.status === 404)
      return null;
    throw fehler;
  }
}

/** Die owner-scoped Download-URL des AMTLICHEN Bescheid-PDF (server-generiert, hash-beweisbar). Nutzt dasselbe
 *  BASE_URL-Präfix wie alle API-Aufrufe; als `href` eines Download-Links verwendbar (Session-Cookie trägt die Auth). */
export function bescheidPdfUrl(antragId: string): string {
  return apiPath(
    `/api/buerger/antraege/${encodeURIComponent(antragId)}/bescheid.pdf`,
  );
}

/**
 * Legt einen Rechtsbehelf (Widerspruch/Einspruch/Klage) gegen den eigenen Bescheid ein — die
 * Rechtsbehelfs-HANDLUNG zur Belehrung. Der Server setzt einen erlassenen Bescheid voraus (404) und lässt
 * den Rechtsbehelf nur EINMAL zu (409). Wirft `CaseRequestError` mit dem Status, damit die UI „bereits
 * eingelegt" (409) von „kein Bescheid/fremd" (404) unterscheiden kann.
 */
export async function legeWiderspruchEin(
  antragId: string,
  begruendung?: string,
): Promise<WiderspruchDto> {
  return request<WiderspruchDto>(
    `/api/buerger/antraege/${encodeURIComponent(antragId)}/widerspruch`,
    {
      method: "POST",
      body: JSON.stringify(begruendung !== undefined ? { begruendung } : {}),
    },
  );
}

/** AntragDto → Vorgang: id/status von oben, der Rest aus der opaken `data`-Nutzlast. DEFENSIV gegen
 *  partielle/fremd-erzeugte `data`: `history`/`nachweise` MÜSSEN Arrays sein (die Bausteine iterieren
 *  sie) — ein fehlendes Feld darf die Bürger-Sicht nicht crashen. */
function toVorgang<T>(dto: AntragDto): Vorgang<T> {
  const rumpf = dto.data as unknown as VorgangRumpf<T>;
  return {
    ...rumpf,
    id: dto.antragId,
    status: dto.state,
    history: Array.isArray(rumpf.history) ? rumpf.history : [],
    nachweise: Array.isArray(rumpf.nachweise) ? rumpf.nachweise : [],
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
