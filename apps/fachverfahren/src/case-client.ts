// case-client — die produktive `CasePort`-Implementierung gegen die Fall/Dossier-BFF-Routen
// (/api/cases*). DIESELBE Konvention wie board-client: Session-Cookie (credentials: "include")
// + BASE_URL-Präfix (die App wird ggf. hinter einem Preview-Proxy unter einem Präfix
// ausgeliefert — root-absolute Pfade gingen daran vorbei). Rein lesend; Schreibpfade folgen bei
// Bedarf. Die Server-Topologie (tenant/authority/jurisdiction) bleibt bewusst verborgen — sie
// kommt IMMER aus der Sitzung, nie aus dem Client.

/** Fall/Dossier-Zusammenfassung — 1:1 zur BFF-`CaseDto`. */
export interface CaseSummary {
  caseId: string;
  procedureId: string;
  procedureVersion: string;
  state: string;
  version: number;
  subjectIds: string[];
  openedAt: string;
  closedAt: string | null;
}

/** Lebenszyklus einer Aufgabe (fester Server-Vertrag). */
export type CaseTaskState = "open" | "claimed" | "completed" | "cancelled";

/** Aufgabe/Ziel/Schritt/Termin einer Akte — 1:1 zur BFF-`TaskDto`. `taskKind` ist frei
 *  (dossier-/verfahrensdefiniert: aufgabe|ziel|checkliste-item|termin), `data` frei-formig. */
export interface CaseTask {
  taskId: string;
  caseId: string;
  title: string;
  state: CaseTaskState;
  assignedTo: string | null;
  dueAt: string | null;
  taskKind: string;
  parentTaskId: string | null;
  data: Record<string, unknown>;
  sortRank: string;
  version: number;
}

/** Fortschritt je Ziel — 1:1 zur BFF-`ProgressDto`-Zeile (compute-on-read aus den Schritten). */
export interface CaseZielFortschritt {
  taskId: string;
  title: string;
  total: number;
  done: number;
  percent: number;
}

export interface CaseListQuery {
  state?: string;
  procedureId?: string;
  limit?: number;
}

export interface TaskListQuery {
  taskKind?: string;
  parentTaskId?: string;
  limit?: number;
}

/** Die Fall/Dossier-Naht der App (HTTP gegen die BFF-Routen). Dieselbe Rolle wie `BoardPort`
 *  für die Boards: die Sichten sprechen NUR diese Schnittstelle, nie `fetch` direkt. */
export interface CasePort {
  listCases(query?: CaseListQuery): Promise<CaseSummary[]>;
  getCase(caseId: string): Promise<CaseSummary | undefined>;
  listTasks(caseId: string, query?: TaskListQuery): Promise<CaseTask[]>;
  getProgress(caseId: string): Promise<CaseZielFortschritt[]>;
}

/** Nicht-OK-Antworten mit Status — `getCase` unterscheidet damit 404 (Akte existiert nicht bzw.
 *  Fremd-Behörde) von 401/5xx/Netzfehlern, die NICHT als „nicht gefunden" maskiert werden dürfen. */
export class CaseRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CaseRequestError";
  }
}

// Die App wird ggf. unter einem Präfix ausgeliefert (APP_PREVIEW_BASE → Vite-Base, siehe
// main.tsx). Root-absolute Pfade würden hinter einem einbettenden Proxy am Präfix vorbeigehen —
// deshalb werden ALLE API-Aufrufe mit der aufgelösten Base präfixiert (Standalone: BASE_URL = "/").
const API_BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

export function apiPath(path: string): string {
  return `${API_BASE}${path}`;
}

/** Definierte Query-Parameter serialisieren (undefined wird weggelassen). */
function queryString(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(apiPath(path), {
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new CaseRequestError(
      response.status,
      `request to ${path} failed (${response.status}): ${text}`,
    );
  }
  // Nicht-JSON trotz 2xx = die Antwort kam NICHT von der Runtime (SPA-Fallback ohne Dev-Proxy).
  // Ein diagnostizierbarer Fehler statt einer nackten SyntaxError aus response.json().
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new CaseRequestError(
      response.status,
      `request to ${path} returned "${contentType || "unknown"}" instead of JSON — is the API server running (dev proxy target)?`,
    );
  }
  return (await response.json()) as T;
}

export function createHttpCasePort(): CasePort {
  return {
    async listCases(query) {
      const qs = queryString({
        state: query?.state,
        procedureId: query?.procedureId,
        limit: query?.limit,
      });
      const body = await request<{ cases: CaseSummary[] }>(`/api/cases${qs}`);
      return body.cases;
    },

    async getCase(caseId) {
      try {
        return await request<CaseSummary>(
          `/api/cases/${encodeURIComponent(caseId)}`,
        );
      } catch (error) {
        // NUR 404 heißt „Akte existiert nicht" (bzw. Fremd-Behörde) — 401/5xx/Netzfehler müssen
        // propagieren, damit die UI einen Fehler-/Re-Login-Zustand statt „nicht gefunden" zeigt.
        if (error instanceof CaseRequestError && error.status === 404) {
          return undefined;
        }
        throw error;
      }
    },

    async listTasks(caseId, query) {
      const qs = queryString({
        taskKind: query?.taskKind,
        parentTaskId: query?.parentTaskId,
        limit: query?.limit,
      });
      const body = await request<{ tasks: CaseTask[] }>(
        `/api/cases/${encodeURIComponent(caseId)}/tasks${qs}`,
      );
      return body.tasks;
    },

    async getProgress(caseId) {
      const body = await request<{ ziele: CaseZielFortschritt[] }>(
        `/api/cases/${encodeURIComponent(caseId)}/progress`,
      );
      return body.ziele;
    },
  };
}
