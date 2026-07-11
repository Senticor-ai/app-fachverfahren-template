// fachverfahren-kit/http-workspace — der PROD-`WorkspacePort` über die server-autoritative Fastify-Domain-API (/api/*).
//
// Das Reaktivitätsproblem: der `WorkspacePort` ist SYNCHRON (die Bausteine lesen `listTasks()`/`getTask()` direkt,
// gebunden über `useSyncExternalStore` an `snapshot()`), HTTP ist ASYNCHRON. Dieser Port ist genau die im Store-
// Kommentar beschriebene „separate async Fetch-Schicht, die einen synchronen Client-Snapshot SPEIST": ein lokaler
// Cache (Aufgaben/Fälle/Inbox/Detail) beantwortet alle Lesezugriffe synchron; jede Änderung bumpt eine monotone
// Version → React liest neu. Metadaten-Mutationen (Zuweisung/Priorität/Label/Board) sind OPTIMISTISCH (sofortige
// Cache-Änderung + Bump, dann PATCH; bei Fehler Reconcile gegen die Server-Wahrheit). Fachliche Statuswechsel sind
// server-AUTORITATIV (kein optimistisches Umschreiben — der Server prüft Rolle/Vier-Augen/Locking und darf ablehnen;
// erst die Antwort aktualisiert den Cache).
//
// GRENZE (ehrlich benannt): `/api/cases` liefert den Fall OHNE strukturierte Antragsdaten (nur `state`), daher ist der
// `portFor().get()`-`Vorgang` eine STATUS-Projektion — genug für die verfahrensübergreifende Liste/Board, aber die
// vertiefte Prüfsicht (ReviewWorkspace) und der Bürger-Antrag (`einreichen`) über HTTP sind Folgeschritte. Verfahrens-
// freie Aufgaben (`createFreieAufgabe`) sind server-seitig nicht darstellbar (AppTask.procedure_id ist NOT NULL).
import type {
  Aufgabe,
  AufgabeAktivitaet,
  AufgabeBeziehung,
  AufgabeKommentar,
  BeziehungsTyp,
  BulkErgebnis,
  GespeicherteAnsicht,
  InboxItem,
  LeistungConfig,
  Prioritaet,
  TaskFilter,
  TriageStatus,
  VerfahrenEintrag,
  Vorgang,
  VorgangPort,
  WorkspaceConfig,
} from "./types.js";
import type { WorkspaceStore } from "./store.js";
import { createWorkspaceStore } from "./store.js";
import {
  aktivitaetVonApp,
  ansichtVonApp,
  aufgabeVonAppTask,
  beziehungVonApp,
  inboxVonAppIntake,
  kommentarVonApp,
  vorgangVonAppCase,
  type AppCaseDTO,
  type AppIntakeDTO,
  type AppSavedViewDTO,
  type AppTaskActivityDTO,
  type AppTaskCommentDTO,
  type AppTaskDTO,
  type AppTaskRelationDTO,
} from "./lib/http-mappers.js";

/** Fehler eines Domain-API-Aufrufs — trägt Statuscode + Kontext, damit `onError` sie einordnen kann. */
export class HttpWorkspaceError extends Error {
  constructor(
    readonly status: number,
    readonly aufruf: string,
    readonly rumpf: string,
  ) {
    super(`Domain-API ${aufruf} → ${status}${rumpf ? `: ${rumpf}` : ""}`);
    this.name = "HttpWorkspaceError";
  }
}

export interface HttpWorkspaceOptions {
  /** Basis-URL der Domain-API (z. B. `""` für same-origin oder `http://localhost:3000`). */
  baseUrl: string;
  /** Injizierbar für Tests (Fetch-Shim gegen `app.inject`); Default `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** DEV/Test: `x-actor-id`/`x-tenant-id`/… für den Header-Session-Resolver. PROD: leer (Cookie/OIDC). */
  headers?: Record<string, string>;
  /** PROD: `"include"`, damit das Session-Cookie mitgeht. */
  credentials?: RequestCredentials;
  /** Fehler-Senke (Netz/403/409/…): die App zeigt sie z. B. über die StatusRegion an. Ohne sie schlucken Mutationen
   *  ihren Fehler still (nur Reconcile). */
  onError?: (fehler: unknown, kontext: string) => void;
  /** Callback mit der Id der bei `acceptInbox` erzeugten Aufgabe (die synchrone Signatur kann sie nicht zurückgeben). */
  onAccepted?: (aufgabeId: string) => void;
}

/** Der `WorkspaceStore` über HTTP, plus `refresh()` zum manuellen Neuladen (für „Aktualisieren"-Affordances). */
export interface HttpWorkspaceStore<
  T = Record<string, unknown>,
> extends WorkspaceStore<T> {
  /** Lädt Aufgaben, Fälle und Inbox neu und bumpt die Version. */
  refresh(): Promise<void>;
}

interface CaseEintrag<T> {
  procedureId: string;
  /** Fall-Version für Optimistic-Locking beim Übergang — `Vorgang` selbst trägt sie nicht. */
  version: number;
  vorgang: Vorgang<T>;
}

interface DetailEintrag {
  kommentare: AufgabeKommentar[];
  aktivitaet: AufgabeAktivitaet[];
  beziehungen: AufgabeBeziehung[];
  geladen: boolean;
}

interface TaskPatchBody {
  priorityKey?: string | null;
  assigneeActorId?: string | null;
  labels?: string[];
  sortRank?: string;
  boardColumn?: string | null;
  expectedVersion?: number;
}

/** Baut den PROD-`WorkspacePort` über die Domain-API. Die `config` (Verfahren/Prioritäten/Labels) bleibt clientseitig
 *  (sie treibt das Rendern); die DATEN (Aufgaben/Fälle/Inbox) kommen aus `/api/*`. */
export function createHttpWorkspacePort<T = Record<string, unknown>>(
  config: WorkspaceConfig,
  opts: HttpWorkspaceOptions,
): HttpWorkspaceStore<T> {
  const baseUrl = opts.baseUrl;
  const basisHeaders = opts.headers ?? {};
  const onError = opts.onError;
  const onAccepted = opts.onAccepted;
  // Native `fetch` MUSS an globalThis gebunden aufgerufen werden (sonst „Illegal invocation" im Browser); ein
  // Test-Shim verträgt das Binden problemlos.
  const doFetch = (opts.fetch ?? globalThis.fetch).bind(
    globalThis,
  ) as typeof fetch;

  // ── Reaktivität: monotone Version + Listener (useSyncExternalStore-Vertrag) ──
  let version = 0;
  const listeners = new Set<() => void>();
  const bump = (): void => {
    version += 1;
    for (const l of listeners) l();
  };

  // ── Synchron beantwortbarer Cache ──
  let taskCache: Aufgabe[] = [];
  const caseCache = new Map<string, CaseEintrag<T>>();
  let inboxCache: InboxItem[] = [];
  let savedViewCache: GespeicherteAnsicht[] = [];
  const detailCache = new Map<string, DetailEintrag>();
  const detailLaedt = new Set<string>();
  // Fälle, deren Antragsdaten bereits per Einzel-Load (`GET /api/cases/:id`) angereichert wurden bzw. gerade laden.
  const antragsdatenGeladen = new Set<string>();
  const antragsdatenLaedt = new Set<string>();

  const enc = encodeURIComponent;
  const melde = (fehler: unknown, kontext: string): void =>
    onError?.(fehler, kontext);

  async function api<R>(
    method: string,
    pfad: string,
    body?: unknown,
  ): Promise<R> {
    const headers: Record<string, string> = { ...basisHeaders };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    if (opts.credentials) init.credentials = opts.credentials;
    const res = await doFetch(`${baseUrl}${pfad}`, init);
    if (!res.ok) {
      let rumpf = "";
      try {
        rumpf = await res.text();
      } catch {
        /* Rumpf ist optional für die Diagnose. */
      }
      throw new HttpWorkspaceError(res.status, `${method} ${pfad}`, rumpf);
    }
    if (res.status === 204) return undefined as R;
    return (await res.json()) as R;
  }

  // ── Lader (füllen den Cache, bumpen bei Erfolg) ──
  async function ladeAufgaben(): Promise<void> {
    const { tasks } = await api<{ tasks: AppTaskDTO[] }>("GET", "/api/tasks");
    const vorher = new Map(taskCache.map((t) => [t.id, t]));
    // MONOTONIE-GUARD (Cross-Task-Reconcile-Race): ein — womöglich stale — Voll-Reload darf einen bereits
    // server-bestätigten, NEUEREN Cache-Eintrag (höhere `version`) nicht überschreiben. `version` ist server-
    // autoritativ + monoton; ein Reload mit kleinerer Version spiegelt einen älteren Server-Stand → alten Eintrag
    // behalten. So verschwindet eine nebenläufig erfolgreich persistierte Änderung nicht bis zum nächsten refresh().
    taskCache = tasks.map((dto) => {
      const neu = aufgabeVonAppTask(dto);
      const alt = vorher.get(neu.id);
      return alt && alt.version > neu.version ? alt : neu;
    });
    bump();
  }
  async function ladeFaelle(): Promise<void> {
    const { cases } = await api<{ cases: AppCaseDTO[] }>("GET", "/api/cases");
    // Bereits per Detail-Load angereicherte Antragsdaten über den Voll-Reload BEWAHREN (die Listen-Route liefert sie
    // nicht) — sonst fiele ein Fall nach jedem refresh() auf die Status-Projektion zurück.
    const altAntrag = new Map(
      [...caseCache.entries()].map(([k, v]) => [k, v.vorgang.antragsdaten]),
    );
    caseCache.clear();
    for (const c of cases)
      caseCache.set(c.caseId, {
        procedureId: c.procedureId,
        version: c.version,
        vorgang: vorgangVonAppCase<T>(
          c,
          altAntrag.get(c.caseId) as T | undefined,
        ),
      });
    bump();
  }
  async function ladeInbox(): Promise<void> {
    const { items } = await api<{ items: AppIntakeDTO[] }>("GET", "/api/inbox");
    inboxCache = items.map(inboxVonAppIntake);
    bump();
  }
  async function ladeViews(): Promise<void> {
    const { views } = await api<{ views: AppSavedViewDTO[] }>(
      "GET",
      "/api/views",
    );
    savedViewCache = views.map(ansichtVonApp);
    bump();
  }
  // Einzel-Fall MIT Antragsdaten laden (`GET /api/cases/:id` liefert `{ case, antragsdaten }`) und den Cache-Eintrag
  // anreichern — so kann die vertiefte Prüfsicht (ReviewWorkspace) über HTTP die echten Antragsdaten zeigen.
  async function ladeFallDetail(caseId: string): Promise<void> {
    const { case: c, antragsdaten } = await api<{
      case: AppCaseDTO;
      antragsdaten: Record<string, unknown>;
    }>("GET", `/api/cases/${enc(caseId)}`);
    caseCache.set(c.caseId, {
      procedureId: c.procedureId,
      version: c.version,
      vorgang: vorgangVonAppCase<T>(c, antragsdaten as T),
    });
    antragsdatenGeladen.add(c.caseId);
    bump();
  }
  function ladeFallDetailEinmal(caseId: string): void {
    if (antragsdatenGeladen.has(caseId) || antragsdatenLaedt.has(caseId))
      return;
    antragsdatenLaedt.add(caseId);
    void ladeFallDetail(caseId)
      .catch((e) => melde(e, `fallDetail:${caseId}`))
      .finally(() => antragsdatenLaedt.delete(caseId));
  }
  async function refresh(): Promise<void> {
    // Fälle VOR/parallel zu Aufgaben — die Liste/Board leiten den Status aus dem Case-Cache ab.
    const ergebnisse = await Promise.allSettled([
      ladeAufgaben(),
      ladeFaelle(),
      ladeInbox(),
      ladeViews(),
    ]);
    for (const e of ergebnisse)
      if (e.status === "rejected") melde(e.reason, "refresh");
  }

  // Initial-Load anstoßen (asynchron; jeder Teil bumpt, sobald er da ist).
  void refresh();

  // ── Verfahren/Config/Port (clientseitig aus der übergebenen WorkspaceConfig) ──
  const verfahren = (): VerfahrenEintrag<T>[] =>
    config.verfahren.filter((e) => e.aktiv !== false) as VerfahrenEintrag<T>[];

  const configFor = (
    procedureId: string | undefined,
  ): LeistungConfig<T> | undefined => {
    if (!procedureId) return undefined;
    const e = config.verfahren.find(
      (v) => v.procedureId === procedureId && v.aktiv !== false,
    );
    return e?.config as LeistungConfig<T> | undefined;
  };

  const statusVon = (a: Aufgabe): string | undefined =>
    a.vorgangId ? caseCache.get(a.vorgangId)?.vorgang.status : undefined;

  // Fachlicher Statuswechsel — server-autoritativ (kein optimistisches Umschreiben): der Server prüft
  // Rolle/Vier-Augen/Locking und darf ablehnen. Genutzt von `taskUebergang` UND `portFor().uebergang`.
  function fuehreUebergang(caseId: string, to: string, detail?: string): void {
    const eintrag = caseCache.get(caseId);
    if (!eintrag) {
      melde(new Error(`Fall ${caseId} nicht im Cache`), "uebergang");
      return;
    }
    const body: { action: string; expectedVersion: number; detail?: string } = {
      action: to,
      expectedVersion: eintrag.version,
    };
    if (detail !== undefined) body.detail = detail;
    void (async () => {
      try {
        const { case: c } = await api<{ case: AppCaseDTO }>(
          "POST",
          `/api/cases/${enc(caseId)}/transitions`,
          body,
        );
        // Antragsdaten über den Statuswechsel BEWAHREN (ein Übergang ändert sie nicht; die Transition-Antwort trägt
        // sie nicht) — sonst fiele ein bereits angereicherter Fall zurück auf die Status-Projektion.
        const altAntrag = caseCache.get(c.caseId)?.vorgang.antragsdaten;
        caseCache.set(c.caseId, {
          procedureId: c.procedureId,
          version: c.version,
          vorgang: vorgangVonAppCase<T>(c, altAntrag as T | undefined),
        });
        bump();
        // Der Übergang kann Titel/Board der Aufgabe verändern → Aufgaben nachziehen.
        await ladeAufgaben().catch((e) => melde(e, "uebergang:reload"));
      } catch (err) {
        melde(err, `uebergang:${caseId}`);
        await ladeFaelle().catch((e) => melde(e, "uebergang:reconcile"));
      }
    })();
  }

  const portFor = (
    procedureId: string | undefined,
  ): VorgangPort<T> | undefined => {
    if (!procedureId) return undefined;
    if (!configFor(procedureId)) return undefined;
    return {
      list: () =>
        [...caseCache.values()]
          .filter((e) => e.procedureId === procedureId)
          .map((e) => e.vorgang),
      get: (id) => {
        // Lazy: beim ersten Zugriff die Antragsdaten des Falls nachladen (Einzel-Route), damit die Prüfsicht sie
        // zeigt. Synchron wird der aktuelle (ggf. noch status-only) Cache-Stand geliefert; der Load bumpt bei Ankunft.
        ladeFallDetailEinmal(id);
        return caseCache.get(id)?.vorgang;
      },
      einreichen: () => {
        throw new Error(
          "einreichen (Bürger-Antrag) wird über HTTP noch nicht unterstützt — die Antrags-Route ist ein Folgeschritt.",
        );
      },
      uebergang: (id, to, _rolle, detail) => fuehreUebergang(id, to, detail),
      lookupRegister: () => undefined,
    };
  };

  // ── Lesezugriffe (synchron aus dem Cache) ──
  function passt(a: Aufgabe, f: TaskFilter): boolean {
    if (f.procedureId && f.procedureId.length) {
      if (a.procedureId === undefined || !f.procedureId.includes(a.procedureId))
        return false;
    }
    if (f.status && f.status.length) {
      const s = statusVon(a);
      if (s === undefined || !f.status.includes(s)) return false;
    }
    if (f.prioritaet && f.prioritaet.length) {
      if (a.prioritaet === undefined || !f.prioritaet.includes(a.prioritaet))
        return false;
    }
    if (f.labels && f.labels.length) {
      // AND-Semantik wie der In-Memory-Store (store.ts passtFilter/passtFilterFrei nutzen `.every`) — DEV/PROD-Parität:
      // gefiltert wird auf Aufgaben, die ALLE geforderten Labels tragen (nicht irgendeines).
      const ls = a.labels ?? [];
      if (!f.labels.every((l) => ls.includes(l))) return false;
    }
    if (f.zugewiesenAn !== undefined) {
      if (f.zugewiesenAn === "$niemand") {
        if (a.zugewiesenAn !== undefined) return false;
      } else if (a.zugewiesenAn !== f.zugewiesenAn) return false;
    }
    if (f.suche && f.suche.trim()) {
      // Suchheuristik wie der In-Memory-Store: Titel + Vorgangsnummer + Status (letztere aus dem Fall-Cache),
      // damit `listTasks({suche})` in DEV (In-Memory) und PROD (HTTP) dieselbe Treffermenge liefert.
      const v = a.vorgangId ? caseCache.get(a.vorgangId)?.vorgang : undefined;
      const heu =
        `${a.titel} ${v?.vorgangsnummer ?? ""} ${v?.status ?? ""}`.toLowerCase();
      if (!heu.includes(f.suche.trim().toLowerCase())) return false;
    }
    return true;
  }

  const listTasks = (filter: TaskFilter = {}): Aufgabe[] =>
    taskCache
      .filter((a) => passt(a, filter))
      .sort((a, b) =>
        a.sortRank < b.sortRank ? -1 : a.sortRank > b.sortRank ? 1 : 0,
      );

  const getTask = (taskId: string): Aufgabe | undefined =>
    taskCache.find((t) => t.id === taskId);

  // ── Metadaten-Mutationen (optimistisch + PATCH + Reconcile-bei-Fehler) ──
  function mutiere(
    taskId: string,
    lokal: (t: Aufgabe) => Aufgabe,
    body: TaskPatchBody,
    kontext: string,
  ): void {
    if (!taskCache.some((t) => t.id === taskId)) {
      melde(new Error(`Aufgabe ${taskId} nicht im Cache`), kontext);
      return;
    }
    taskCache = taskCache.map((t) => (t.id === taskId ? lokal(t) : t));
    bump();
    void (async () => {
      try {
        const { task } = await api<{ task: AppTaskDTO }>(
          "PATCH",
          `/api/tasks/${enc(taskId)}`,
          body,
        );
        taskCache = taskCache.map((t) =>
          t.id === taskId ? aufgabeVonAppTask(task) : t,
        );
        bump();
      } catch (err) {
        melde(err, kontext);
        await ladeAufgaben().catch((e) => melde(e, `${kontext}:reconcile`));
      }
    })();
  }

  const assign = (taskId: string, zugewiesenAn: string | undefined): void =>
    mutiere(
      taskId,
      (t) => {
        const n: Aufgabe = { ...t };
        if (zugewiesenAn === undefined) delete n.zugewiesenAn;
        else n.zugewiesenAn = zugewiesenAn;
        return n;
      },
      { assigneeActorId: zugewiesenAn ?? null },
      "assign",
    );

  const setPrioritaet = (
    taskId: string,
    prioritaet: Prioritaet | undefined,
  ): void =>
    mutiere(
      taskId,
      (t) => {
        const n: Aufgabe = { ...t };
        if (prioritaet === undefined) delete n.prioritaet;
        else n.prioritaet = prioritaet;
        return n;
      },
      { priorityKey: prioritaet ?? null },
      "setPrioritaet",
    );

  const addLabel = (taskId: string, label: string): void => {
    const t = taskCache.find((x) => x.id === taskId);
    const neu = [...new Set([...(t?.labels ?? []), label])];
    mutiere(
      taskId,
      (x) => ({ ...x, labels: neu }),
      { labels: neu },
      "addLabel",
    );
  };

  const removeLabel = (taskId: string, label: string): void => {
    const t = taskCache.find((x) => x.id === taskId);
    const neu = (t?.labels ?? []).filter((l) => l !== label);
    mutiere(
      taskId,
      (x) => ({ ...x, labels: neu }),
      { labels: neu },
      "removeLabel",
    );
  };

  const move = (
    taskId: string,
    boardSpalte: string | undefined,
    rank: string,
    expectedVersion: number,
  ): void =>
    mutiere(
      taskId,
      (t) => {
        // Optimistischer Patch behält BEWUSST die alte `version` (kein +1): nur SERVER-bestätigte Einträge tragen
        // eine höhere Version — genau die Invariante, auf die sich der Monotonie-Guard in `ladeAufgaben` stützt.
        // Ein schneller zweiter Drag vor der Bestätigung sendet dann eine stale `expectedVersion` → 409 → Reconcile
        // (Karte kehrt zurück), was korrekt + selbstheilend ist.
        const n: Aufgabe = { ...t, sortRank: rank };
        if (boardSpalte === undefined) delete n.boardSpalte;
        else n.boardSpalte = boardSpalte;
        return n;
      },
      { boardColumn: boardSpalte ?? null, sortRank: rank, expectedVersion },
      "move",
    );

  // Bulk = N unabhängige Einzelaktionen (NIE eine Bulk-Entscheidung). Die synchrone Bilanz ist optimistisch:
  // unbekannte Aufgaben werden sofort als Fehler gemeldet, der Rest läuft als Einzel-PATCH mit eigenem Reconcile.
  const bulkAssign = (
    taskIds: string[],
    zugewiesenAn: string | undefined,
  ): BulkErgebnis[] =>
    taskIds.map((id) => {
      if (!taskCache.some((t) => t.id === id))
        return { taskId: id, ok: false, fehler: "unbekannte Aufgabe" };
      assign(id, zugewiesenAn);
      return { taskId: id, ok: true };
    });

  const taskUebergang = (
    taskId: string,
    to: string,
    _rolle: string,
    detail?: string,
  ): void => {
    const t = taskCache.find((x) => x.id === taskId);
    if (!t || !t.vorgangId) {
      melde(
        new Error(`Aufgabe ${taskId} hat keinen Vorgang (Übergang unmöglich)`),
        "taskUebergang",
      );
      return;
    }
    fuehreUebergang(t.vorgangId, to, detail);
  };

  // ── Aufgaben-Detail (Vermerke/Aktivität/Beziehungen) — lazy read-through ──
  function detailFuer(taskId: string): DetailEintrag {
    let d = detailCache.get(taskId);
    if (!d) {
      d = { kommentare: [], aktivitaet: [], beziehungen: [], geladen: false };
      detailCache.set(taskId, d);
    }
    return d;
  }
  async function ladeDetail(taskId: string): Promise<void> {
    const [k, a, r] = await Promise.all([
      api<{ comments: AppTaskCommentDTO[] }>(
        "GET",
        `/api/tasks/${enc(taskId)}/comments`,
      ),
      api<{ activity: AppTaskActivityDTO[] }>(
        "GET",
        `/api/tasks/${enc(taskId)}/activity`,
      ),
      api<{ relations: AppTaskRelationDTO[] }>(
        "GET",
        `/api/tasks/${enc(taskId)}/relations`,
      ),
    ]);
    detailCache.set(taskId, {
      kommentare: k.comments.map(kommentarVonApp),
      aktivitaet: a.activity.map(aktivitaetVonApp),
      beziehungen: r.relations.map(beziehungVonApp),
      geladen: true,
    });
    bump();
  }
  function ladeDetailEinmal(taskId: string): void {
    const d = detailFuer(taskId);
    if (d.geladen || detailLaedt.has(taskId)) return;
    detailLaedt.add(taskId);
    void ladeDetail(taskId)
      .catch((e) => melde(e, `detail:${taskId}`))
      .finally(() => detailLaedt.delete(taskId));
  }
  function neuLadenDetail(taskId: string): void {
    const d = detailFuer(taskId);
    d.geladen = false;
    detailLaedt.delete(taskId);
    ladeDetailEinmal(taskId);
  }

  const listKommentare = (taskId: string): AufgabeKommentar[] => {
    ladeDetailEinmal(taskId);
    return detailFuer(taskId).kommentare;
  };
  const addKommentar = (taskId: string, text: string): void => {
    void (async () => {
      try {
        await api("POST", `/api/tasks/${enc(taskId)}/comments`, { body: text });
        neuLadenDetail(taskId);
      } catch (err) {
        melde(err, "addKommentar");
      }
    })();
  };
  const listAktivitaet = (taskId: string): AufgabeAktivitaet[] => {
    ladeDetailEinmal(taskId);
    return detailFuer(taskId).aktivitaet;
  };
  const listBeziehungen = (taskId: string): AufgabeBeziehung[] => {
    ladeDetailEinmal(taskId);
    return detailFuer(taskId).beziehungen;
  };
  const addBeziehung = (
    taskId: string,
    verknuepfteAufgabeId: string,
    typ: BeziehungsTyp,
  ): void => {
    void (async () => {
      try {
        await api("POST", `/api/tasks/${enc(taskId)}/relations`, {
          relatedTaskId: verknuepfteAufgabeId,
          relationType: typ,
        });
        neuLadenDetail(taskId);
      } catch (err) {
        melde(err, "addBeziehung");
      }
    })();
  };
  const entferneBeziehung = (taskId: string, beziehungId: string): void => {
    void (async () => {
      try {
        await api(
          "DELETE",
          `/api/tasks/${enc(taskId)}/relations/${enc(beziehungId)}`,
        );
        neuLadenDetail(taskId);
      } catch (err) {
        melde(err, "entferneBeziehung");
      }
    })();
  };

  // ── Inbox / Triage ──
  const listInbox = (triageStatus: TriageStatus = "pending"): InboxItem[] =>
    // Neueste zuerst — wie der In-Memory-Store (DEV/PROD-Parität). `.filter()` liefert ein frisches Array, daher
    // mutiert `.sort()` den `inboxCache` NICHT.
    inboxCache
      .filter((i) => i.triageStatus === triageStatus)
      .sort((a, b) => b.eingangIso.localeCompare(a.eingangIso));

  const triageInbox = (
    inboxId: string,
    status: Exclude<TriageStatus, "accepted">,
  ): void => {
    inboxCache = inboxCache.map((i) =>
      i.id === inboxId ? { ...i, triageStatus: status } : i,
    );
    bump();
    void (async () => {
      try {
        const { item } = await api<{ item: AppIntakeDTO }>(
          "POST",
          `/api/inbox/${enc(inboxId)}/triage`,
          { status },
        );
        inboxCache = inboxCache.map((i) =>
          i.id === inboxId ? inboxVonAppIntake(item) : i,
        );
        bump();
      } catch (err) {
        melde(err, "triageInbox");
        await ladeInbox().catch((e) => melde(e, "triageInbox:reconcile"));
      }
    })();
  };

  // Annahme ist ASYNCHRON (erzeugt Vorgang + Aufgabe server-atomar). Die synchrone Signatur kann die neue Id nicht
  // liefern → sie kommt über `opts.onAccepted`; der Rückgabewert ist `undefined`. Der Eingang wird optimistisch als
  // angenommen markiert.
  const acceptInbox = (inboxId: string): string | undefined => {
    // Idempotenz-Guard: unbekannter oder bereits angenommener Eingang ⇒ kein zweiter POST (der Server würfe sonst
    // 409 „already-accepted"; ein Doppel-Klick soll gar nicht erst zwei Annahmen auslösen).
    const vorhanden = inboxCache.find((i) => i.id === inboxId);
    if (!vorhanden) {
      melde(new Error(`Eingang ${inboxId} nicht im Cache`), "acceptInbox");
      return undefined;
    }
    if (vorhanden.triageStatus === "accepted") return undefined;
    inboxCache = inboxCache.map((i) =>
      i.id === inboxId ? { ...i, triageStatus: "accepted" } : i,
    );
    bump();
    void (async () => {
      try {
        const created = await api<{ case: AppCaseDTO; task: AppTaskDTO }>(
          "POST",
          `/api/inbox/${enc(inboxId)}/accept`,
        );
        caseCache.set(created.case.caseId, {
          procedureId: created.case.procedureId,
          version: created.case.version,
          vorgang: vorgangVonAppCase<T>(created.case),
        });
        taskCache = [...taskCache, aufgabeVonAppTask(created.task)];
        inboxCache = inboxCache.map((i) =>
          i.id === inboxId
            ? {
                ...i,
                triageStatus: "accepted",
                aufgabeId: created.task.taskId,
                vorgangId: created.case.caseId,
              }
            : i,
        );
        bump();
        onAccepted?.(created.task.taskId);
      } catch (err) {
        melde(err, "acceptInbox");
        await Promise.allSettled([ladeInbox(), ladeAufgaben()]);
      }
    })();
    return undefined;
  };

  const createFreieAufgabe = (): Aufgabe => {
    // Server-seitig nicht darstellbar: `app_tasks.procedure_id` ist NOT NULL (jede Aufgabe hängt an einem Verfahren).
    // Verfahrens-freie Aufgaben sind bewusst ein DEV/In-Memory-Feature; PROD-Unterstützung erforderte eine Migration.
    throw new Error(
      "createFreieAufgabe wird über HTTP nicht unterstützt (app_tasks.procedure_id ist NOT NULL) — verfahrens-freie Aufgaben brauchen zuerst ein nullbares Verfahren im Server-Schema.",
    );
  };

  // ── Gespeicherte Ansichten (optimistisch + POST/DELETE gegen /api/views) ──
  const listSavedViews = (): GespeicherteAnsicht[] => savedViewCache;
  const saveView = (input: {
    label: string;
    layout: string;
    scope?: "personal" | "geteilt";
    definition?: Record<string, unknown>;
  }): void => {
    void (async () => {
      try {
        const { view } = await api<{ view: AppSavedViewDTO }>(
          "POST",
          "/api/views",
          {
            label: input.label,
            layout: input.layout,
            ...(input.scope ? { scope: input.scope } : {}),
            ...(input.definition ? { definition: input.definition } : {}),
          },
        );
        savedViewCache = [...savedViewCache, ansichtVonApp(view)];
        bump();
      } catch (err) {
        melde(err, "saveView");
      }
    })();
  };
  const deleteView = (id: string): void => {
    const vorher = savedViewCache;
    savedViewCache = savedViewCache.filter((v) => v.id !== id);
    bump();
    void (async () => {
      try {
        await api("DELETE", `/api/views/${enc(id)}`);
      } catch (err) {
        melde(err, "deleteView");
        savedViewCache = vorher;
        bump();
      }
    })();
  };

  return {
    config,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => version,
    refresh,
    verfahren,
    configFor,
    portFor,
    listTasks,
    getTask,
    createFreieAufgabe,
    assign,
    setPrioritaet,
    addLabel,
    removeLabel,
    move,
    bulkAssign,
    taskUebergang,
    listKommentare,
    addKommentar,
    listAktivitaet,
    listBeziehungen,
    addBeziehung,
    entferneBeziehung,
    listSavedViews,
    saveView,
    deleteView,
    listInbox,
    triageInbox,
    acceptInbox,
  };
}

/** Umgebungs-Wahl: mit `apiBaseUrl` den PROD-HTTP-Port, sonst den In-Memory-DEV-Store — die EINE austauschbare Naht.
 *  Rein (liest KEIN `import.meta.env`/`process.env` selbst — die App reicht die Werte herein), damit das Kit
 *  build-tool-neutral bleibt. */
export function createWorkspacePortFromEnv<T = Record<string, unknown>>(
  config: WorkspaceConfig,
  env: {
    apiBaseUrl?: string | undefined;
    fetch?: typeof fetch;
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    onError?: (fehler: unknown, kontext: string) => void;
    onAccepted?: (aufgabeId: string) => void;
  } = {},
  storeOpts: { jahr?: number; now?: () => string } = {},
): WorkspaceStore<T> {
  if (env.apiBaseUrl && env.apiBaseUrl.trim()) {
    return createHttpWorkspacePort<T>(config, {
      baseUrl: env.apiBaseUrl,
      ...(env.fetch ? { fetch: env.fetch } : {}),
      ...(env.headers ? { headers: env.headers } : {}),
      ...(env.credentials ? { credentials: env.credentials } : {}),
      ...(env.onError ? { onError: env.onError } : {}),
      ...(env.onAccepted ? { onAccepted: env.onAccepted } : {}),
    });
  }
  return createWorkspaceStore<T>(config, storeOpts);
}
