// DER EINE Austausch-Punkt dieser App.
//
// Diese Datei exportiert die `LeistungConfig`, die das konkrete Fachverfahren definiert
// (Personas, Antragsfelder, Prüfungen, Tarif, Status-Workflow). Die gesamte App rendert
// allein aus dieser Config über die generischen Kit-Bausteine — kein verfahrens-spezifischer
// Code sonst.
//
// DEFAULT: das Hundesteuer-Beispiel — so läuft die Vorlage eigenständig (pnpm dev) und ist
// sofort vorführbar.
//
// GENERIERT: der governte CHOS-Build ÜBERSCHREIBT GENAU DIESE DATEI mit der für das jeweilige
// Verfahren generierten LeistungConfig. Dieselbe App, dieselben Bausteine, anderes Verfahren —
// ohne dass eine weitere Datei der App sich ändert. Das ist die Naht zwischen Generierung und
// laufender App (store.ts importiert nur von hier).
import type { LeistungConfig } from "@senticor/fachverfahren-kit";
import { hundesteuerConfig } from "@senticor/fachverfahren-kit/leistungen/hundesteuer";

export const leistungConfig: LeistungConfig = hundesteuerConfig as unknown as LeistungConfig;
