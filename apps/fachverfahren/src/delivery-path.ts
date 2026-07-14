// Die App wird ggf. unter einem Präfix ausgeliefert (Vite-Base hinter dem Vorschau-Proxy,
// siehe main.tsx/board-client.ts). Root-absolute Pfade gingen am Präfix vorbei — deshalb
// werden Auslieferungs-Artefakte (runtime-config.json, Service-Worker) mit der aufgelösten
// Base präfixiert (Standalone: BASE_URL = "/").
export function deliveryPath(
  path: string,
  base: string = import.meta.env.BASE_URL,
): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
