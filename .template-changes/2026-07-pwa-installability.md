bump: patch
updateMode: review
migration: none

# PWA-Installierbarkeit

- ergänzt installierbare PWA-Metadaten für iOS, Android und Desktop im App-Shell-HTML
- ergänzt PNG-Icons, maskable Icons und Apple-Touch-Icon als generische Template-Assets
- erweitert den Web-Delivery-Check um Manifest-, Icon- und Mobile-Web-App-Pflichtkriterien
- ergänzt `check:pwa` und `check:pwa-runtime` für einen Fastify-Smoke-Test gegen die gebaute PWA-Auslieferung
- ergänzt `check:pwa:browser` für Service-Worker-Registration, kontrollierten Reload, Asset-Cache-Grenzen, Headless-Chrome-Screenshots mit PNG-Inhaltsprüfung, Viewport-Prüfung, 400%-Reflow, Dark-/High-Contrast-Tokenvarianten, WCAG-Textkontrast, BITV-Basischecks und Tab-Fokus-Smoke auf iPhone, iPad und Desktop
- erlaubt Style-Elemente explizit in der CSP, während Inline-Skripte weiter blockiert bleiben
- hält die Änderung migrationsfrei, weil bestehende Konsumenten nur aktualisierte statische Assets und Metadaten erhalten
