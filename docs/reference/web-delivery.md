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
werden nur als Style-Attribute erlaubt, weil React-Komponenten dynamische
Layoutwerte wie Fortschrittsbreiten und Seitenverhaeltnisse setzen.

## Service Worker und PWA

`APP_ENABLE_SERVICE_WORKER=false` ist der Default. Der Worker wird erst
registriert, wenn `/runtime-config.json` ihn explizit aktiviert.

Der Standard-Worker darf nur gleiche-Origin-Assets unter `/assets/` mit
Content-Hash cachen. Navigationen, APIs, `/runtime-config.json`,
`/internal/*`, Auth-/Sitzungsdaten und Nutzerdokumente werden nie ueber den
Worker gecacht.

## Standards Assets

Jede App liefert:

- `robots.txt` mit `Disallow: /`
- `manifest.webmanifest`
- `favicon.svg` und App-Icon
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
