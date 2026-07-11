// server/automation-engine — die SERVER-AUTORITATIVE Ausführung der deklarativen Regeln/Hooks (Phase 5).
//
// Roundtrip: fällige Outbox-Events CLAIMEN (Store, `FOR UPDATE SKIP LOCKED`) → passende aktive Regeln laden →
// Bedingung REIN auswerten (node-safe, `automation-eval`) → Effekte durch DIESELBE Kette ausführen wie ein Mensch
// (Status-Übergang via `executeCaseTransition` = RBAC + Locking + append-only Audit; Metadaten via
// `taskStore.patchTask`) → jeden Lauf IDEMPOTENT protokollieren.
//
// HARTE INVARIANTEN:
//  1) VIER-AUGEN: die Automation darf NIE eines der zwei Augen sein. `executeCaseTransition` prüft nur
//     `actor != previousApprover` — ein Maschinen-Akteur würde diese Prüfung BESTEHEN. Deshalb blockiert die Engine
//     jeden `requiresFourEyes`-Übergang HART VOR der Policy (run `blocked`), statt sich auf die Policy zu verlassen.
//  2) FAIL-CLOSED: eine mutierende Regel mit einer Bedingung, die der node-safe Evaluator nicht vollständig
//     versteht, wird NICHT ausgeführt (run `skipped`/unsupported-condition).
//  3) REKURSIONS-SPERRE: Events, die die Automation selbst erzeugt hat (`payload.actor == automation.service`),
//     werden übersprungen — kein Event-Sturm.
import type {
  AppAutomationEvent,
  AppAutomationRule,
  AppCase,
  AutomationRunStatus,
  AutomationStore,
  CaseStore,
  TaskStore,
} from "@senticor/app-store-postgres";
import {
  AUTOMATION_SERVICE_ACTOR,
  executeCaseTransition,
  type Clock,
  type IdGenerator,
  type PolicyEngine,
  type ProcedureCatalog,
} from "@senticor/public-sector-sdk";
import {
  bedingungUnterstuetzt,
  evalBedingungNodeSafe,
} from "./automation-eval.js";

/** Der Dienst-Akteur für automationsgetriebene Mutationen — nie ein „Auge" einer Vier-Augen-Entscheidung.
 *  Re-Export der SDK-Wahrheit, damit Aufrufer/Tests EINEN Wert teilen. */
export const AUTOMATION_ACTOR = AUTOMATION_SERVICE_ACTOR;

/** Zustell-Obergrenze (Dead-Letter, Skalierungsplan #9): wie oft ein Event geclaimt werden darf, bevor es als POISON
 *  quarantänt wird. `attempts` (aus dem at-least-once-Lease, #8) zählt jeden Claim; ein Event, dessen Behandlung den
 *  Prozess wiederholt tötet, würde ohne diese Grenze nach jedem Lease-Ablauf endlos re-claimt (Crash-Loop). Grosszügig,
 *  damit ein legitim langsames Event (mehrfacher Lease-Ablauf bei paralleler Verarbeitung) nicht fälschlich landet. */
export const DEFAULT_MAX_ATTEMPTS = 10;

export interface AutomationEngineDeps {
  automationStore: AutomationStore;
  caseStore: CaseStore;
  taskStore?: TaskStore;
  policy: PolicyEngine;
  catalog: ProcedureCatalog;
  now: Clock;
  newId: IdGenerator;
  procedureVersion: string;
  /** Zustell-Obergrenze vor Dead-Letter (#9). Fehlt ⇒ `DEFAULT_MAX_ATTEMPTS`. */
  maxAttempts?: number;
}

export interface ProcessResult {
  claimed: number;
  applied: number;
  blocked: number;
  skipped: number;
  failed: number;
  /** Als POISON quarantänte Events (attempts > maxAttempts) — terminal markiert, NICHT verarbeitet (#9). */
  deadLettered: number;
}

export interface EmitDeadlineResult {
  /** In bezuschlagten Skopes gefundene Aufgaben mit erreichter Frist (`dueAt ≤ now`). */
  scanned: number;
}

export type AutomationTickResult = EmitDeadlineResult & ProcessResult;

/** EIN Automations-Tick: ZUERST der zeitgetriebene Deadline-Scanner (frist-erreicht → Outbox), DANN die Verarbeitung
 *  der fälligen Outbox-Events (inkl. der eben eingereihten). Die geteilte Tick-Einheit für BEIDE Betriebsarten — den
 *  in-process-Poller (Web-Prozess, opt-in) UND den eigenständigen, horizontal skalierbaren Worker-Prozess; mehrere
 *  Consumer koordinieren über `FOR UPDATE SKIP LOCKED` (kein Doppel-Claim). */
export async function runAutomationTick(
  deps: AutomationEngineDeps,
): Promise<AutomationTickResult> {
  const scan = await emitDueDeadlineEvents(deps);
  const res = await processDueAutomationEvents(deps);
  return { ...scan, ...res };
}

const FRIST_TRIGGER = "frist-erreicht";

/** Sentinel-`rule_id` für einen ORCHESTRIERUNGS-Fehler (z. B. `listRules`-Wurf), bevor eine konkrete Regel bekannt
 *  ist. `app_automation_runs.rule_id` trägt keinen Fremdschlüssel, daher ist dieser Marker schema-sicher; er macht
 *  den sonst stillen Verlust eines geclaimten Events im revisionssicheren Protokoll SICHTBAR. */
const ORCHESTRATION_RULE_ID = "__orchestration__";
/** Grund-Marker eines Dead-Letter-Laufs (#9) — im `app_automation_runs`-Protokoll als `failed` mit diesem `reason`. */
const POISON_REASON = "poison-max-attempts";

/** ZEITGETRIEBENER Deadline-Scanner (der fehlende Prozess-Ort für `frist-erreicht`): findet Aufgaben mit ERREICHTER
 *  Frist (`dueAt ≤ now`) in Verfahren mit AKTIVER `frist-erreicht`-Regel und reiht je Frist EIN Outbox-Event ein.
 *  Die event_id ist DETERMINISTISCH (`frist::<taskId>::<dueAt>`) → idempotent: ein erneuter Scan reiht nichts nach
 *  (kein Doppelfeuern), eine VERSCHOBENE Frist erzeugt eine eigene, neue Fälligkeit. `scheduledFor = dueAt` (bereits
 *  fällig → sofort claimbar). Die Regel-Auswertung/-Ausführung übernimmt danach `processDueAutomationEvents` wie bei
 *  jedem Trigger. Ohne `taskStore` ist der Scanner ein No-op. */
export async function emitDueDeadlineEvents(
  deps: AutomationEngineDeps,
  options: { limit?: number } = {},
): Promise<EmitDeadlineResult> {
  const taskStore = deps.taskStore;
  if (!taskStore) return { scanned: 0 };
  const now = deps.now();
  const scopes = await deps.automationStore.listActiveRuleScopes(FRIST_TRIGGER);
  let scanned = 0;
  for (const scope of scopes) {
    // BEHÖRDEN-scoped abfragen, damit das LIMIT-Fenster pro Behörde greift (sonst könnten fällige Fristen einer
    // anderen Behörde desselben Verfahrens das Fenster sättigen und diese Fristen still verdrängen). listDueTasks
    // liefert nur NOCH NICHT emittierte Fristen (deadline_emitted_at < dueAt) — kein Re-Scan-Sturm.
    const due = await taskStore.listDueTasks({
      tenantId: scope.tenantId,
      authorityId: scope.authorityId,
      procedureId: scope.procedureId,
      now,
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
    });
    for (const task of due) {
      if (task.dueAt === null) continue;
      // dueAt kanonisieren, damit event_id/scheduledFor laufzeitstabil sind (InMemory-Rohstring vs. Postgres-iso())
      // und der String-Vergleich in beiden Laufzeiten deckungsgleich ist.
      const faellig = new Date(task.dueAt).toISOString();
      scanned += 1;
      await deps.automationStore.enqueueEvent({
        eventId: `frist::${task.taskId}::${faellig}`,
        tenantId: scope.tenantId,
        authorityId: scope.authorityId,
        procedureId: scope.procedureId,
        caseId: task.caseId,
        taskId: task.taskId,
        triggerEvent: FRIST_TRIGGER,
        payload: { fristFaellig: faellig },
        scheduledFor: faellig,
        createdAt: now,
        processedAt: null,
      });
      // Diese Frist als emittiert markieren → nächster Tick re-scannt sie nicht (kein Event-/Write-Sturm). Der Marker
      // nutzt den ROHEN dueAt (nicht die kanonische Form), damit das Ausschluss-Prädikat `deadline_emitted_at < dueAt`
      // in beiden Laufzeiten exakt greift (gleiche Vergleichsbasis).
      await taskStore.markDeadlineEmitted({
        tenantId: scope.tenantId,
        taskId: task.taskId,
        at: task.dueAt,
      });
    }
  }
  return { scanned };
}

interface Aktion {
  art: string;
  [k: string]: unknown;
}

const MUTIERENDE_ARTEN: ReadonlySet<string> = new Set([
  "setze-feld",
  "setze-prioritaet",
  "zuweisen",
  "label-hinzufuegen",
  "status-uebergang",
  "aufgabe-erstellen",
]);

function aktionen(rule: AppAutomationRule): Aktion[] {
  return rule.actions
    .filter(
      (a): a is Aktion =>
        typeof a === "object" &&
        a !== null &&
        typeof (a as Aktion).art === "string",
    )
    .map((a) => a as Aktion);
}

function istMutierend(rule: AppAutomationRule): boolean {
  return aktionen(rule).some((a) => MUTIERENDE_ARTEN.has(a.art));
}

/** Baut die Auswertungs-Daten: Event-Payload + `$`-projizierte Fall-/Aufgaben-Metadaten (wie `bauKontext` im Kit). */
function bauDaten(
  event: AppAutomationEvent,
  appCase: AppCase | undefined,
): Record<string, unknown> {
  return {
    ...event.payload,
    $status: appCase?.state,
    $procedureId: event.procedureId,
  };
}

/**
 * Verarbeitet die fälligen Automations-Events genau einmal. Reine Orchestrierung — jede Zustandsänderung geht durch
 * die geprüfte Domain-Kette, jeder Lauf wird idempotent protokolliert.
 */
export async function processDueAutomationEvents(
  deps: AutomationEngineDeps,
  opts: { limit?: number } = {},
): Promise<ProcessResult> {
  const result: ProcessResult = {
    claimed: 0,
    applied: 0,
    blocked: 0,
    skipped: 0,
    failed: 0,
    deadLettered: 0,
  };
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxEvents = opts.limit ?? 50;

  // EINZELN claimen (limit 1) statt eines grossen Batches — ENTSCHEIDEND für den Dead-Letter-Cap (#9): ein PROZESS-
  // Crash ist so EINDEUTIG dem GERADE verarbeiteten Event zuzuordnen. Bei Batch-Claim würden co-geclaimte GESUNDE
  // Events denselben attempts-Anstieg erben (der Crash tötet den Prozess, bevor sie überhaupt an die Reihe kommen)
  // und nach genug Zyklen fälschlich mit-quarantänt — ein stiller, terminaler Verlust legitimer Effekte. Mit limit 1
  // steigt `attempts` nur beim tatsächlich verarbeiteten Event; ein co-fälliges gesundes Event wird gar nicht erst
  // geclaimt, solange das Poison-Event vorn steht. `maxEvents` begrenzt die Tick-Dauer; der nächste Tick nimmt den
  // Rest (Durchsatz-Kompromiss: mehr Claim-Round-Trips, dafür korrekte Crash-Zuordnung).
  for (let verarbeitet = 0; verarbeitet < maxEvents; verarbeitet += 1) {
    const claimed = await deps.automationStore.claimDueEvents({
      now: deps.now(),
      limit: 1,
    });
    const event = claimed[0];
    if (!event) break;
    result.claimed += 1;

    // PER-EVENT-ISOLATION: ein Orchestrierungs-Fehler bei EINEM Event (transienter `listRules`-Wurf oder ein
    // `record`-Wurf in `applyRule` bei DB-Störung) den einen ehrlich als `failed` zählen + best-effort auditieren;
    // der Tick läuft weiter.
    try {
      // DEAD-LETTER (#9): hat das Event die Zustell-Obergrenze überschritten (wiederholter Prozess-Crash → attempts
      // steigt bei jedem Lease-Ablauf), NICHT erneut verarbeiten — das löste denselben Crash aus. Der attempts-Check
      // steht VOR jeder Payload-Verarbeitung, deshalb bricht er den Crash-Loop, den at-least-once (#8) sonst offen
      // liesse. Terminal quarantänen (markProcessed unten) + sichtbar als poison-Lauf protokollieren.
      if (event.attempts !== undefined && event.attempts > maxAttempts) {
        result.deadLettered += 1;
        await protokollierePoisonEvent(deps, event);
      } else if (event.payload["actor"] !== AUTOMATION_ACTOR) {
        // Rekursions-Sperre: von der Automation selbst erzeugte Events nicht erneut verarbeiten. WICHTIG: NICHT per
        // `continue` überspringen — das Event MUSS unten terminal markiert werden, sonst liefe die Lease ab und es
        // würde endlos neu geclaimt (Übersprungen ≠ unbearbeitet). Der Sprung ist eine Entscheidung, kein Crash.
        const rules = await deps.automationStore.listRules({
          tenantId: event.tenantId,
          // Behörden-Scope: eine Regel EINER Behörde darf nicht auf Events einer ANDEREN Behörde desselben Mandanten feuern.
          authorityId: event.authorityId,
          procedureId: event.procedureId,
          triggerEvent: event.triggerEvent,
          activeOnly: true,
        });

        for (const rule of rules) {
          const status = await applyRule(deps, event, rule);
          if (status) result[status] += 1;
        }
      }
    } catch (error) {
      result.failed += 1;
      await protokolliereOrchestrierungsFehler(deps, event, error);
    }

    // TERMINAL (Erfolg, Rekursions-Sperre ODER deterministischer Fehler): die Lease auflösen (`processed_at = now`),
    // damit KEIN Re-Claim erfolgt — ein deterministischer Fehler wiederholt sich sonst zum Event-Sturm. AT-LEAST-ONCE
    // greift NUR beim PROZESS-Crash, der diese Zeile nie erreicht (Lease läuft ab → Wiederaufnahme). Best-effort:
    // schlägt `markProcessed` fehl (DB-Störung), bleibt das Event geleast und wird nach Ablauf erneut aufgenommen.
    // DOPPEL-EFFEKTE beim Re-Claim: die aktuellen Aktionen sind dagegen sicher, weil sie IDEMPOTENT bzw.
    // OPTIMISTIC-LOCK-geschützt sind (`status-uebergang` via expectedVersion; `setze-prioritaet`/`zuweisen`/`label`
    // wertsetzend). `recordRun` (ON CONFLICT) dedupliziert ZUSÄTZLICH die Audit-Zeile — es riegelt NICHT die
    // Effekt-Ausführung ab. Eine künftige nicht-idempotente Aktion bräuchte zusätzlich einen Effekt-Vorab-Riegel
    // (`recordRun` als Claim VOR den Effekten) — offene Folge-Härtung.
    try {
      await deps.automationStore.markProcessed({
        eventId: event.eventId,
        now: deps.now(),
      });
    } catch {
      /* Re-Claim nach Lease-Ablauf ist der sichere Fallback; den Tick nicht abbrechen. */
    }
  }
  return result;
}

/** Best-effort-Audit für einen ORCHESTRIERUNGS-Fehler, bevor/ohne dass eine konkrete Regel bekannt ist — macht den
 *  sonst stillen Verlust eines geclaimten Events sichtbar. Selbst best-effort: schlägt auch dieses `recordRun` fehl
 *  (fortbestehende DB-Störung), wird der Fehler geschluckt, damit der restliche Batch dennoch weiterläuft. */
async function protokolliereOrchestrierungsFehler(
  deps: AutomationEngineDeps,
  event: AppAutomationEvent,
  error: unknown,
): Promise<void> {
  try {
    await deps.automationStore.recordRun({
      runId: `run.${deps.newId()}`,
      ruleId: ORCHESTRATION_RULE_ID,
      eventId: event.eventId,
      idempotencyKey: `${event.eventId}::${ORCHESTRATION_RULE_ID}`,
      status: "failed",
      detail: {
        error: String(error instanceof Error ? error.message : error),
        reason: "orchestration-error",
      },
      createdAt: deps.now(),
    });
  } catch {
    /* Audit ist best-effort — bei fortbestehender DB-Störung wenigstens den Batch-Rest nicht abbrechen. */
  }
}

/** Best-effort-Protokoll eines DEAD-LETTER/POISON-Events (#9): das Event hat die Zustell-Obergrenze überschritten und
 *  wird terminal quarantänt (markProcessed) statt erneut verarbeitet — ein `failed`-Lauf mit `reason=poison-max-attempts`
 *  macht das sichtbar/auswertbar (nicht stiller Verlust). Idempotenz-Key trägt den Grund, damit er sich nicht mit einem
 *  Orchestrierungs-Fehler-Lauf desselben Events kollidiert. */
async function protokollierePoisonEvent(
  deps: AutomationEngineDeps,
  event: AppAutomationEvent,
): Promise<void> {
  try {
    await deps.automationStore.recordRun({
      runId: `run.${deps.newId()}`,
      ruleId: ORCHESTRATION_RULE_ID,
      eventId: event.eventId,
      idempotencyKey: `${event.eventId}::${POISON_REASON}`,
      status: "failed",
      detail: {
        reason: POISON_REASON,
        attempts: event.attempts ?? null,
        triggerEvent: event.triggerEvent,
      },
      createdAt: deps.now(),
    });
  } catch {
    /* Audit ist best-effort — die terminal-Markierung quarantänt das Event ohnehin, kein Re-Claim. */
  }
}

async function applyRule(
  deps: AutomationEngineDeps,
  event: AppAutomationEvent,
  rule: AppAutomationRule,
): Promise<Exclude<keyof ProcessResult, "claimed"> | undefined> {
  const idempotencyKey = `${event.eventId}::${rule.ruleId}`;
  // Teil-Effekte werden hier akkumuliert, damit der catch bei einem Wurf die bereits (dauerhaft) committeten
  // Vor-Effekte kennt und EHRLICH protokollieren kann.
  const effekte: string[] = [];
  // GESAMTE Verarbeitung im try: nicht nur die Effekt-Ausführung, sondern AUCH die Orchestrierungs-Schritte
  // (`getCase`, die Guard-`record`-Aufrufe) müssen bei einem transienten Wurf als „failed" auditiert werden — sonst
  // verschwände ein bereits geclaimtes Event spurlos aus dem revisionssicheren Lauf-Protokoll (stiller Verlust).
  try {
    const mutating = istMutierend(rule);

    // FAIL-CLOSED (wie der Kit): eine mutierende Regel OHNE Bedingung würde sonst bei jedem Trigger unbeabsichtigt
    // dauerfeuern (die Bedingungs-Auswertung ist fail-open für „keine Bedingung"). Solche Regeln NIE ausführen.
    if (mutating && rule.condition === null) {
      await record(deps, rule, event, idempotencyKey, "skipped", {
        reason: "mutierend-ohne-wenn",
      });
      return "skipped";
    }
    // FAIL-CLOSED: mutierende Regel mit nicht vollständig verstandener Bedingung ⇒ nicht ausführen.
    if (mutating && !bedingungUnterstuetzt(rule.condition)) {
      await record(deps, rule, event, idempotencyKey, "skipped", {
        reason: "unsupported-condition",
      });
      return "skipped";
    }

    const appCase = event.caseId
      ? await deps.caseStore.getCase({
          tenantId: event.tenantId,
          caseId: event.caseId,
        })
      : undefined;

    // Bedingung nicht erfüllt ⇒ still (kein Lauf, kein Rauschen).
    if (!evalBedingungNodeSafe(rule.condition, bauDaten(event, appCase))) {
      return undefined;
    }

    const acts = aktionen(rule);

    // VIER-AUGEN-HARTGUARD: fordert die Regel oder irgendein Status-Übergang Vier-Augen ⇒ blockieren (Mensch nötig).
    if (rule.requiresFourEyes || fordertVierAugen(deps, acts, appCase)) {
      await record(deps, rule, event, idempotencyKey, "blocked", {
        reason: "four-eyes-requires-human",
      });
      return "blocked";
    }

    await fuehreAktionenAus(deps, event, appCase, acts, effekte);
    await record(deps, rule, event, idempotencyKey, "applied", { effekte });
    return "applied";
  } catch (error) {
    // Orchestrierungs- (getCase/Guard-record) ODER Effekt-Fehler → EHRLICH als „failed" protokollieren, nie stiller
    // Verlust. Bereits committete Teil-Effekte MIT protokollieren — sonst behauptete das Protokoll fälschlich, es sei
    // nichts mutiert worden. GRENZE: die Mehr-Aktions-Ausführung ist (noch) NICHT atomar (Stores teilen keine TX);
    // `partiell` macht das sichtbar, bis ein `withTransaction`-Pfad über beide Stores existiert. Der record-Aufruf
    // ist best-effort: wirft er selbst (DB down), fängt ihn die per-Event-Isolation in `processDueAutomationEvents`.
    await record(deps, rule, event, idempotencyKey, "failed", {
      error: String(error instanceof Error ? error.message : error),
      ...(effekte.length > 0
        ? { teilEffekte: [...effekte], partiell: true }
        : {}),
    });
    return "failed";
  }
}

/** Fordert irgendein `status-uebergang` in den Aktionen eine Vier-Augen-Transition (laut Katalog)? */
function fordertVierAugen(
  deps: AutomationEngineDeps,
  acts: Aktion[],
  appCase: AppCase | undefined,
): boolean {
  if (!appCase) return false;
  const transitions = deps.catalog.transitionsFor(
    appCase.procedureId,
    appCase.procedureVersion,
  );
  return acts.some((a) => {
    if (a.art !== "status-uebergang" || typeof a["nach"] !== "string")
      return false;
    const t = transitions.find(
      (x) => x.from === appCase.state && x.action === a["nach"],
    );
    return Boolean(t?.requiresFourEyes);
  });
}

async function fuehreAktionenAus(
  deps: AutomationEngineDeps,
  event: AppAutomationEvent,
  appCase: AppCase | undefined,
  acts: Aktion[],
  // Wird IN-PLACE gefüllt — so kennt der Aufrufer bei einem Wurf die bereits committeten Teil-Effekte.
  effekte: string[],
): Promise<string[]> {
  const session = {
    actorId: AUTOMATION_ACTOR,
    tenantId: event.tenantId,
    authorityId: event.authorityId,
    jurisdictionId: "de",
    permissions: ["case.transition", "task.write"],
  };

  for (const a of acts) {
    switch (a.art) {
      case "status-uebergang": {
        if (!appCase || typeof a["nach"] !== "string") break;
        const res = await executeCaseTransition(
          {
            persistence: deps.caseStore,
            policy: deps.policy,
            catalog: deps.catalog,
            now: deps.now,
            newAuditId: () => `audit.${deps.newId()}`,
          },
          {
            session,
            caseId: appCase.caseId,
            action: a["nach"],
            expectedVersion: appCase.version,
            ...(typeof a["detail"] === "string" ? { detail: a["detail"] } : {}),
            requestId: `automation.${event.eventId}`,
          },
        );
        if (!res.ok) throw new Error(`transition ${a["nach"]}: ${res.reason}`);
        effekte.push(`status-uebergang:${a["nach"]}`);
        break;
      }
      case "setze-prioritaet": {
        if (!deps.taskStore || !event.taskId || typeof a["wert"] !== "string")
          break;
        await deps.taskStore.patchTask({
          tenantId: event.tenantId,
          taskId: event.taskId,
          priorityKey: a["wert"],
        });
        effekte.push(`setze-prioritaet:${a["wert"]}`);
        break;
      }
      case "zuweisen": {
        // Nur direkte Akteur-Zuweisung; rollenbasierte Zuweisung braucht einen Zuständigkeits-Lesepfad (KI-Spine).
        if (!deps.taskStore || !event.taskId || typeof a["an"] !== "string")
          break;
        await deps.taskStore.patchTask({
          tenantId: event.tenantId,
          taskId: event.taskId,
          assigneeActorId: a["an"],
        });
        effekte.push(`zuweisen:${a["an"]}`);
        break;
      }
      case "label-hinzufuegen": {
        if (!deps.taskStore || !event.taskId || typeof a["label"] !== "string")
          break;
        const task = await deps.taskStore.getTask({
          tenantId: event.tenantId,
          taskId: event.taskId,
        });
        if (!task) break;
        if (!task.labels.includes(a["label"])) {
          await deps.taskStore.patchTask({
            tenantId: event.tenantId,
            taskId: event.taskId,
            labels: [...task.labels, a["label"]],
          });
        }
        effekte.push(`label:${a["label"]}`);
        break;
      }
      case "setze-feld":
      case "aufgabe-erstellen":
        // FAIL-CLOSED: beide sind als MUTIEREND deklariert (MUTIERENDE_ARTEN), aber serverseitig NOCH NICHT
        // implementiert. Sie hier still als „notiert" durchzuwinken und den Lauf als „applied" zu verbuchen, täuschte
        // Erfolg vor, obwohl NICHTS mutiert wurde (der vom Audit gefundene stille No-op). Stattdessen wird der Lauf
        // ehrlich als „failed" protokolliert, bis ein echter Effekt-Pfad existiert. `simulate` zeigt die Absicht
        // weiterhin; nur die AUSFÜHRUNG verweigert bewusst.
        throw new Error(
          `Aktion „${a.art}" ist als mutierend deklariert, aber serverseitig nicht implementiert — Ausführung verweigert (fail-closed)`,
        );
      default:
        // benachrichtigen / ki-vorschlag / audit: bewusst assistiv/außerhalb der Mutation — nur notieren.
        effekte.push(`notiert:${a.art}`);
    }
  }
  return effekte;
}

async function record(
  deps: AutomationEngineDeps,
  rule: AppAutomationRule,
  event: AppAutomationEvent,
  idempotencyKey: string,
  status: AutomationRunStatus,
  detail: Record<string, unknown>,
): Promise<void> {
  await deps.automationStore.recordRun({
    runId: `run.${deps.newId()}`,
    ruleId: rule.ruleId,
    eventId: event.eventId,
    idempotencyKey,
    status,
    detail,
    createdAt: deps.now(),
  });
}
