// verfahren-wissen-client — die HTTP-Naht des VERFAHRENS-WIKIS gegen /api/verfahren/:procedureId/:version/wissen.
// DIESELBE Konvention wie case-/antrag-client (Session-Cookie, BASE_URL-Präfix, DTOs aus @senticor/app-bff-
// contracts — nicht dupliziert). Behörden-Scope kommt server-seitig aus der Sitzung.
import type {
  KiWissenRequestDto,
  WissenEintragRequestDto,
  WissenReviewRequestDto,
  WissenViewDto,
  WissenViewListDto,
} from "@senticor/app-bff-contracts";
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
      `Verfahrens-Wiki ${path} fehlgeschlagen (${response.status}): ${text}`,
    );
  }
  return (await response.json()) as T;
}

function basis(procedureId: string, version: string): string {
  return `/api/verfahren/${encodeURIComponent(procedureId)}/${encodeURIComponent(version)}/wissen`;
}

/** Das Wissen eines Verfahrens lesen (behörden-scoped, chronologisch). */
export async function ladeVerfahrenWissen(
  procedureId: string,
  version: string,
): Promise<WissenViewDto[]> {
  const body = await request<WissenViewListDto>(basis(procedureId, version));
  return body.eintraege;
}

/** Einen menschlichen Wissens-Eintrag schreiben. */
export async function schreibeVerfahrenWissen(
  procedureId: string,
  version: string,
  eintrag: WissenEintragRequestDto,
): Promise<WissenViewDto> {
  return request<WissenViewDto>(basis(procedureId, version), {
    method: "POST",
    body: JSON.stringify(eintrag),
  });
}

/** Einen KI-Wissens-Eintrag anfordern (die KI liest das bisherige Wiki als Kontext). */
export async function kiVerfahrenWissen(
  procedureId: string,
  version: string,
  eintrag: KiWissenRequestDto,
): Promise<WissenViewDto> {
  return request<WissenViewDto>(`${basis(procedureId, version)}/ki`, {
    method: "POST",
    body: JSON.stringify(eintrag),
  });
}

/** Einen KI-Wissens-Entwurf prüfen (bestätigen/verwerfen) — schließt den HITL-Kreis verfahrens-weit. */
export async function pruefeVerfahrenWissen(
  procedureId: string,
  version: string,
  eintragId: string,
  review: WissenReviewRequestDto,
): Promise<WissenViewDto> {
  return request<WissenViewDto>(
    `${basis(procedureId, version)}/${encodeURIComponent(eintragId)}/review`,
    { method: "POST", body: JSON.stringify(review) },
  );
}
