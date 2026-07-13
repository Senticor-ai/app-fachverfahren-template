# Drittanbieter-Hinweise (Third-Party Notices)

Dieses Werk steht unter der **EUPL-1.2** (siehe [`LICENSE`](LICENSE), Copyright © 2024–2026
Senticor GmbH). Es nutzt und verteilt die unten genannten Open-Source-Komponenten unter deren
jeweils eigenen Lizenzen. Diese Datei erfüllt die Attributionspflicht (EUPL-1.2 Art. 5 sowie die
Copyright-/Lizenz-Hinweispflichten von MIT/ISC/BSD/Apache-2.0/EPL-2.0) und ist besonders für
gebündelte Build-Artefakte (Docker-Image, App-Bundle) relevant, in denen die `node_modules`-
Lizenzdateien nicht mitlaufen.

Die **vollständige** Liste aller mit-distribuierten Abhängigkeiten und ihrer Lizenzen lässt sich
jederzeit reproduzieren mit:

```
pnpm licenses list --prod
```

Auswertung des Produktions-Baums zum Release-Zeitpunkt: ausschließlich permissive bzw. datei-/
modulweise reziproke Lizenzen — **kein** starkes Copyleft (kein GPL/AGPL/LGPL/SSPL/BUSL/CDDL),
keine proprietären Pakete. Damit besteht kein Distributionskonflikt mit der EUPL-1.2.

## Adaptierte UI-Primitive

Das Verzeichnis [`packages/fachverfahren-kit/src/ui/`](packages/fachverfahren-kit/src/ui/) enthält
nach dem Copy-&-Adapt-Modell von **shadcn/ui** übernommene und angepasste Komponenten.

- **shadcn/ui** — MIT License — Copyright © 2023 shadcn. Aufgesetzt auf Radix UI + Tailwind CSS;
  einzelne Komponenten kapseln Sonner (`sonner.tsx`) bzw. @tanstack/react-table (`data-table.tsx`).

## Gebündelte Abhängigkeiten nach Lizenz

### MIT License

- **React**, **React-DOM** — © Meta Platforms, Inc. und Mitwirkende
- **Radix UI** (`@radix-ui/react-*`) — © WorkOS / Radix
- **@tanstack/react-table** — © Tanner Linsley
- **recharts** — © recharts group
- **mermaid** — © Knut Sveidqvist und Mitwirkende
- **sonner** — © Emil Kowalski
- **react-markdown**, **remark-gfm**, **rehype-highlight** — © Espen Hovlandsdal / Titus Wormer
- **isomorphic-dompurify** — © Kirill Motkov
- **tailwindcss**, **tailwind-merge**, **clsx**, **tw-animate-css** — jeweilige Autoren (s. Paket)
- **khroma** — MIT (laut mitgelieferter Lizenzdatei; das `package.json` führt kein `license`-Feld,
  daher meldet `pnpm` „Unknown" — es ist MIT © 2019–present Fabio Spampinato, Andrew Maney)
- **date-fns**, **zustand**, **react-day-picker**, **react-resizable-panels** — jeweilige Autoren

### ISC License

- **lucide-react** — © Lucide-Mitwirkende (Eric Fennis)

### Apache License 2.0

- **class-variance-authority** — © Joe Bell

### BSD-3-Clause License

- **highlight.js** — © Ivan Sagalaev und Mitwirkende

### Eclipse Public License 2.0 (EPL-2.0)

- **elkjs** — © Kiel University / Eclipse Foundation. Transitiv über `@mermaid-js/layout-elk`
  bzw. `mermaid`. Wird als **unverändertes, separat lizenziertes** npm-Modul eingebunden (kein
  Source-Merge in EUPL-lizenzierte Dateien); EPL-2.0-Komponenten sind dynamische Dependencies und
  keine Derivative Works des EUPL-Werks. Bei etwaigem Vendoring/Patchen von elkjs müsste der
  Quellcode der geänderten EPL-Dateien unter EPL-2.0 angeboten werden.

### Dual-lizenziert

- **dompurify** — `(MPL-2.0 OR Apache-2.0)`; hier wird die **Apache-2.0**-Option gewählt (voll
  EUPL-1.2-kompatibel). © Dr.-Ing. Mario Heiderich, Cure53. Transitiv über `isomorphic-dompurify`.

## Schriften

„Inter" wird ausschließlich als CSS-`font-family`-Name mit System-Fallbacks referenziert; es wird
**keine** Schriftdatei mitgeliefert.
