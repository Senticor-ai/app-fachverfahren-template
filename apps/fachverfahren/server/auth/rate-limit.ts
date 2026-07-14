// rate-limit — Drossel-INTERFACE mit In-Memory-Default (Fixed Window). Gilt für
// Registrierung, Login und Passwort-Wechsel (Schlüssel pro Quelle/Aktion).
//
// GRENZEN des Defaults, bewusst dokumentiert: der Zähler lebt im Prozess — bei mehreren
// App-Instanzen drosselt jede für sich (Startup-Warnung in index.ts, wenn Registrierung
// offen ist). Die Quell-IP (`request.ip`) ist nur hinter einem EXPLIZIT konfigurierten
// Trusted Proxy (Fastify `trustProxy`) die Client-IP — sonst die Socket-IP. Verteiltes
// Rate-Limiting (Redis o.ä.) implementiert dieses Interface, ohne Routen anzufassen.
export interface RateLimiter {
  /** true = zulassen; false = drosseln (Route antwortet 429). */
  allow(key: string): boolean;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export function createInMemoryRateLimiter(
  options: RateLimitOptions,
): RateLimiter {
  const windows = new Map<string, { count: number; startedAt: number }>();
  return {
    allow(key: string): boolean {
      const now = Date.now();
      const entry = windows.get(key);
      if (!entry || now - entry.startedAt >= options.windowMs) {
        windows.set(key, { count: 1, startedAt: now });
        return true;
      }
      entry.count += 1;
      return entry.count <= options.limit;
    },
  };
}
