// fachverfahren-kit — öffentlicher Einstieg. Vertrag + Datenschicht; die fertigen UI-Bausteine (shadcn/Tailwind)
// folgen in ./components und werden hier re-exportiert.
export * from "./types.js";
export * from "./store.js";
export * from "./contract-snapshot.js";

// UI-Bausteine (Tailwind + shadcn/ui OSS) — konsumieren ausschließlich den Vertrag (config/port/vorgang).
export * from "./ui/badge.js";
export * from "./components/AntragStepper.js";
// Arbeitsvorrat re-exportiert selektiv: seine interne `StatusPill`-Variante kollidiert sonst mit dem
// kanonischen `./components/StatusPill.js`-Export (gleicher Name) → ambige Star-Re-Exports.
export { Arbeitsvorrat, type ArbeitsvorratProps } from "./components/Arbeitsvorrat.js";
export * from "./components/AufsichtDashboard.js";
export * from "./components/StatusPill.js";
export * from "./components/KiVorschlag.js";
export * from "./components/EvidenceCard.js";
export * from "./components/PersonaSwitcher.js";
export * from "./components/FachverfahrenShell.js";
export * from "./components/VorgangDetail.js";
export * from "./components/EntscheidungPanel.js";
export * from "./components/ReviewWorkspace.js";
