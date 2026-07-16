// vorgang-client — production VorgangPort against /api/v1/cases*.
import type { Vorgang, VorgangPort } from "@senticor/fachverfahren-kit";

async function api<T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createVorgangClient(): VorgangPort {
  return {
    async list(query) {
      const params = new URLSearchParams();
      for (const s of query?.states ?? []) params.append("state", s);
      if (query?.search) params.set("search", query.search);
      if (query?.cursor) params.set("cursor", query.cursor);
      if (query?.limit) params.set("limit", String(query.limit));
      const qs = params.toString();
      const data = await api<{ items: Vorgang[] }>(
        `/api/v1/cases${qs ? `?${qs}` : ""}`,
      );
      return data.items;
    },
    async get(id) {
      try {
        return await api<Vorgang>(`/api/v1/cases/${encodeURIComponent(id)}`);
      } catch (err) {
        if (
          err instanceof Error &&
          /nicht gefunden|Not Found/i.test(err.message)
        ) {
          return undefined;
        }
        throw err;
      }
    },
    async einreichen(antragsdaten, erbrachteNachweise, opts) {
      const attachmentIds = Object.values(erbrachteNachweise ?? {})
        .map((v) => v?.attachmentId)
        .filter((id): id is string => Boolean(id));
      return api<Vorgang>("/api/v1/cases", {
        method: "POST",
        body: JSON.stringify({
          antragsdaten,
          ...(attachmentIds.length ? { attachmentIds } : {}),
        }),
        ...(opts?.idempotencyKey
          ? { idempotencyKey: opts.idempotencyKey }
          : {}),
      });
    },
    async uebergang(id, eventName, rolle, detail, _akteur, opts) {
      return api<Vorgang>(
        `/api/v1/cases/${encodeURIComponent(id)}/transitions`,
        {
          method: "POST",
          body: JSON.stringify({
            eventName,
            rolle,
            ...(detail !== undefined ? { detail } : {}),
            ...(opts?.expectedVersion !== undefined
              ? { expectedVersion: opts.expectedVersion }
              : {}),
          }),
          ...(opts?.idempotencyKey
            ? { idempotencyKey: opts.idempotencyKey }
            : {}),
        },
      );
    },
  };
}
