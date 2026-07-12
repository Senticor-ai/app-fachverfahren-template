// fachverfahren-kit/store — die generische DEV-Datenschicht: ein Zustand-Store, der `VorgangPort` implementiert,
// gesteuert NUR durch die `LeistungConfig`. Aus etablierten Public-Sector-UX-Mustern abgeleitet, leistungs-
// agnostisch: dieselbe Vorgang-State-Machine + History + Once-Only-Register für JEDES Fachverfahren.
//
// DEV (im Vite-Dev-Server, end-to-end klickbar): dieser In-Memory/Zustand-Store.
// PROD: dieselbe `VorgangPort`-Schnittstelle gegen das SDK/Fastify-Backend — die Bausteine merken keinen Unterschied.
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  Aufgabe,
  AufgabeAktivitaet,
  AufgabeBeziehung,
  GespeicherteAnsicht,
  AufgabeKommentar,
  AutomationTrigger,
  BulkErgebnis,
  InboxItem,
  LeistungConfig,
  TaskFilter,
  Vorgang,
  VorgangPort,
  Transition,
  VerfahrenEintrag,
  WorkspaceConfig,
  WorkspacePort,
} from "./types.js";
import {
  abgeleiteteFelder,
  effektiveBerechnung,
  effektiveNachweise,
} from "./lib/interpreter.js";
import { rangVergleich, rankZwischen, verteilteRaenge } from "./lib/rank.js";
import { faelligkeitAb } from "./lib/frist.js";
import { erlaubteUebergaenge, findeUebergang } from "./lib/status-machine.js";
import { letzterVorbereiter } from "./lib/vier-augen.js";
import { evalAutomationen } from "./lib/automation.js";
import { wendeAutomationEffekteAn } from "./lib/automation-run.js";
import { asString, getPath, type Antragsdaten } from "./lib/antrag-felder.js";

/** Pseudonymer SERVICE-Akteur für Automations-Effekte — nie ein menschlicher Akteur (Vier-Augen bleibt Mensch). */
const AUTOMATION_AKTEUR = "automation.service";

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

  const setState = (fn: (s: Vorgang<T>[]) => Vorgang<T>[]) =>
    use.setState((s) => ({ vorgaenge: fn(s.vorgaenge) }));

  const transitionsFrom = (status: string, rolle?: string): Transition[] =>
    // Eine Wahrheit: die reine `erlaubteUebergaenge` (defensiv gegen eine unvollständig generierte Machine).
    erlaubteUebergaenge(config.statusMachine, status, rolle);

  const store: FachverfahrenStore<T> = {
    config,
    use,
    transitionsFrom,

    list: () => use.getState().vorgaenge,
    get: (id) => use.getState().vorgaenge.find((v) => v.id === id),

    einreichen: (antragsdaten, erbrachteNachweise) => {
      const ki = { confidence: 0, flags: [] as string[] };
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
        ki,
        // NACHWEIS-RECONCILE (Wurzel-Fix „hochgeladener Nachweis landet nicht beim Sachbearbeiter"): die aus der Config
        // abgeleitete SOLL-Liste mit den TATSÄCHLICH eingereichten Dateien (keyed by Nachweis-Id) mergen — wo ein Upload
        // existiert, hochgeladen:true + Datei-Metadaten ablegen. Rein data-driven über die Id, kein Verfahrens-Literal.
        nachweise: effektiveNachweise(config, wirksam).map((n) => {
          const datei = erbrachteNachweise?.[n.id];
          return datei ? { ...n, hochgeladen: true, datei } : n;
        }),
        history: [
          {
            ts: now(),
            aktion: "Antrag eingegangen",
            rolle: "buerger",
            art: "eingang",
          },
        ],
      };
      setState((vs) => [v, ...vs]);
      return v;
    },

    uebergang: (id, to, rolle, detail, akteur) => {
      const v = store.get(id);
      if (!v) throw new Error(`Vorgang ${id} nicht gefunden`);
      const t = findeUebergang(config.statusMachine, v.status, to);
      if (!t) throw new Error(`Übergang ${v.status} → ${to} nicht erlaubt`);
      if (!t.rollen.includes(rolle))
        throw new Error(
          `Rolle ${rolle} darf ${v.status} → ${to} nicht auslösen`,
        );
      if (t.detailPflicht && !detail)
        throw new Error(`Übergang „${t.label}" erfordert eine Begründung`);
      // 4-Augen wird in PROD serverseitig erzwungen (DefaultDenyPolicyEngine gegen `previousApproverActorId`).
      // Der DEV-Store spiegelt dieselbe Regel: der VORBEREITER einer kritischen Entscheidung ist der Akteur des
      // letzten STATUS-ÜBERGANGS (`art === "uebergang"`), NICHT irgendein beliebiger History-Akteur — sonst
      // „vergiften" Label-/Zuweisungs-/Automations-Vermerke die Prüfung (der ursprüngliche Vorbereiter könnte seine
      // eigene Entscheidung freigeben). Ohne Akteur-Angabe bleibt es (abwärtskompatibel) beim reinen Vermerk.
      if (t.vierAugen && akteur) {
        const vorbereiter = letzterVorbereiter(v.history);
        if (vorbereiter && vorbereiter === akteur)
          throw new Error(
            `Vier-Augen verletzt: „${t.label}" erfordert eine ANDERE Person als ${akteur} (Vorbereiter des letzten Übergangs)`,
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
                    art: "uebergang" as const,
                    ...(akteur ? { akteur } : {}),
                    ...(detail ? { detail } : {}),
                  },
                ],
              }
            : x,
        ),
      );
    },

    lookupRegister: (query) => {
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PM-UPGRADE — WORKSPACE-STORE (verfahrensübergreifend, DEV-Datenschicht)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Aggregiert N `createFachverfahrenStore` (je Verfahren) zu EINEM Sachbearbeiter-Workspace. Die MANAGEMENT-Ebene
// (Priorität/Zuweisung/Label/Board-Rang je Aufgabe) lebt in einem separaten Meta-Store, keyed by Vorgang-Id —
// eine Aufgabe ist der fachliche `Vorgang` + diese Metadaten (1:1 im DEV). So ändert ein Board-Move (Priorität/
// Position) NIE den fachlichen Status; Statuswechsel laufen ausschließlich über `taskUebergang` → den geprüften
// Sub-Store-`uebergang` (Rolle/Detail/Vier-Augen). Alles SYNCHRON/in-memory, weil der `useSyncExternalStore`-
// Vertrag der App einen synchronen `getSnapshot` verlangt.
//
// PROD-Anbindung (Fastify-Domain-API) ist bewusst KEIN Port „gleicher Signatur": ein HTTP-Client ist zwingend async
// und bräche den synchronen Reaktivitätsvertrag. Die richtige Brücke ist eine SEPARATE async Fetch-/Query-Schicht,
// die einen synchronen Client-Snapshot SPEIST (genau die Rolle, die dieser Store bereits spielt) — nicht eine
// Verschmelzung der beiden Welten unter einem Interface.

/** Management-Metadaten einer Aufgabe (Board-Ebene), getrennt vom fachlichen `Vorgang`. */
interface TaskMeta {
  prioritaet: string | undefined;
  zugewiesenAn: string | undefined;
  labels: string[];
  sortRank: string;
  version: number;
  boardSpalte: string | undefined;
  /** Übergeordnete Aufgabe (Sub-Issue/Unteraufgabe, Plane). Gesetzt nur bei createFreieAufgabe mit parentAufgabeId
   *  — optional, damit die bestehenden Meta-Literale (Seed/Verfahrens-Aufgaben) unverändert bleiben. */
  parentAufgabeId?: string;
}

export interface WorkspaceStore<
  T = Record<string, unknown>,
> extends WorkspacePort<T> {
  config: WorkspaceConfig;
  /** Reaktivität: feuert bei JEDER Änderung (ein Sub-Store ODER die Task-Metadaten). */
  subscribe(listener: () => void): () => void;
  /** Monotone Version für `useSyncExternalStore` — stabile Referenz, die sich bei jeder Änderung ändert. */
  snapshot(): number;
}

/** Baut den verfahrensübergreifenden Workspace-Store aus einer `WorkspaceConfig`. `jahr`/`now` werden an die
 *  Sub-Stores injiziert (deterministisch/testbar). */
export function createWorkspaceStore<T = Record<string, unknown>>(
  config: WorkspaceConfig,
  opts: { jahr?: number; now?: () => string } = {},
): WorkspaceStore<T> {
  // Ein Sub-Store je AKTIVEM Verfahren (inaktive Einträge werden ausgeblendet, nicht entfernt).
  const stores = new Map<string, FachverfahrenStore<T>>();
  const eintraege: VerfahrenEintrag<T>[] = [];
  for (const eintrag of config.verfahren) {
    if (eintrag.aktiv === false) continue;
    const typed = eintrag as VerfahrenEintrag<T>;
    eintraege.push(typed);
    stores.set(
      eintrag.procedureId,
      createFachverfahrenStore<T>(typed.config, opts),
    );
  }
  /** Vorgang-Id → Verfahren-Id (für Delegation an den richtigen Sub-Store). */
  // Aufgaben-Id = `${procedureId}::${vorgangId}` — GLOBAL eindeutig über alle Verfahren, damit zwei Verfahren mit
  // (versehentlich) kollidierenden Seed-Vorgangs-Ids einander NICHT überschreiben. Der Index löst eine Aufgaben-Id
  // zurück auf Verfahren + Vorgang. `vorgangId` bleibt separat auf der `Aufgabe` (für Navigation/Sub-Store-Aufrufe).
  const taskKey = (pid: string, vorgangId: string): string =>
    `${pid}::${vorgangId}`;
  const taskIndex = new Map<string, { pid: string; vorgangId: string }>();

  // VERFAHRENS-FREIE Aufgaben (generische Projekt-/Workflow-Items ohne Fachverfahren/Vorgang): id → Titel. Die Id
  // trägt das Präfix `frei::` und kollidiert nicht mit `procedureId::vorgangId` — SOLANGE keine `procedureId` wörtlich
  // `frei` heißt (dieses Präfix ist als Verfahrens-Id reserviert). `resolveTaskId` prüft `frei::`-Ids ZUERST. Die
  // Metadaten liegen — wie bei verfahrens-gebundenen Aufgaben — im `metaStore` (keyed by dieser Id).
  let freieSeq = 0;
  const freieTitel = new Map<string, string>();

  /** Löst eine Aufgaben-Id auf: bevorzugt die kanonische `verfahren::vorgang`-Id (exakter Treffer); als Komfort
   *  wird auch eine rohe `vorgangId` akzeptiert, SOLANGE sie über alle Verfahren eindeutig ist. Ist sie mehrdeutig
   *  (zwei Verfahren mit gleicher Vorgangs-Id), wirft die Auflösung — dann MUSS die volle Aufgaben-Id genutzt werden. */
  const resolveTaskId = (
    taskId: string,
  ): { key: string; pid?: string; vorgangId?: string } | undefined => {
    // Verfahrens-freie Aufgabe: die Id IST der Meta-Schlüssel (kein Verfahren/Vorgang aufzulösen).
    if (freieTitel.has(taskId)) return { key: taskId };
    const direct = taskIndex.get(taskId);
    if (direct) return { key: taskId, ...direct };
    const treffer = [...taskIndex.entries()].filter(
      ([, ref]) => ref.vorgangId === taskId,
    );
    if (treffer.length === 1) return { key: treffer[0]![0], ...treffer[0]![1] };
    if (treffer.length > 1)
      throw new Error(
        `Aufgaben-Id „${taskId}" ist mehrdeutig — bitte die volle Aufgaben-Id (verfahren::vorgang) verwenden.`,
      );
    return undefined;
  };

  const metaStore = create<{ meta: Record<string, TaskMeta> }>(() => ({
    meta: {},
  }));
  const currentMeta = () => metaStore.getState().meta;
  // Stabile `VorgangPort`-Instanz je Verfahren (Referenz-Stabilität für React-Props/Effekte).
  const portCache = new Map<string, VorgangPort<T>>();

  // Reaktivität: EINE Version, die bei jeder Sub-Store- ODER Meta-Änderung hochzählt.
  let version = 0;
  const listeners = new Set<() => void>();
  const bump = () => {
    version += 1;
    for (const l of listeners) l();
  };
  for (const s of stores.values()) s.use.subscribe(bump);
  metaStore.subscribe(bump);

  // ── Aufgaben-Detail (in-memory; reaktiv über `bump`) — Vermerke/Aktivität append-only, Beziehungen löschbar. ──
  const kommentare = new Map<string, AufgabeKommentar[]>();
  const aktivitaet = new Map<string, AufgabeAktivitaet[]>();
  const beziehungen = new Map<string, AufgabeBeziehung[]>();

  // ── Gespeicherte Ansichten (in-memory; reaktiv über `bump`). In PROD über `/api/views`. ──
  let viewSeq = 0;
  const gespeicherteAnsichten: GespeicherteAnsicht[] = [];
  const jetztIso = (): string => opts.now?.() ?? new Date().toISOString();

  // ── Verfahrensübergreifende Inbox (Phase 4; in-memory, reaktiv über `bump`) ──
  // DEV-Seed: je aktivem Verfahren EIN offener Eingang, damit die Triage-Inbox in der Vorlage etwas zeigt (analog
  // zum Vorgangs-Seed). In PROD kommt der Eingang über `/api/inbox` (Ingest) und wird über die geprüften Routen
  // triagiert; die Kit-Komponenten sind reine Sicht auf den Port.
  const quellen = ["antrag", "formular", "email", "register"] as const;
  let inboxSeq = 0;
  const inbox: InboxItem[] = eintraege.map((e, i) => ({
    id: `inbox-${(inboxSeq += 1)}`,
    procedureId: e.procedureId,
    tenantId: config.tenantId,
    authorityId: config.authorityId,
    jurisdictionId: config.jurisdictionId,
    quelle: quellen[i % quellen.length]!,
    eingangIso: new Date(
      Date.UTC(2026, 6, 9, 8, 0) - i * 3_600_000,
    ).toISOString(),
    triageStatus: "pending",
    rohdaten: {},
    betreff: `Neuer Eingang · ${e.config.label}`,
  }));

  let detailSeq = 0;
  const detailId = (praefix: string): string =>
    `${praefix}-${(detailSeq += 1)}`;
  const nowIso = opts.now ?? (() => new Date().toISOString());

  // Append-only Aktivitäts-Protokoll (Change-Log): JEDE Management-Mutation (Zuweisung/Priorität/Label/Move/
  // Statuswechsel) erzeugt einen Eintrag, damit der Aktivitäts-Feed ein ECHTES Änderungsprotokoll ist — nicht nur
  // Kommentare/KI. `typ` ist DATEN (task.*), `payload` trägt den neuen Wert. Wird NACH der geglückten Mutation
  // aufgerufen (bei `move` also nur, wenn der Versions-Guard nicht geworfen hat) und bumpt selbst.
  const protokolliereAktivitaet = (
    taskId: string,
    typ: string,
    akteur: string | undefined,
    payload?: Record<string, unknown>,
  ): void => {
    const ref = resolveTaskId(taskId);
    if (!ref) return;
    const liste = aktivitaet.get(ref.key) ?? [];
    liste.push({
      id: detailId("aktivitaet"),
      aufgabeId: ref.key,
      akteurId: akteur ?? "sb.angemeldet",
      typ,
      ...(payload ? { payload } : {}),
      zeitpunktIso: nowIso(),
    });
    aktivitaet.set(ref.key, liste);
    bump();
  };

  // Bulk = N UNABHÄNGIGE Einzelaktionen mit Einzel-Bilanz ({taskId, ok, fehler}) — NIE eine Bulk-Entscheidung.
  // Ein Fehlschlag EINER Aufgabe stoppt die übrigen nicht. Geteilt von bulkAssign/bulkPrioritaet/bulkLabel.
  const bulkBilanz = (
    taskIds: string[],
    aktion: (taskId: string) => void,
  ): BulkErgebnis[] =>
    taskIds.map((taskId) => {
      try {
        aktion(taskId);
        return { taskId, ok: true };
      } catch (e) {
        return {
          taskId,
          ok: false,
          fehler: e instanceof Error ? e.message : String(e),
        };
      }
    });

  const hoechsterRang = (meta: Record<string, TaskMeta>): string => {
    let max = "";
    for (const m of Object.values(meta)) if (m.sortRank > max) max = m.sortRank;
    return max;
  };
  const neuerRangAmEnde = (meta: Record<string, TaskMeta>): string =>
    rankZwischen(hoechsterRang(meta) || undefined, undefined);

  // Initiale Ränge für alle Seed-Vorgänge (stabile Reihenfolge: eingangIso, dann Id).
  const seedVorgaenge: { pid: string; v: Vorgang<T> }[] = [];
  for (const [pid, s] of stores)
    for (const v of s.list()) seedVorgaenge.push({ pid, v });
  seedVorgaenge.sort(
    (a, b) =>
      a.v.eingangIso.localeCompare(b.v.eingangIso) ||
      a.v.id.localeCompare(b.v.id),
  );
  const seedRaenge = verteilteRaenge(seedVorgaenge.length);
  const startMeta: Record<string, TaskMeta> = {};
  seedVorgaenge.forEach(({ pid, v }, i) => {
    const key = taskKey(pid, v.id);
    taskIndex.set(key, { pid, vorgangId: v.id });
    startMeta[key] = {
      prioritaet: undefined,
      zugewiesenAn: undefined,
      labels: [],
      sortRank: seedRaenge[i]!,
      version: 1,
      boardSpalte: undefined,
    };
  });
  metaStore.setState({ meta: startMeta });

  const titelFuer = (procedureId: string, v: Vorgang<T>): string => {
    // Kurztitel: das erste Detail-Sektions-Feld (falls belegt), sonst die Vorgangsnummer — data-driven, kein Literal.
    const cfg = stores.get(procedureId)?.config;
    const pfad = cfg?.detailSektionen?.[0]?.felder?.[0]?.pfad;
    const wert = pfad
      ? asString(getPath(v.antragsdaten as Antragsdaten, pfad)).trim()
      : "";
    return wert ? `${v.vorgangsnummer} · ${wert}` : v.vorgangsnummer;
  };

  // Fälligkeit DATA-DRIVEN aus dem Verfahren ableiten: der erste `fristenTypen`-Eintrag der Config + das Eingangsdatum
  // des Vorgangs als Anker (`faelligkeitAb`). NUR für nicht-terminale Vorgänge (ein abgeschlossener trägt keine
  // laufende Frist). Fehlt eine Frist-Konfig, bleibt `faelligIso` leer — kein fabrizierter Wert.
  const faelligFuer = (
    procedureId: string,
    v: Vorgang<T>,
  ): string | undefined => {
    const cfg = stores.get(procedureId)?.config;
    const terminal = cfg?.statusMachine?.states?.find(
      (s) => s.key === v.status,
    )?.terminal;
    const fristTyp = cfg?.fristenTypen?.[0];
    if (terminal || !fristTyp) return undefined;
    return (
      faelligkeitAb(v.eingangIso, fristTyp.dauer, fristTyp.einheit) ?? undefined
    );
  };

  const baueAufgabe = (
    procedureId: string,
    v: Vorgang<T>,
    m: TaskMeta,
  ): Aufgabe => {
    const faelligIso = faelligFuer(procedureId, v);
    return {
      id: taskKey(procedureId, v.id),
      vorgangId: v.id,
      procedureId,
      tenantId: config.tenantId,
      authorityId: config.authorityId,
      jurisdictionId: config.jurisdictionId,
      titel: titelFuer(procedureId, v),
      ...(m.prioritaet ? { prioritaet: m.prioritaet } : {}),
      ...(m.zugewiesenAn ? { zugewiesenAn: m.zugewiesenAn } : {}),
      labels: m.labels,
      ...(faelligIso ? { faelligIso } : {}),
      sortRank: m.sortRank,
      version: m.version,
      ...(m.boardSpalte ? { boardSpalte: m.boardSpalte } : {}),
      ...(m.parentAufgabeId ? { parentAufgabeId: m.parentAufgabeId } : {}),
    };
  };

  /** Baut eine VERFAHRENS-FREIE Aufgabe (kein Vorgang, keine procedureId) aus Id + Metadaten. */
  const baueFreieAufgabe = (id: string, m: TaskMeta): Aufgabe => ({
    id,
    tenantId: config.tenantId,
    authorityId: config.authorityId,
    jurisdictionId: config.jurisdictionId,
    titel: freieTitel.get(id) ?? "Aufgabe",
    ...(m.prioritaet ? { prioritaet: m.prioritaet } : {}),
    ...(m.zugewiesenAn ? { zugewiesenAn: m.zugewiesenAn } : {}),
    labels: m.labels,
    sortRank: m.sortRank,
    version: m.version,
    ...(m.boardSpalte ? { boardSpalte: m.boardSpalte } : {}),
    ...(m.parentAufgabeId ? { parentAufgabeId: m.parentAufgabeId } : {}),
  });

  /** Filter für verfahrens-FREIE Aufgaben (ohne Vorgang): Verfahrens-/Status-Filter schließen sie aus (sie haben
   *  weder procedureId noch fachlichen Status); Priorität/Labels/Zuweisung/Suche greifen wie sonst. */
  const passtFilterFrei = (a: Aufgabe, filter?: TaskFilter): boolean => {
    if (!filter) return true;
    // Leeres Filter-Array = KEINE Beschränkung (nicht „alles ausschließen") — Parität zum HTTP-Port.
    if (filter.procedureId?.length || filter.status?.length) return false;
    if (
      filter.prioritaet?.length &&
      (a.prioritaet === undefined || !filter.prioritaet.includes(a.prioritaet))
    )
      return false;
    if (filter.labels && !filter.labels.every((l) => a.labels?.includes(l)))
      return false;
    if (filter.zugewiesenAn !== undefined) {
      if (filter.zugewiesenAn === "$niemand") {
        if (a.zugewiesenAn !== undefined) return false;
      } else if (a.zugewiesenAn !== filter.zugewiesenAn) return false;
    }
    if (filter.suche) {
      const q = filter.suche.toLowerCase().trim();
      if (q && !a.titel.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const passtFilter = (
    a: Aufgabe,
    v: Vorgang<T>,
    filter?: TaskFilter,
  ): boolean => {
    if (!filter) return true;
    if (
      filter.procedureId?.length &&
      (a.procedureId === undefined ||
        !filter.procedureId.includes(a.procedureId))
    )
      return false;
    if (filter.status?.length && !filter.status.includes(v.status))
      return false;
    if (
      filter.prioritaet?.length &&
      (a.prioritaet === undefined || !filter.prioritaet.includes(a.prioritaet))
    )
      return false;
    if (filter.labels && !filter.labels.every((l) => a.labels?.includes(l)))
      return false;
    if (filter.zugewiesenAn !== undefined) {
      if (filter.zugewiesenAn === "$niemand") {
        if (a.zugewiesenAn !== undefined) return false;
      } else if (a.zugewiesenAn !== filter.zugewiesenAn) return false;
    }
    if (filter.suche) {
      const q = filter.suche.toLowerCase().trim();
      const heu = `${a.titel} ${v.vorgangsnummer} ${v.status}`.toLowerCase();
      if (q && !heu.includes(q)) return false;
    }
    return true;
  };

  /** Meta einer Aufgabe mutieren (wirft, wenn unbekannt). Erhöht die Version bei jeder Änderung. */
  const mutMeta = (taskId: string, fn: (m: TaskMeta) => TaskMeta): void => {
    const ref = resolveTaskId(taskId);
    const meta = currentMeta();
    const m = ref ? meta[ref.key] : undefined;
    if (!ref || !m) throw new Error(`Aufgabe ${taskId} nicht gefunden`);
    metaStore.setState({ meta: { ...meta, [ref.key]: fn(m) } });
  };

  /** Wendet die passenden Automationen (verfahrensspezifisch + workspace-global) auf eine Aufgabe an. Referenziert
   *  `port` per Closure (zur AUFRUFZEIT definiert). Kein Rekursions-Trigger (Effekt-Übergänge lösen keine
   *  Automationen aus). */
  const laufeAutomationen = (
    taskId: string,
    procedureId: string,
    vorgang: Vorgang<T>,
    trigger: AutomationTrigger,
  ): void => {
    const cfg = stores.get(procedureId)?.config;
    const regeln = [
      ...(config.automationenGlobal ?? []),
      ...(cfg?.automationen ?? []),
    ];
    if (regeln.length === 0) return;
    const aufgabe = port.getTask(taskId);
    if (!aufgabe) return;
    const effekte = evalAutomationen(regeln, trigger, { aufgabe, vorgang });
    if (effekte.length > 0)
      wendeAutomationEffekteAn(port, aufgabe, effekte, {
        akteur: AUTOMATION_AKTEUR,
      });
  };

  const port: WorkspaceStore<T> = {
    config,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => version,

    verfahren: () => eintraege.filter((e) => e.aktiv !== false),
    configFor: (procedureId) =>
      procedureId ? stores.get(procedureId)?.config : undefined,

    // Der fachliche Port je Verfahren — mit gewrapptem `einreichen`, das dem neuen Vorgang Task-Metadaten gibt.
    portFor: (procedureId) => {
      if (!procedureId) return undefined; // verfahrens-freie Aufgabe hat keinen Vorgang-Port
      const cached = portCache.get(procedureId);
      if (cached) return cached;
      const s = stores.get(procedureId);
      if (!s) return undefined;
      const p: VorgangPort<T> = {
        list: s.list,
        get: s.get,
        lookupRegister: s.lookupRegister,
        uebergang: s.uebergang,
        einreichen: (antragsdaten, erbrachteNachweise) => {
          const v = s.einreichen(antragsdaten, erbrachteNachweise);
          const meta = currentMeta();
          const key = taskKey(procedureId, v.id);
          taskIndex.set(key, { pid: procedureId, vorgangId: v.id });
          metaStore.setState({
            meta: {
              ...meta,
              [key]: {
                prioritaet: undefined,
                zugewiesenAn: undefined,
                labels: [],
                sortRank: neuerRangAmEnde(meta),
                version: 1,
                boardSpalte: undefined,
              },
            },
          });
          // REGELN/HOOKS: die `beim-eingang`-Automationen (verfahrensspezifisch + workspace-global) auf die neue
          // Aufgabe anwenden — als SERVICE, mit Vier-Augen-Block. KEINE Rekursion: die Effekt-Übergänge laufen über
          // `taskUebergang`, das seinerseits KEINE Automationen auslöst.
          laufeAutomationen(key, procedureId, v, { art: "beim-eingang" });
          return v;
        },
      };
      portCache.set(procedureId, p);
      return p;
    },

    listTasks: (filter) => {
      const meta = currentMeta();
      const out: Aufgabe[] = [];
      for (const [pid, s] of stores) {
        for (const v of s.list()) {
          const m = meta[taskKey(pid, v.id)];
          if (!m) continue;
          const a = baueAufgabe(pid, v, m);
          if (passtFilter(a, v, filter)) out.push(a);
        }
      }
      // Verfahrens-freie Aufgaben mit einbeziehen (generische Projekt-/Workflow-Items).
      for (const [id] of freieTitel) {
        const m = meta[id];
        if (!m) continue;
        const a = baueFreieAufgabe(id, m);
        if (passtFilterFrei(a, filter)) out.push(a);
      }
      return out.sort((x, y) => rangVergleich(x.sortRank, y.sortRank));
    },

    getTask: (taskId) => {
      const ref = resolveTaskId(taskId);
      if (!ref) return undefined;
      const m = currentMeta()[ref.key];
      if (!m) return undefined;
      // Verfahrens-freie Aufgabe: kein Vorgang aufzulösen.
      if (!ref.pid) return baueFreieAufgabe(ref.key, m);
      const v = stores.get(ref.pid)?.get(ref.vorgangId!);
      return v ? baueAufgabe(ref.pid, v, m) : undefined;
    },

    assign: (taskId, zugewiesenAn, akteur) => {
      mutMeta(taskId, (m) => ({
        ...m,
        zugewiesenAn,
        version: m.version + 1,
      }));
      protokolliereAktivitaet(taskId, "task.zugewiesen", akteur, {
        zugewiesenAn: zugewiesenAn ?? null,
      });
    },

    setPrioritaet: (taskId, prioritaet, akteur) => {
      mutMeta(taskId, (m) => ({ ...m, prioritaet, version: m.version + 1 }));
      protokolliereAktivitaet(taskId, "task.prioritaet-geaendert", akteur, {
        prioritaet: prioritaet ?? null,
      });
    },

    addLabel: (taskId, label, akteur) => {
      mutMeta(taskId, (m) => ({
        ...m,
        labels: m.labels.includes(label) ? m.labels : [...m.labels, label],
        version: m.version + 1,
      }));
      protokolliereAktivitaet(taskId, "task.label-hinzugefuegt", akteur, {
        label,
      });
    },

    removeLabel: (taskId, label, akteur) => {
      mutMeta(taskId, (m) => ({
        ...m,
        labels: m.labels.filter((l) => l !== label),
        version: m.version + 1,
      }));
      protokolliereAktivitaet(taskId, "task.label-entfernt", akteur, { label });
    },

    move: (taskId, boardSpalte, rank, expectedVersion) =>
      mutMeta(taskId, (m) => {
        if (m.version !== expectedVersion)
          throw new Error(
            `Konflikt: Aufgabe ${taskId} wurde zwischenzeitlich geändert (erwartet v${expectedVersion}, ist v${m.version}).`,
          );
        return {
          ...m,
          boardSpalte,
          sortRank: rank,
          version: m.version + 1,
        };
      }),

    bulkAssign: (taskIds, zugewiesenAn, akteur) =>
      bulkBilanz(taskIds, (id) => port.assign(id, zugewiesenAn, akteur)),

    bulkPrioritaet: (taskIds, prioritaet, akteur) =>
      bulkBilanz(taskIds, (id) => port.setPrioritaet(id, prioritaet, akteur)),

    bulkLabel: (taskIds, label, akteur) =>
      bulkBilanz(taskIds, (id) => port.addLabel(id, label, akteur)),

    taskUebergang: (taskId, to, rolle, detail, akteur) => {
      const ref = resolveTaskId(taskId);
      const s = ref?.pid ? stores.get(ref.pid) : undefined;
      if (!ref || !ref.pid || !ref.vorgangId || !s)
        throw new Error(
          `Aufgabe ${taskId} keinem Verfahren zugeordnet — eine verfahrens-freie Aufgabe hat keinen fachlichen Status`,
        );
      // Wirft bei unerlaubtem Übergang / Rollen- / Vier-Augen-Verstoß → die Aktivität wird dann NICHT protokolliert.
      s.uebergang(ref.vorgangId, to, rolle, detail, akteur);
      protokolliereAktivitaet(taskId, "task.status-geaendert", akteur, {
        nach: to,
        ...(detail ? { detail } : {}),
      });
    },

    createFreieAufgabe: (titel, opts) => {
      const id = `frei::${(freieSeq += 1)}`;
      freieTitel.set(id, titel.trim() || "Aufgabe");
      const meta = currentMeta();
      metaStore.setState({
        meta: {
          ...meta,
          [id]: {
            prioritaet: opts?.prioritaet,
            zugewiesenAn: opts?.zugewiesenAn,
            labels: opts?.labels ? [...opts.labels] : [],
            sortRank: neuerRangAmEnde(meta),
            version: 1,
            boardSpalte: undefined,
            ...(opts?.parentAufgabeId
              ? { parentAufgabeId: opts.parentAufgabeId }
              : {}),
          },
        },
      });
      return baueFreieAufgabe(id, currentMeta()[id]!);
    },

    listKommentare: (taskId) => {
      const ref = resolveTaskId(taskId);
      return ref ? (kommentare.get(ref.key) ?? []).map((k) => ({ ...k })) : [];
    },
    addKommentar: (taskId, text, akteur) => {
      const ref = resolveTaskId(taskId);
      const wert = text.trim();
      if (!ref || !wert) return;
      const ts = nowIso();
      const liste = kommentare.get(ref.key) ?? [];
      liste.push({
        id: detailId("kommentar"),
        aufgabeId: ref.key,
        autorAkteurId: akteur ?? "sb.angemeldet",
        text: wert,
        erstelltIso: ts,
      });
      kommentare.set(ref.key, liste);
      // Ein Vermerk erzeugt eine Aktivität (wie server-seitig).
      const aliste = aktivitaet.get(ref.key) ?? [];
      aliste.push({
        id: detailId("aktivitaet"),
        aufgabeId: ref.key,
        akteurId: akteur ?? "sb.angemeldet",
        typ: "task.commented",
        zeitpunktIso: ts,
      });
      aktivitaet.set(ref.key, aliste);
      bump();
    },
    listAktivitaet: (taskId) => {
      const ref = resolveTaskId(taskId);
      return ref ? (aktivitaet.get(ref.key) ?? []).map((a) => ({ ...a })) : [];
    },
    listBeziehungen: (taskId) => {
      const ref = resolveTaskId(taskId);
      return ref ? (beziehungen.get(ref.key) ?? []).map((b) => ({ ...b })) : [];
    },
    addBeziehung: (taskId, verknuepfteAufgabeId, typ, akteur) => {
      const ref = resolveTaskId(taskId);
      if (!ref || ref.key === verknuepfteAufgabeId) return; // keine Selbstreferenz
      const liste = beziehungen.get(ref.key) ?? [];
      if (
        liste.some(
          (b) =>
            b.verknuepfteAufgabeId === verknuepfteAufgabeId && b.typ === typ,
        )
      )
        return; // kein Duplikat
      liste.push({
        id: detailId("beziehung"),
        aufgabeId: ref.key,
        verknuepfteAufgabeId,
        typ,
        erstelltIso: nowIso(),
      });
      beziehungen.set(ref.key, liste);
      protokolliereAktivitaet(taskId, "task.beziehung-hinzugefuegt", akteur, {
        verknuepfteAufgabeId,
        typ,
      });
      bump();
    },
    entferneBeziehung: (taskId, beziehungId) => {
      const ref = resolveTaskId(taskId);
      if (!ref) return;
      const liste = beziehungen.get(ref.key) ?? [];
      const gefiltert = liste.filter((b) => b.id !== beziehungId);
      if (gefiltert.length !== liste.length) {
        beziehungen.set(ref.key, gefiltert);
        bump();
      }
    },

    // ── Gespeicherte Ansichten ──
    listSavedViews: () =>
      gespeicherteAnsichten.map((v) => ({
        ...v,
        definition: { ...v.definition },
      })),
    saveView: (input) => {
      gespeicherteAnsichten.push({
        id: `view-${(viewSeq += 1)}`,
        label: input.label,
        layout: input.layout,
        scope: input.scope ?? "personal",
        definition: input.definition ? { ...input.definition } : {},
        erstelltIso: jetztIso(),
      });
      bump();
    },
    deleteView: (id) => {
      const i = gespeicherteAnsichten.findIndex((v) => v.id === id);
      if (i >= 0) {
        gespeicherteAnsichten.splice(i, 1);
        bump();
      }
    },

    // ── Verfahrensübergreifende Inbox / Triage (Phase 4) ──
    listInbox: (triageStatus = "pending") =>
      inbox
        .filter((i) => i.triageStatus === triageStatus)
        .sort((a, b) => b.eingangIso.localeCompare(a.eingangIso))
        .map((i) => ({ ...i, rohdaten: { ...i.rohdaten } })),

    // Wissensbasis (#20): der DEV-Store hat keine API — er liefert schlicht das statische Config-Wissen (defensive
    // Kopie). Der HTTP-Store lädt es aus /api/wiki nach; die Naht (synchron) ist für beide dieselbe.
    listWissen: () => (config.wissen ?? []).map((a) => ({ ...a })),

    triageInbox: (inboxId, status) => {
      const item = inbox.find((i) => i.id === inboxId);
      if (!item || item.triageStatus === "accepted") return;
      item.triageStatus = status;
      bump();
    },

    acceptInbox: (inboxId, akteur) => {
      const item = inbox.find((i) => i.id === inboxId);
      if (!item || item.triageStatus === "accepted") return undefined;
      const vorgangPort = port.portFor(item.procedureId);
      if (!vorgangPort) return undefined;
      // Annehmen = im richtigen Verfahren einen Vorgang (+ Aufgabe-Metadaten) erzeugen; der gewrappte `einreichen`
      // reiht die Aufgabe ans Board-Ende und feuert die `beim-eingang`-Automationen (als Service, mit Vier-Augen-Block).
      const v = vorgangPort.einreichen(item.rohdaten as never);
      const key = taskKey(item.procedureId, v.id);
      item.triageStatus = "accepted";
      item.vorgangId = v.id;
      item.aufgabeId = key;
      if (akteur) {
        // Aktivität am neuen Task protokollieren (append-only), Herkunft = Inbox-Annahme.
        const eintrag: AufgabeAktivitaet = {
          id: detailId("akt"),
          aufgabeId: key,
          akteurId: akteur,
          typ: "task.aus-inbox-angenommen",
          payload: { inboxId, quelle: item.quelle },
          zeitpunktIso: nowIso(),
        };
        aktivitaet.set(key, [...(aktivitaet.get(key) ?? []), eintrag]);
      }
      bump();
      return key;
    },
  };
  return port;
}
