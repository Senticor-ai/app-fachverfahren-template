/** Headless Fachverfahren domain types — no React, Zustand, Fastify, or DB. */

export interface VorgangHistorie {
  ts: string;
  aktion: string;
  rolle: string;
  akteur?: string;
  detail?: string;
}

export interface KiEinschaetzung {
  confidence: number;
  flags: string[];
  begruendung?: string;
}

export interface Berechnung {
  betrag: number;
  einheit: string;
  label: string;
  begruendung: string;
  begruendungBuerger?: string;
  begruendungRecht?: string;
  status: "provisional" | "final";
  positionen: { label: string; betrag: number; norm?: string }[];
  herkunft?: "deterministisch" | "ki";
}

export type NachweisBezugsweg = "upload" | "register-once-only" | "gefordert";

export interface NachweisRegister {
  quelle: string;
  richtung: "inbound";
  rechtsgrundlage: string;
  einwilligung?: { erforderlich: boolean; text: string };
  status?: "nicht-abgerufen" | "autorisiert" | "abgerufen";
}

export interface Nachweis {
  id: string;
  label: string;
  hochgeladen?: boolean;
  erforderlich?: boolean;
  akzeptierteTypen?: string[];
  maxGroesseBytes?: number;
  bezugsweg?: NachweisBezugsweg;
  register?: NachweisRegister;
  datei?: { name: string; groesse: number };
  /** Bound attachment id after server upload (metadata only; bytes live elsewhere). */
  attachmentId?: string;
}

export interface Vorgang<TAntragsdaten = Record<string, unknown>> {
  id: string;
  vorgangsnummer: string;
  eingangIso: string;
  antragsdaten: TAntragsdaten;
  status: string;
  berechnung?: Berechnung;
  ki: KiEinschaetzung;
  nachweise: Nachweis[];
  history: VorgangHistorie[];
  /** Optimistic concurrency token once persisted. */
  version?: number;
  payloadVersion?: string;
  configVersion?: string;
}

export type StatusTone = "neu" | "info" | "warn" | "ok" | "block";

export interface StatusDef {
  key: string;
  label: string;
  tone: StatusTone;
  terminal?: boolean;
}

export interface Transition {
  from: string;
  to: string;
  label: string;
  rollen: string[];
  vierAugen?: boolean;
  detailPflicht?: boolean;
  /** Stable command name for APIs; defaults to `${from}->${to}` when omitted. */
  eventName?: string;
}

export interface StatusMachine {
  initial: string;
  states: StatusDef[];
  transitions: Transition[];
}

/**
 * Minimal config surface CaseService needs.
 * Full LeistungConfig stays in the kit; the app maps it into this shape.
 */
export interface CaseDomainConfig<TAntragsdaten = Record<string, unknown>> {
  id: string;
  /** Identifies which LeistungConfig/calculation rules produced the case. */
  configVersion: string;
  /** Schema version for persisted antragsdaten/berechnung payload. */
  payloadVersion: string;
  statusMachine: StatusMachine;
  berechne?: (antragsdaten: TAntragsdaten) => Berechnung;
  nachweise?: (antragsdaten: TAntragsdaten) => Nachweis[];
}

export const DEFAULT_PAYLOAD_VERSION = "1";
export const DEFAULT_CONFIG_VERSION = "1";
