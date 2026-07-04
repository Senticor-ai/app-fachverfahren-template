# Web-Delivery-Vertrag

Dieser Vertrag gilt fuer generierte Fachverfahren-Webapps, die per CI/CD als
Container in Kubernetes ausgeliefert werden. Edge/CDN-Konfiguration darf diese
Regeln verschaerfen, aber die App-Runtime muss sichere Defaults selbst setzen.

## Cache-Regeln

- `index.html`, SPA-Fallbacks, `/runtime-config.json` und
  `/service-worker.js` senden `Cache-Control: no-store`.
- Vite-Artefakte unter `/assets/` mit Content-Hash senden
  `Cache-Control: public, max-age=31536000, immutable`.
- API-, Auth-, Sitzungs-, Health- und Metrics-Antworten werden nicht im Browser
  gecacht.
- Runtime-Konfiguration bleibt oeffentlich, schema-versioniert und enthaelt
  keine Geheimnisse oder internen Upstreams.

## Security Header

Die Fastify-Runtime setzt standardmaessig:

- `Content-Security-Policy` oder im Rollout `Content-Security-Policy-Report-Only`
- `Strict-Transport-Security` in Produktion
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- restriktive `Permissions-Policy`

Inline-Skripte sind nicht Teil des App-Shell-Vertrags. Der Preview-Reporter
liegt deshalb als externe Datei unter `/preview-reporter.js`. Inline-Styles
werden als Style-Attribute und Style-Elemente erlaubt, weil React-Komponenten
und eingebundene UI-/Visualisierungsbibliotheken dynamische Layoutwerte,
Fortschrittsbreiten, Seitenverhaeltnisse und Laufzeit-Styles setzen.

## Service Worker und PWA

`APP_ENABLE_SERVICE_WORKER=false` ist der Default. Der Worker wird erst
registriert, wenn `/runtime-config.json` ihn explizit aktiviert.

Der Standard-Worker darf nur gleiche-Origin-Assets unter `/assets/` mit
Content-Hash cachen. Navigationen, APIs, `/runtime-config.json`,
`/internal/*`, Auth-/Sitzungsdaten und Nutzerdokumente werden nie ueber den
Worker gecacht.

`pnpm run check:pwa` baut App und Server und prüft die reale Fastify-Auslieferung
mit aktiviertem Service Worker. Der Check validiert SPA-Fallback-Routen,
Runtime-Konfiguration, mobile HTML-Metadaten, Manifest, Icons, Cache-Header und
responsive CSS-Signale wie Safe-Area, Touch-Ziele, Breakpoints und reduzierte
Bewegung.

`pnpm run check:pwa:browser` ergänzt die Prüfung mit Headless Chrome über das
Chrome-DevTools-Protokoll. Der Check öffnet die gebaute Fastify-App in iPhone-,
iPad-, Desktop- und 400%-Reflow-Viewports, prüft sichtbare Hydration,
Konsolenfehler, horizontales Body-Overflow, Zielgrößen, abgeschnittene Controls,
genau ein sichtbares `main`, genau eine sichtbare `h1`,
Überschriften-Sprünge, Formularlabels, benannte Interaktionen, gebrochene
ARIA-Referenzen, sichtbaren Textkontrast nach WCAG-Schwellen, Dark- und
High-Contrast-Tokenvarianten auf Desktop und 400%-Reflow, einen kurzen
Tab-Fokuspfad mit sichtbarem Fokusindikator sowie PNG-Dimensionen und
nicht-leere Screenshot-Renderings. Zusätzlich weist er im Browser nach, dass
Manifest und Runtime-Konfiguration zusammenpassen, der Service Worker aus der
App heraus registriert und nach Reload kontrollierend aktiv ist und nur
hashbasierte `/assets/`-Dateien im `fachverfahren-assets`-Cache landen. Er
schreibt Screenshots und `audit-summary.json` nach
`dist/evidence/pwa-browser/`. Er benötigt Chrome/Chromium oder `CHROME_BIN` und
ist deshalb ein Evidence-Gate, aber nicht Teil des minimalen Release-Gates.

## Standards Assets

Jede App liefert:

- `robots.txt` mit `Disallow: /`
- `manifest.webmanifest` mit `id`, `lang`, `start_url`, `scope`,
  `display=standalone`, PNG-Icons `192x192`/`512x512` und maskable Icon
- `favicon.svg`, App-Icon und `apple-touch-icon.png`
- `/.well-known/security.txt`

Eine Sitemap wird nicht erzeugt, solange transaktionale Fachverfahren nicht
indexierbar sind.

## 12-Factor-Bezug

- Konfiguration kommt aus Environment/ConfigMap/Secret-Referenzen, nicht aus
  gebackenen Dateien.
- Logs laufen strukturiert nach stdout/stderr.
- Container sind immutable; Schreibzugriffe gehen nur nach `/tmp` oder in
  deklarierte Volumes.
- Build, Release und Run bleiben getrennt: Vite/TypeScript bauen Artefakte,
  Runtime-Env aktiviert nur Betriebsoptionen.
