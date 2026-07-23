// runtime-config — EIN memoisierter Lader für runtime-config.json (vom app-runtime-fastify aus dem Deploy-Env gebaut).
// Bewusst EINE Quelle: der Service-Worker-Schalter (main.tsx) UND die Zonen-Flächen (app/zone.ts) lesen dieselbe geladene
// Config, statt sie zweimal zu holen. no-store/same-origin wie alle API-Aufrufe; BASE_URL-relativ (hinter dem Vorschau-
// Proxy liegt die Datei unterm Präfix). Fehlt/kaputt ⇒ null ⇒ die App startet ohne sie (die Config ist eine Verbesserung,
// keine Startbedingung).
import { deliveryPath } from "./delivery-path.js";

export interface PublicRuntimeConfig {
  delivery?: { serviceWorkerEnabled?: boolean };
  /** Zonen-Enforcement (BSI-Netzsegmentierung): die Flächen, die DIESE Instanz servieren darf (aus ZONE_SURFACES). */
  zone?: { id?: string; allowedSurfaces?: string[] };
}

let cached: Promise<PublicRuntimeConfig | null> | undefined;

/** Lädt runtime-config.json GENAU EINMAL (memoisiert) und liefert das geparste Objekt (oder null bei Fehler/404). */
export function loadRuntimeConfig(): Promise<PublicRuntimeConfig | null> {
  if (!cached) cached = fetchRuntimeConfig();
  return cached;
}

/** NUR für Tests: den Memo-Cache zurücksetzen (jeder Test startet mit frischem Lade-Zustand). */
export function resetRuntimeConfigCache(): void {
  cached = undefined;
}

async function fetchRuntimeConfig(): Promise<PublicRuntimeConfig | null> {
  try {
    const response = await fetch(deliveryPath("runtime-config.json"), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    return (await response.json()) as PublicRuntimeConfig;
  } catch {
    return null;
  }
}
