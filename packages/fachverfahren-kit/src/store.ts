// fachverfahren-kit/store — die generische DEV-Datenschicht: ein Zustand-Store, der `VorgangPort` implementiert,
// gesteuert NUR durch die `LeistungConfig`. Aus der Referenz-`store.ts` (Lovable) abgeleitet, aber leistungs-
// agnostisch: dieselbe Vorgang-State-Machine + History + Once-Only-Register für JEDES Fachverfahren.
//
// DEV (im Vite-Dev-Server, end-to-end klickbar wie die Referenz): dieser In-Memory/Zustand-Store.
// PROD: dieselbe `VorgangPort`-Schnittstelle gegen das SDK/Fastify-Backend — die Bausteine merken keinen Unterschied.
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LeistungConfig, Vorgang, VorgangPort, Transition } from "./types.js";

let __seq = 0;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** Erzeugt eine fortlaufende Vorgangsnummer im Format FV-<jahr>-<lfd> (deterministisch über einen injizierten Zähler). */
function makeVorgangsnummer(jahr: number): () => string {
  return () => `FV-${jahr}-${pad(++__seq, 4)}`;
}

export interface FachverfahrenStore<T> extends VorgangPort<T> {
  /** Reaktiver Zustand-Hook für die UI (subscribe auf vorgaenge). */
  use: UseBoundStore<StoreApi<{ vorgaenge: Vorgang<T>[] }>>;
  config: LeistungConfig<T>;
  /** Findet den erlaubten Übergang (oder undefined). Für die UI, um Buttons/Rollen zu rendern. */
  transitionsFrom(status: string, rolle?: string): Transition[];
}

/** Baut den Store für EINE Leistung. `jahr` injiziert (kein `new Date()` in der Logik → deterministisch/testbar). */
export function createFachverfahrenStore<T = Record<string, unknown>>(
  config: LeistungConfig<T>,
  opts: { jahr?: number; now?: () => string } = {},
): FachverfahrenStore<T> {
  const jahr = opts.jahr ?? 2026;
  const now = opts.now ?? (() => new Date().toISOString());
  const vorgangsnummer = makeVorgangsnummer(jahr);

  const seed = config.seed?.({ vorgangsnummer }) ?? [];
  const use = create<{ vorgaenge: Vorgang<T>[] }>(() => ({ vorgaenge: seed }));

  const setState = (fn: (s: Vorgang<T>[]) => Vorgang<T>[]) => use.setState((s) => ({ vorgaenge: fn(s.vorgaenge) }));

  const transitionsFrom = (status: string, rolle?: string): Transition[] =>
    config.statusMachine.transitions.filter((t) => t.from === status && (!rolle || t.rollen.includes(rolle)));

  const store: FachverfahrenStore<T> = {
    config,
    use,
    transitionsFrom,

    list: () => use.getState().vorgaenge,
    get: (id) => use.getState().vorgaenge.find((v) => v.id === id),

    einreichen: (antragsdaten) => {
      const ki = { confidence: 0, flags: [] as string[] };
      const v: Vorgang<T> = {
        id: `v-${pad(++__seq, 6)}`,
        vorgangsnummer: vorgangsnummer(),
        eingangIso: now(),
        antragsdaten,
        status: config.statusMachine.initial,
        berechnung: safeBerechne(config, antragsdaten),
        ki,
        nachweise: config.nachweise?.(antragsdaten) ?? [],
        history: [{ ts: now(), aktion: "Antrag eingegangen", rolle: "buerger" }],
      };
      setState((vs) => [v, ...vs]);
      return v;
    },

    uebergang: (id, to, rolle, detail) => {
      const v = store.get(id);
      if (!v) throw new Error(`Vorgang ${id} nicht gefunden`);
      const t = config.statusMachine.transitions.find((x) => x.from === v.status && x.to === to);
      if (!t) throw new Error(`Übergang ${v.status} → ${to} nicht erlaubt`);
      if (!t.rollen.includes(rolle)) throw new Error(`Rolle ${rolle} darf ${v.status} → ${to} nicht auslösen`);
      if (t.detailPflicht && !detail) throw new Error(`Übergang „${t.label}" erfordert eine Begründung`);
      // 4-Augen wird in PROD serverseitig erzwungen (anderer Bearbeiter als der Antragsteller/Vorprüfer);
      // im DEV-Store ist es ein Vermerk in der History (revisionssicher, append-only).
      setState((vs) =>
        vs.map((x) =>
          x.id === id
            ? { ...x, status: to, history: [...x.history, { ts: now(), aktion: `${t.label} (→ ${to})`, rolle, detail }] }
            : x,
        ),
      );
    },

    lookupRegister: (query) => {
      const q = query.toLowerCase().trim();
      if (!q) return undefined;
      return config.register.mock?.find((r) =>
        config.register.suchfelder.some((f) => String(r[f] ?? "").toLowerCase().includes(q)),
      );
    },
  };
  return store;
}

/** Berechnung defensiv aufrufen — eine fehlerhafte Leistungs-`berechne` darf den Antrag nicht crashen. */
function safeBerechne<T>(config: LeistungConfig<T>, antragsdaten: T) {
  try {
    return config.berechne(antragsdaten);
  } catch {
    return undefined;
  }
}
