// App composition: browser port is HTTP → CaseService. Zustand cache is not persistence authority.
// Storybook/tests use createFachverfahrenStore directly — not this module.
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  LeistungConfig,
  RegisterLookupPort,
  Transition,
  Vorgang,
  VorgangPort,
} from "@senticor/fachverfahren-kit";
import { leistungConfig } from "./leistung.config";
import { createVorgangClient } from "./vorgang-client.js";

export interface AppVorgangStore extends VorgangPort, RegisterLookupPort {
  config: LeistungConfig;
  use: UseBoundStore<StoreApi<{ vorgaenge: Vorgang[] }>>;
  transitionsFrom(status: string, rolle?: string): Transition[];
}

const client = createVorgangClient();
const use = create<{ vorgaenge: Vorgang[] }>(() => ({ vorgaenge: [] }));

function transitionsFrom(status: string, rolle?: string): Transition[] {
  return (leistungConfig.statusMachine?.transitions ?? []).filter(
    (t) => t.from === status && (!rolle || t.rollen.includes(rolle)),
  );
}

export const store: AppVorgangStore = {
  config: leistungConfig,
  use,
  transitionsFrom,
  async list(query) {
    const items = await client.list(query);
    use.setState({ vorgaenge: items });
    return items;
  },
  async get(id) {
    return client.get(id);
  },
  async einreichen(antragsdaten, erbrachteNachweise, opts) {
    const v = await client.einreichen(antragsdaten, erbrachteNachweise, opts);
    use.setState((s) => ({ vorgaenge: [v, ...s.vorgaenge] }));
    return v;
  },
  async uebergang(id, eventName, rolle, detail, akteur, opts) {
    const v = await client.uebergang(
      id,
      eventName,
      rolle,
      detail,
      akteur,
      opts,
    );
    use.setState((s) => ({
      vorgaenge: s.vorgaenge.map((x) => (x.id === id ? v : x)),
    }));
    return v;
  },
  async lookupRegister(query) {
    const q = query.toLowerCase().trim();
    if (!q) return undefined;
    return leistungConfig.register.mock?.find((r) =>
      leistungConfig.register.suchfelder.some((f) =>
        String(r[f] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  },
};
