// Notification-Client-Adapter (#18b-3) — die PROD-Naht der Meldungen. Ist eine API-Basis konfiguriert
// (`VITE_API_BASE_URL`, dieselbe Naht wie der Workspace-Store), zeigt die App die vom Notification-Projektor
// (2. Fan-out-Backend) PERSISTIERTEN Meldungen über `/api/notifications` — sonst (DEV) bleibt die aus dem
// Aufgabenbestand abgeleitete Anzeige (byte-stabil). Reiner Fetch-Adapter + kleiner Hook; die Anzeige bleibt das
// generische `NotificationCenter`.
import { useEffect, useState } from "react";
import type {
  Benachrichtigung,
  BenachrichtigungTyp,
} from "@senticor/fachverfahren-kit";
import { apiBaseUrl, devHeaders } from "./store.js";

/** True ⇒ die App bezieht die Meldungen persistiert über die API (PROD). False ⇒ abgeleitet (DEV). */
export const notificationsUeberApi = Boolean(apiBaseUrl);

/** Die für den Client relevante Form einer `AppNotification` (Server-Typ NICHT importiert — hielte das app-store-
 *  Node-Paket aus dem Client-Bundle). */
export interface ApiNotification {
  notificationId: string;
  title: string;
  body: string;
  eventType: string;
  read: boolean;
  createdAt: string;
}

/** event_type → Ton der Meldung (Farbe + Icon; nie nur Farbe). */
export function typFuerEvent(eventType: string): BenachrichtigungTyp {
  if (eventType === "task.frist-erreicht") return "warn";
  return "info";
}

/** Reine Abbildung Server-Meldung → Anzeige-Benachrichtigung (testbar ohne Netz). */
export function mapNotification(n: ApiNotification): Benachrichtigung {
  return {
    id: n.notificationId,
    titel: n.title,
    text: n.body,
    typ: typFuerEvent(n.eventType),
    gelesen: n.read,
    zeitIso: n.createdAt,
  };
}

function fetchInit(): RequestInit {
  return {
    ...(devHeaders ? { headers: devHeaders } : {}),
    ...(apiBaseUrl && !devHeaders ? { credentials: "include" as const } : {}),
  };
}

/** GET /api/notifications → gemappte Meldungen. `fetchFn`/`base` sind für Tests injizierbar; ohne API-Basis []. */
export async function ladeBenachrichtigungen(
  opts: { fetchFn?: typeof fetch; base?: string; init?: RequestInit } = {},
): Promise<Benachrichtigung[]> {
  const base = opts.base ?? apiBaseUrl;
  if (base === undefined) return [];
  const f = opts.fetchFn ?? fetch;
  const res = await f(`${base}/api/notifications`, {
    ...(opts.init ?? fetchInit()),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { notifications?: ApiNotification[] };
  return (body.notifications ?? []).map(mapNotification);
}

/** POST /api/notifications/:id/read. Best-effort (der optimistische Client-Zustand ist bereits gesetzt). */
export async function markiereGelesenApi(
  id: string,
  opts: { fetchFn?: typeof fetch; base?: string; init?: RequestInit } = {},
): Promise<void> {
  const base = opts.base ?? apiBaseUrl;
  if (base === undefined) return;
  const f = opts.fetchFn ?? fetch;
  await f(`${base}/api/notifications/${encodeURIComponent(id)}/read`, {
    ...(opts.init ?? fetchInit()),
    method: "POST",
  });
}

/** React-Hook: lädt die persistierten Meldungen (nur wenn API konfiguriert) + optimistisches Gelesen-Markieren. */
export function usePersistierteBenachrichtigungen(): {
  benachrichtigungen: Benachrichtigung[];
  markiere: (id: string) => void;
  markiereAlle: () => void;
} {
  const [items, setItems] = useState<Benachrichtigung[]>([]);
  useEffect(() => {
    if (!notificationsUeberApi) return;
    let abgebrochen = false;
    void ladeBenachrichtigungen()
      .then((b) => {
        if (!abgebrochen) setItems(b);
      })
      .catch(() => {
        /* Anzeige bleibt leer statt zu werfen — die App muss ohne Meldungen laufen. */
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  const markiere = (id: string): void => {
    setItems((s) => s.map((b) => (b.id === id ? { ...b, gelesen: true } : b)));
    void markiereGelesenApi(id).catch(() => {});
  };
  const markiereAlle = (): void => {
    const ungelesen = items.filter((b) => !b.gelesen).map((b) => b.id);
    setItems((s) => s.map((b) => ({ ...b, gelesen: true })));
    for (const id of ungelesen) void markiereGelesenApi(id).catch(() => {});
  };
  return { benachrichtigungen: items, markiere, markiereAlle };
}
