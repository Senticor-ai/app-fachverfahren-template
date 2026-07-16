import type { CaseDomainConfig } from "@senticor/fachverfahren-domain";
import {
  DEFAULT_CONFIG_VERSION,
  DEFAULT_PAYLOAD_VERSION,
} from "@senticor/fachverfahren-domain";

/**
 * Server-side CaseDomainConfig for the demo Naht.
 * Mirrors apps/fachverfahren/src/leistung.config.ts statusMachine + berechne.
 * Generated apps must keep this in sync with the Naht (or emit it).
 */
export function createDefaultDomainConfig(): CaseDomainConfig {
  const DEMO_TARIF: Record<string, number> = {
    standard: 50,
    express: 90,
    gebuehrenfrei: 0,
  };
  return {
    id: "musterantrag",
    configVersion: DEFAULT_CONFIG_VERSION,
    payloadVersion: DEFAULT_PAYLOAD_VERSION,
    statusMachine: {
      initial: "eingegangen",
      states: [
        { key: "eingegangen", label: "Eingegangen", tone: "neu" },
        { key: "in_pruefung", label: "In Prüfung", tone: "info" },
        { key: "review_noetig", label: "Review nötig", tone: "warn" },
        {
          key: "festgesetzt",
          label: "Festgesetzt",
          tone: "ok",
          terminal: true,
        },
        { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "in_pruefung",
          label: "In Prüfung nehmen",
          rollen: ["sachbearbeitung"],
          eventName: "start-pruefung",
        },
        {
          from: "in_pruefung",
          to: "review_noetig",
          label: "Zur Zweitprüfung",
          rollen: ["sachbearbeitung"],
          eventName: "zur-zweitpruefung",
        },
        {
          from: "in_pruefung",
          to: "festgesetzt",
          label: "Festsetzen",
          rollen: ["sachbearbeitung"],
          vierAugen: true,
          eventName: "festsetzen",
        },
        {
          from: "review_noetig",
          to: "festgesetzt",
          label: "Festsetzen (Zweitfreigabe)",
          rollen: ["sachbearbeitung"],
          vierAugen: true,
          eventName: "festsetzen-zweit",
        },
        {
          from: "in_pruefung",
          to: "abgelehnt",
          label: "Ablehnen",
          rollen: ["sachbearbeitung"],
          detailPflicht: true,
          eventName: "ablehnen",
        },
      ],
    },
    berechne: (antragsdaten) => {
      const anliegen = antragsdaten["anliegen"] as
        { kategorie?: string } | undefined;
      const kat = anliegen?.kategorie ?? "";
      const bekannt = Object.prototype.hasOwnProperty.call(DEMO_TARIF, kat);
      const betrag = DEMO_TARIF[kat] ?? 0;
      const label = bekannt
        ? `Bearbeitungsgebühr (${kat})`
        : "Bearbeitungsgebühr";
      return {
        betrag,
        einheit: "EUR",
        label,
        begruendung: bekannt
          ? `Pauschale Bearbeitungsgebühr für die Kategorie „${kat}" — Demo-Tarif.`
          : "Bitte eine Kategorie wählen, um die Gebühr zu bestimmen.",
        status: bekannt ? "final" : "provisional",
        positionen: [{ label, betrag }],
      };
    },
  };
}

export function resolveAppDomainConfig(leistungId: string): CaseDomainConfig {
  const config = createDefaultDomainConfig();
  if (leistungId !== config.id) {
    throw new Error(`Unbekannte Leistung: ${leistungId}`);
  }
  return config;
}
