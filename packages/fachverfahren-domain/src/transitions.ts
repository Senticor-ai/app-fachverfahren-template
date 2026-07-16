import type {
  CaseDomainConfig,
  Transition,
  Vorgang,
  VorgangHistorie,
} from "./types.js";

export class DomainRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainRuleError";
  }
}

export function transitionEventName(t: Transition): string {
  return t.eventName ?? `${t.from}->${t.to}`;
}

export function findTransition(
  config: CaseDomainConfig,
  from: string,
  eventNameOrTo: string,
): Transition | undefined {
  return config.statusMachine.transitions.find(
    (t) =>
      t.from === from &&
      (transitionEventName(t) === eventNameOrTo || t.to === eventNameOrTo),
  );
}

export function transitionsFrom(
  config: CaseDomainConfig,
  status: string,
  rolle?: string,
): Transition[] {
  return (config.statusMachine.transitions ?? []).filter(
    (t) => t.from === status && (!rolle || t.rollen.includes(rolle)),
  );
}

/**
 * Four-eyes: a vierAugen transition requires a different actor_id than the
 * most recent history entry that recorded an akteur. Same natural person with
 * multiple roles counts as the same actor. Missing actor identity rejects.
 * Service accounts are rejected unless allowServiceAccounts is true.
 */
export function assertVierAugen(input: {
  transition: Transition;
  history: VorgangHistorie[];
  actorId: string | undefined;
  allowServiceAccounts?: boolean;
}): void {
  const { transition, history, actorId, allowServiceAccounts } = input;
  if (!transition.vierAugen) return;
  if (!actorId) {
    throw new DomainRuleError(
      `Vier-Augen verletzt: „${transition.label}" erfordert eine Akteur-Identität`,
    );
  }
  if (!allowServiceAccounts && actorId.startsWith("service:")) {
    throw new DomainRuleError(
      `Vier-Augen verletzt: Dienstkonten dürfen „${transition.label}" nicht auslösen`,
    );
  }
  const letzter = [...history].reverse().find((h) => h.akteur)?.akteur;
  if (letzter && letzter === actorId) {
    throw new DomainRuleError(
      `Vier-Augen verletzt: „${transition.label}" erfordert eine ANDERE Person als ${actorId} (letzter Akteur der History)`,
    );
  }
}

export interface ApplyTransitionInput {
  config: CaseDomainConfig;
  vorgang: Vorgang;
  /** Transition event name or target state key. */
  eventName: string;
  rolle: string;
  actorId: string;
  detail?: string;
  nowIso: string;
  allowServiceAccounts?: boolean;
}

export interface ApplyTransitionResult {
  next: Vorgang;
  transition: Transition;
  historyEntry: VorgangHistorie;
}

/** Pure transition application — no I/O. CaseService uses this then persists. */
export function applyTransition(
  input: ApplyTransitionInput,
): ApplyTransitionResult {
  const {
    config,
    vorgang,
    eventName,
    rolle,
    actorId,
    detail,
    nowIso,
    allowServiceAccounts,
  } = input;
  const transition = findTransition(config, vorgang.status, eventName);
  if (!transition) {
    throw new DomainRuleError(
      `Übergang von ${vorgang.status} mit „${eventName}" nicht erlaubt`,
    );
  }
  if (!transition.rollen.includes(rolle)) {
    throw new DomainRuleError(
      `Rolle ${rolle} darf ${vorgang.status} → ${transition.to} nicht auslösen`,
    );
  }
  if (transition.detailPflicht && !detail) {
    throw new DomainRuleError(
      `Übergang „${transition.label}" erfordert eine Begründung`,
    );
  }
  assertVierAugen({
    transition,
    history: vorgang.history,
    actorId,
    ...(allowServiceAccounts !== undefined ? { allowServiceAccounts } : {}),
  });
  const historyEntry: VorgangHistorie = {
    ts: nowIso,
    aktion: `${transition.label} (→ ${transition.to})`,
    rolle,
    akteur: actorId,
    ...(detail ? { detail } : {}),
  };
  const next: Vorgang = {
    ...vorgang,
    status: transition.to,
    history: [...vorgang.history, historyEntry],
  };
  return { next, transition, historyEntry };
}
