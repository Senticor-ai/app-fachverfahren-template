// fachverfahren-kit/store — DEV/Storybook in-memory adapter for VorgangPort + RegisterLookupPort.
// Production persistence authority is Fastify CaseService; this store is a cache/fixture only.
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  LeistungConfig,
  RegisterLookupPort,
  Transition,
  Vorgang,
  VorgangPort,
} from "./types.js";
import {
  abgeleiteteFelder,
  effektiveBerechnung,
  effektiveNachweise,
} from "./lib/interpreter.js";
import type { Antragsdaten } from "./lib/antrag-felder.js";

let __seq = 0;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

function makeVorgangsnummer(jahr: number): () => string {
  return () => `FV-${jahr}-${pad(++__seq, 4)}`;
}

export interface FachverfahrenStore<T>
  extends VorgangPort<T>, RegisterLookupPort {
  use: UseBoundStore<StoreApi<{ vorgaenge: Vorgang<T>[] }>>;
  config: LeistungConfig<T>;
  transitionsFrom(status: string, rolle?: string): Transition[];
}

export function createFachverfahrenStore<T = Record<string, unknown>>(
  config: LeistungConfig<T>,
  opts: {
    jahr?: number;
    now?: () => string;
    /** Artificial delay to catch sync assumptions in tests (ms). */
    delayMs?: number;
  } = {},
): FachverfahrenStore<T> {
  const jahr = opts.jahr ?? 2026;
  const now = opts.now ?? (() => new Date().toISOString());
  const delayMs = opts.delayMs ?? 0;
  const vorgangsnummer = makeVorgangsnummer(jahr);
  const idempotency = new Map<string, Vorgang<T>>();

  const seed = config.seed?.({ vorgangsnummer }) ?? [];
  const use = create<{ vorgaenge: Vorgang<T>[] }>(() => ({ vorgaenge: seed }));

  const setState = (fn: (s: Vorgang<T>[]) => Vorgang<T>[]) =>
    use.setState((s) => ({ vorgaenge: fn(s.vorgaenge) }));

  const wait = async (): Promise<void> => {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  };

  const transitionsFrom = (status: string, rolle?: string): Transition[] =>
    (config.statusMachine?.transitions ?? []).filter(
      (t) => t.from === status && (!rolle || t.rollen.includes(rolle)),
    );

  const store: FachverfahrenStore<T> = {
    config,
    use,
    transitionsFrom,

    list: async (query) => {
      await wait();
      let rows = use.getState().vorgaenge;
      if (query?.states?.length) {
        rows = rows.filter((v) => query.states!.includes(v.status));
      }
      if (query?.search?.trim()) {
        const q = query.search.trim().toLowerCase();
        rows = rows.filter((v) => v.vorgangsnummer.toLowerCase().includes(q));
      }
      const limit = query?.limit;
      return limit ? rows.slice(0, limit) : rows;
    },

    get: async (id) => {
      await wait();
      return use.getState().vorgaenge.find((v) => v.id === id);
    },

    einreichen: async (antragsdaten, erbrachteNachweise, einreichenOpts) => {
      await wait();
      const key = einreichenOpts?.idempotencyKey;
      if (key && idempotency.has(key)) {
        return idempotency.get(key)!;
      }
      const ki = { confidence: 0, flags: [] as string[] };
      const initialStatus = config.statusMachine?.initial;
      if (!initialStatus) {
        throw new Error(
          "LeistungConfig ohne statusMachine.initial — Vorgang kann nicht eröffnet werden.",
        );
      }
      const wirksam = abgeleiteteFelder(
        config,
        antragsdaten as Antragsdaten,
      ) as T;
      const berechnung = effektiveBerechnung(config, wirksam);
      const v: Vorgang<T> = {
        id: `v-${pad(++__seq, 6)}`,
        vorgangsnummer: vorgangsnummer(),
        eingangIso: now(),
        antragsdaten: wirksam,
        status: initialStatus,
        ...(berechnung ? { berechnung } : {}),
        ki,
        version: 1,
        nachweise: effektiveNachweise(config, wirksam).map((n) => {
          const datei = erbrachteNachweise?.[n.id];
          if (!datei) return n;
          return {
            ...n,
            hochgeladen: true,
            datei: { name: datei.name, groesse: datei.groesse },
            ...(datei.attachmentId ? { attachmentId: datei.attachmentId } : {}),
          };
        }),
        history: [
          { ts: now(), aktion: "Antrag eingegangen", rolle: "buerger" },
        ],
      };
      setState((vs) => [v, ...vs]);
      if (key) idempotency.set(key, v);
      return v;
    },

    uebergang: async (id, eventName, rolle, detail, akteur, uebergangOpts) => {
      await wait();
      const key = uebergangOpts?.idempotencyKey;
      if (key && idempotency.has(key)) {
        return idempotency.get(key)!;
      }
      const current = use.getState().vorgaenge.find((v) => v.id === id);
      if (!current) throw new Error(`Vorgang ${id} nicht gefunden`);
      if (
        uebergangOpts?.expectedVersion !== undefined &&
        current.version !== undefined &&
        current.version !== uebergangOpts.expectedVersion
      ) {
        throw new Error(
          `Versionskonflikt: erwartet ${uebergangOpts.expectedVersion}, aktuell ${current.version}`,
        );
      }
      const t =
        config.statusMachine.transitions.find(
          (x) =>
            x.from === current.status &&
            (x.to === eventName ||
              (x.eventName ?? `${x.from}->${x.to}`) === eventName),
        ) ??
        config.statusMachine.transitions.find(
          (x) => x.from === current.status && x.to === eventName,
        );
      if (!t)
        throw new Error(
          `Übergang ${current.status} → ${eventName} nicht erlaubt`,
        );
      if (!t.rollen.includes(rolle)) {
        throw new Error(
          `Rolle ${rolle} darf ${current.status} → ${t.to} nicht auslösen`,
        );
      }
      if (t.detailPflicht && !detail) {
        throw new Error(`Übergang „${t.label}" erfordert eine Begründung`);
      }
      if (t.vierAugen) {
        if (!akteur) {
          throw new Error(
            `Vier-Augen verletzt: „${t.label}" erfordert eine Akteur-Identität`,
          );
        }
        const letzter = [...current.history]
          .reverse()
          .find((h) => h.akteur)?.akteur;
        if (letzter && letzter === akteur) {
          throw new Error(
            `Vier-Augen verletzt: „${t.label}" erfordert eine ANDERE Person als ${akteur}`,
          );
        }
      }
      const next: Vorgang<T> = {
        ...current,
        status: t.to,
        version: (current.version ?? 1) + 1,
        history: [
          ...current.history,
          {
            ts: now(),
            aktion: `${t.label} (→ ${t.to})`,
            rolle,
            ...(akteur ? { akteur } : {}),
            ...(detail ? { detail } : {}),
          },
        ],
      };
      setState((vs) => vs.map((x) => (x.id === id ? next : x)));
      if (key) idempotency.set(key, next);
      return next;
    },

    lookupRegister: async (query) => {
      await wait();
      const q = query.toLowerCase().trim();
      if (!q) return undefined;
      return config.register.mock?.find((r) =>
        config.register.suchfelder.some((f) =>
          String(r[f] ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    },
  };
  return store;
}
