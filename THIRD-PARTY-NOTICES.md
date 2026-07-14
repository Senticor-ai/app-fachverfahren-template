# Drittanbieter-Hinweise (Third-Party Notices)

Dieses Werk steht unter der **EUPL-1.2** (siehe [`LICENSE`](LICENSE), Copyright © 2024–2026
Senticor GmbH). Es nutzt die unten genannten Open-Source-Komponenten unter deren jeweils eigenen
Lizenzen. Maßgeblich bleiben die Lizenz- und Copyright-Dateien der konkreten Paketversionen.

Die **vollständige** Liste aller mit-distribuierten Abhängigkeiten und ihrer Lizenzen lässt sich
jederzeit reproduzieren mit:

```
pnpm licenses list --prod
```

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
  bzw. `mermaid`.

### Dual-lizenziert

- **dompurify** — `(MPL-2.0 OR Apache-2.0)`. © Dr.-Ing. Mario Heiderich, Cure53. Transitiv über
  `isomorphic-dompurify`.

## Schriften

„Inter" wird ausschließlich als CSS-`font-family`-Name mit System-Fallbacks referenziert; es wird
**keine** Schriftdatei mitgeliefert.
