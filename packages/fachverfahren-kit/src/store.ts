// fachverfahren-kit/store — die generische DEV-Datenschicht: ein Zustand-Store, der `VorgangPort` implementiert,
// gesteuert NUR durch die `LeistungConfig`. Aus etablierten Public-Sector-UX-Mustern abgeleitet, leistungs-
// agnostisch: dieselbe Vorgang-State-Machine + History + Once-Only-Register für JEDES Fachverfahren.
//
// DEV (im Vite-Dev-Server, end-to-end klickbar): dieser In-Memory/Zustand-Store.
// PROD: dieselbe `VorgangPort`-Schnittstelle gegen das SDK/Fastify-Backend — die Bausteine merken keinen Unterschied.
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  LeistungConfig,
  Vorgang,
  VorgangPersistence,
  VorgangPort,
  Transition,
} from "./types.js";
import {
  abgeleiteteFelder,
  effektiveBerechnung,
  effektiveNachweise,
} from "./lib/interpreter.js";
import type { Antragsdaten } from "./lib/antrag-felder.js";

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

/** Baut den Store für EINE Leistung. `jahr` injiziert (kein `new Date()` in der Logik → deterministisch/testbar).
 *  `persistence` (optional): bindet den Store an eine Aufbewahrungs-Naht (PROD: HTTP gegen das BFF). Ist sie
 *  gesetzt, ist der SERVER die Wahrheit — der DEV-`config.seed` entfällt, der Anfangs-Snapshot ist leer, bis
 *  `laden()` hydriert. Ohne `persistence` bleibt alles wie bisher (In-Memory + Seed, rückwärtskompatibel). */
export function createFachverfahrenStore<T = Record<string, unknown>>(
  config: LeistungConfig<T>,
  opts: {
    jahr?: number;
    now?: () => string;
    persistence?: VorgangPersistence<T>;
  } = {},
): FachverfahrenStore<T> {
  const jahr = opts.jahr ?? 2026;
  const now = opts.now ?? (() => new Date().toISOString());
  const persistence = opts.persistence;
  const vorgangsnummer = makeVorgangsnummer(jahr);

  // Der Config-Seed ist der ANFANGSBESTAND — auch mit Persistenz. `laden()` ERSETZT ihn bei der
  // Hydration durch die Server-Wahrheit; wer nicht hydriert (z. B. eine SB-Sicht, die den Demo-
  // Bestand zeigt), behält den Seed. So teilen Bürger- und SB-Sicht EINE Store-Instanz, ohne dass
  // die eine der anderen den Bestand wegzieht.
  const seed = config.seed?.({ vorgangsnummer }) ?? [];
  const use = create<{ vorgaenge: Vorgang<T>[] }>(() => ({ vorgaenge: seed }));

  const setState = (fn: (s: Vorgang<T>[]) => Vorgang<T>[]) =>
    use.setState((s) => ({ vorgaenge: fn(s.vorgaenge) }));

  const transitionsFrom = (status: string, rolle?: string): Transition[] =>
    // DEFENSIV gegen eine unvollständig generierte Config (statusMachine evtl. nicht vertragskonform).
    (config.statusMachine?.transitions ?? []).filter(
      (t) => t.from === status && (!rolle || t.rollen.includes(rolle)),
    );

  const store: FachverfahrenStore<T> = {
    config,
    use,
    transitionsFrom,

    list: () => use.getState().vorgaenge,
    get: (id) => use.getState().vorgaenge.find((v) => v.id === id),

    // Hydriert den Snapshot aus der Persistenz-Naht (PROD: GET) — und ERSETZT dabei den bisherigen
    // Bestand (Seed) durch die Server-Wahrheit. Ohne Persistenz existiert die Methode nicht (der
    // In-Memory-Store trägt seinen Bestand selbst: Seed + eingereichte Vorgänge).
    ...(persistence
      ? {
          laden: async () => {
            const vorgaenge = await persistence.laden();
            use.setState({ vorgaenge });
          },
        }
      : {}),

    // ASYNC nur der SIGNATUR nach: dieser DEV-Store rechnet rein lokal und synchron. Der Vertrag ist
    // async, damit die PROD-Implementierung (HTTP gegen das BFF) überhaupt typisierbar ist — vorher
    // schloss die synchrone Signatur jede server-gestützte Umsetzung aus.
    einreichen: async (antragsdaten, erbrachteNachweise) => {
      // KEINE KI-Einschätzung: an diesen Store ist KEIN Modell gebunden (der AiAssistPort ist eine
      // Naht ohne Adapter). Die Vorfassung schrieb hier hart `{confidence: 0, flags: []}` — das las
      // sich in der Aufsicht als „die KI war zu 0 % sicher" statt „es lief gar keine KI". `ki` bleibt
      // deshalb UNGESETZT, bis ein Adapter den Vorgang wirklich bewertet.
      // DEFENSIV wie transitionsFrom (fail-closed gegen unvollständig generierte Config): OHNE Initial-Status kann kein
      // Vorgang eröffnet werden — sprechender Fehler statt stiller TypeError, der die Bürger-Navigation verschluckt.
      const initialStatus = config.statusMachine?.initial;
      if (!initialStatus)
        throw new Error(
          "LeistungConfig ohne statusMachine.initial — Vorgang kann nicht eröffnet werden.",
        );
      // M1 — ABGELEITETE Felder (Codelisten-Merkmal → Antragsfeld) VOR der Berechnung anwenden (defensiv &
      // idempotent: der Stepper reicht i. d. R. schon abgeleitete Daten ein, ein direkter Port-Aufruf nicht). Die
      // abgeleiteten Werte werden mit eingereicht, damit sie im Vorgang/Detail sichtbar sind.
      const wirksam = abgeleiteteFelder(
        config,
        antragsdaten as Antragsdaten,
      ) as T;
      // EFFEKTIVE Berechnung/Nachweise: `berechne`/`nachweise` sind Escape-Hatches, sonst wertet der reine
      // Interpreter `tarif`/`codelisten` aus (Default = Daten-Auswertung).
      const berechnung = effektiveBerechnung(config, wirksam);
      const v: Vorgang<T> = {
        id: `v-${pad(++__seq, 6)}`,
        vorgangsnummer: vorgangsnummer(),
        eingangIso: now(),
        antragsdaten: wirksam,
        status: initialStatus,
        // berechnung ist optional — unter exactOptionalPropertyTypes nur setzen, wenn vorhanden.
        ...(berechnung ? { berechnung } : {}),
        // NACHWEIS-RECONCILE (Wurzel-Fix „hochgeladener Nachweis landet nicht beim Sachbearbeiter"): die aus der Config
        // abgeleitete SOLL-Liste mit den TATSÄCHLICH eingereichten Dateien (keyed by Nachweis-Id) mergen — wo ein Upload
        // existiert, hochgeladen:true + Datei-Metadaten ablegen. Rein data-driven über die Id, kein Verfahrens-Literal.
        nachweise: effektiveNachweise(config, wirksam).map((n) => {
          const datei = erbrachteNachweise?.[n.id];
          return datei ? { ...n, hochgeladen: true, datei } : n;
        }),
        history: [
          { ts: now(), aktion: "Antrag eingegangen", rolle: "buerger" },
        ],
      };
      // Mit Persistenz: erst SPEICHERN, dann den kanonischen Vorgang (Server vergibt id/Nummer/Zeit) in
      // den Snapshot übernehmen. Der Server ist die Quelle der id — sonst zeigte die Bestätigungsseite eine
      // Client-id, die nach einem Reload nicht mehr existierte. Wirft die Persistenz (Netz/403/…), landet
      // NICHTS im Snapshot und der Fehler propagiert an den Aufrufer (AntragStepper meldet ihn sichtbar).
      if (persistence) {
        const kanonisch = await persistence.einreichen(v);
        setState((vs) => [kanonisch, ...vs]);
        return kanonisch;
      }
      setState((vs) => [v, ...vs]);
      return v;
    },

    uebergang: async (id, to, rolle, detail, akteur) => {
      const v = store.get(id);
      if (!v) throw new Error(`Vorgang ${id} nicht gefunden`);
      const t = config.statusMachine.transitions.find(
        (x) => x.from === v.status && x.to === to,
      );
      if (!t) throw new Error(`Übergang ${v.status} → ${to} nicht erlaubt`);
      if (!t.rollen.includes(rolle))
        throw new Error(
          `Rolle ${rolle} darf ${v.status} → ${to} nicht auslösen`,
        );
      if (t.detailPflicht && !detail)
        throw new Error(`Übergang „${t.label}" erfordert eine Begründung`);
      // 4-Augen wird in PROD serverseitig erzwungen (anderer Bearbeiter als der Antragsteller/Vorprüfer).
      // Im DEV-Store gilt dieselbe Regel, sobald Akteure bekannt sind: ZWEI VERSCHIEDENE Personen — der letzte
      // bekannte Akteur der History darf einen vierAugen-Übergang nicht selbst auslösen. Ohne Akteur-Angabe bleibt
      // es (abwärtskompatibel) beim History-Vermerk; der Nachweis ist dann über history[].akteur nicht führbar.
      if (t.vierAugen && akteur) {
        const letzter = [...v.history].reverse().find((h) => h.akteur)?.akteur;
        if (letzter && letzter === akteur)
          throw new Error(
            `Vier-Augen verletzt: „${t.label}" erfordert eine ANDERE Person als ${akteur} (letzter Akteur der History)`,
          );
      }
      setState((vs) =>
        vs.map((x) =>
          x.id === id
            ? {
                ...x,
                status: to,
                history: [
                  ...x.history,
                  // detail/akteur sind optional — unter exactOptionalPropertyTypes nur setzen, wenn vorhanden.
                  {
                    ts: now(),
                    aktion: `${t.label} (→ ${to})`,
                    rolle,
                    ...(akteur ? { akteur } : {}),
                    ...(detail ? { detail } : {}),
                  },
                ],
              }
            : x,
        ),
      );
    },

    lookupRegister: async (query) => {
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
