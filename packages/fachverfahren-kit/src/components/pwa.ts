// components/pwa — die GENERISCHE, dep-freie PWA-Laufzeit-Hilfe der Bürger-/Fachsicht.
//
// Zwei Aufgaben, beide framework-frei (nur Browser-APIs, kein npm-Paket, kein Domänen-Literal):
//  1) registerServiceWorker(swUrl?) — registriert den App-Shell-Service-Worker defensiv, sobald die Seite
//     geladen ist, und gibt die Registrierung (oder null) zurück. Sicher im SSR/ohne SW-Support/über http.
//  2) isAppInstalled() — kleine Hilfe, die ehrlich meldet, ob die App bereits „installiert"/standalone läuft
//     (display-mode: standalone bzw. iOS `navigator.standalone`). Damit blendet die UI den Install-Hinweis aus.
//
// Bewusst KEINE Abhängigkeit zu Workbox o. Ä.: der eigentliche Cache-First-Worker liegt als statische Datei
// in der App (public/service-worker.js). Diese Datei kennt nur seine URL — Inhalt/Strategie bleibt App-Sache.

/** Standard-Pfad des App-Shell-Workers, relativ zur Origin-Wurzel (App liefert public/service-worker.js). */
const DEFAULT_SW_URL = "/service-worker.js";

/**
 * Registriert den Service-Worker der App-Shell — defensiv und ohne je den Seitenstart zu blockieren.
 *
 * - Tut nichts (und liefert `null`) ohne `window`/`navigator.serviceWorker` (SSR, alte Browser).
 * - Wartet das `load`-Event ab, damit die Registrierung nicht mit dem initialen Laden konkurriert.
 * - Schluckt Fehler bewusst (z. B. unsicherer Kontext/HTTP): die App muss auch ohne SW voll funktionieren.
 *
 * @param swUrl  Abweichender Worker-Pfad (Default: "/service-worker.js").
 * @returns      Die `ServiceWorkerRegistration` bei Erfolg, sonst `null`.
 */
export async function registerServiceWorker(
  swUrl: string = DEFAULT_SW_URL,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;

  // Erst nach `load` registrieren — ist die Seite schon fertig, sofort; sonst einmalig auf das Event warten.
  await waitForWindowLoad();

  try {
    return await navigator.serviceWorker.register(swUrl);
  } catch {
    // Bewusst geschluckt: Registrierung scheitert z. B. im unsicheren Kontext (http) oder bei Datei-Fehlern.
    // Die App bleibt voll bedienbar — Offline-Fähigkeit ist eine Verbesserung, keine Voraussetzung.
    return null;
  }
}

/**
 * Kleine Hilfe: läuft die App bereits „installiert"/im Standalone-Modus?
 *
 * Deckt beide gängigen Wege ab: den Standard `matchMedia("(display-mode: standalone)")` und den
 * iOS-Sonderweg `navigator.standalone`. Defensiv — gibt im SSR/ohne API schlicht `false` zurück.
 * Die UI nutzt das, um den „App installieren"-Hinweis gar nicht erst zu zeigen, wenn er sinnlos ist.
 */
export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) {
      return true;
    }
  } catch {
    // matchMedia kann in Nischen-Umgebungen werfen — dann fällt die Erkennung weich auf den iOS-Pfad zurück.
  }
  // iOS-Safari meldet den Homescreen-Start über das nicht-standardisierte `navigator.standalone`.
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/** Wartet (höchstens einmal) auf das `load`-Event; ist das Dokument schon vollständig, kehrt es sofort zurück. */
function waitForWindowLoad(): Promise<void> {
  if (typeof document !== "undefined" && document.readyState === "complete") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}
