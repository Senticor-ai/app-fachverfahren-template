/*
 * service-worker.js — einfacher, offline-faehiger App-Shell-Worker (Cache-First) fuer das Fachverfahren.
 *
 * Bewusst dep-frei und minimal: KEIN Workbox, kein Build-Schritt — eine statische Datei, die unveraendert
 * ausgeliefert wird. Strategie:
 *   - install:  App-Shell vorab in einen versionierten Cache legen (Offline-Grundgeruest).
 *   - activate: alle alten Cache-Versionen aufraeumen (nur der aktuelle CACHE_NAME ueberlebt).
 *   - fetch:    nur GET; Navigationen (HTML) network-first mit Offline-Fallback auf die App-Shell,
 *               statische Assets cache-first mit Hintergrund-Nachladen in den Cache.
 *
 * Versionierung: CACHE_VERSION bei jedem Shell-Update erhoehen, damit alte Caches sicher verworfen werden.
 */

// Bei jeder Aenderung an der App-Shell erhoehen — erzwingt das Verwerfen veralteter Caches.
const CACHE_VERSION = "v1";
const CACHE_NAME = `fv-app-shell-${CACHE_VERSION}`;

// Die minimale App-Shell. Die gehashten Build-Assets (JS/CSS) werden zur Laufzeit beim ersten Abruf
// nachgecacht — hier stehen nur die stabilen Einstiegs-Ressourcen.
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  // Neuen Worker sofort aktiv werden lassen, sobald die Shell im Cache liegt.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      // Fehlt eine Shell-Ressource (z. B. abweichender Build), darf die Installation nicht hart scheitern.
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Alte Cache-Versionen entfernen und sofort die Kontrolle ueber offene Clients uebernehmen.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Nur GET behandeln; POST/PUT etc. (z. B. Antrags-Einreichungen) immer direkt ans Netz.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Fremde Origins (CDN/Dritt-APIs) nicht abfangen — nur die eigene App-Shell wird verwaltet.
  if (url.origin !== self.location.origin) return;

  // Navigationen (Seitenaufrufe) network-first: frische HTML bevorzugen, offline auf die Shell zurueckfallen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response.clone());
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/index.html"))
            .then((cached) => cached || offlineFallback()),
        ),
    );
    return;
  }

  // Statische Assets cache-first: aus dem Cache liefern, sonst aus dem Netz holen und nebenbei cachen.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          cachePut(request, response.clone());
          return response;
        })
        .catch(() => offlineFallback());
    }),
  );
});

/** Eine Antwort defensiv in den App-Shell-Cache legen (nur erfolgreiche Basis-Antworten). */
function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") return;
  caches
    .open(CACHE_NAME)
    .then((cache) => cache.put(request, response))
    .catch(() => {
      /* Cache-Schreibfehler bewusst ignorieren — die Antwort wurde dem Client bereits ausgeliefert. */
    });
}

/** Letzte Rueckfalllinie, falls weder Netz noch Cache eine Antwort liefern. */
function offlineFallback() {
  return new Response("Offline — Inhalt nicht verfuegbar.", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
