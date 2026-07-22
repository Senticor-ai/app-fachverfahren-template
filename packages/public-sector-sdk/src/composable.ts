// composable — das Metamodell für PRODUCTIVE AGENTIC COMPOSABLES (Senticor/CHOS Blueprint v5.0). Ein
// Agentic Composable ist die vertikale, dauerhaft verantwortete Fähigkeitseinheit: versioniert, auffindbar,
// eigenständig verantwortet, austauschbar, mit einem klaren Outcome — UND einem SPINE-AGENT (Rückgrat), der
// von einfacher Assistenz bis zu komplexer Prüfung/Subsumtion/Review/Strukturierung eskaliert.
//
// Dieses Modul ist rein deklarativ + rein prüfend (kein Netz/DOM/Date.now): es TRÄGT den Contract Envelope
// (Blueprint §8) als DATEN und ERZWINGT die Vollständigkeits-/Governance-Invarianten (§7, §19, §28). Die
// deterministische Naht (Routes/Permissions/Events) liegt weiter im DomainModuleManifest (module-manifest.ts);
// dieses Composable BINDET sie (`moduleId`) und ergänzt Outcome, Ownership, Spine-Agent, Assurance, Evidence.
//
// Plattformregel (Blueprint §9): Was über den Spine-Agent möglich ist, muss auch deterministisch per CLI/API
// gehen. Deshalb ist der Spine kein freier Prompt, sondern eine DEKLARIERTE, gegatete Fähigkeit.

/** Composable Assurance Level (Blueprint §7): Reife-/Zusicherungsgrad. Ein Composable wird nur `certified`,
 *  wenn alle Vertragsebenen vollständig sind (§19). */
export type ComposableAssuranceLevel =
  | "CAL-0" // Incubated — lernt kontrolliert, keine Produktivwirkung
  | "CAL-1" // Developer-ready
  | "CAL-2" // Productive
  | "CAL-3" // Regulated
  | "CAL-4"; // Mission-critical

/** Agentic Autonomy Level (Blueprint §7): wie autonom der Spine-Agent handeln darf. In hochsicheren
 *  Umgebungen sind AAL-0..AAL-3 Standard; AAL-4 ist eng begrenzt/reversibel; AAL-5 ist KEIN Produktivstandard. */
export type AgenticAutonomyLevel =
  | "AAL-0" // Deterministic only
  | "AAL-1" // Observe
  | "AAL-2" // Advise (der Regelfall für rechtsnahe Fachverfahren — KI berät, entscheidet nie)
  | "AAL-3" // Act with Approval
  | "AAL-4" // Autonomous within Bounds
  | "AAL-5"; // Autonomous Operations

/** Die höchste Autonomie, die ein rechtsnahes/hochsicheres Fachverfahren erlauben darf (Blueprint §7). */
export const MAX_AUTONOMY_HOCHSICHER: AgenticAutonomyLevel = "AAL-3";

/** Composable-Klasse (Blueprint §6). */
export type ComposableClass =
  | "outcome" // sichtbarer fachlicher Outcome (Bescheid, Bewertung)
  | "experience" // wiederverwendbare Journey/Interaktion
  | "knowledge" // kuratierter, zitierbarer Kontext
  | "action" // kontrollierte technische Aktion
  | "control" // Governance erzwingen (Vier-Augen, Policy, Gate)
  | "operations"; // Betrieb sicherstellen

/** Lifecycle-/Zertifizierungsstatus (Blueprint §19). */
export type ComposableStatus =
  | "draft"
  | "incubated"
  | "candidate"
  | "certified"
  | "active"
  | "restricted"
  | "superseded"
  | "deprecated"
  | "retired";

/**
 * Die AUFGABEN-ACHSE eines Spine-Agenten — der Eskalationspfad von einfacher Assistenz zu komplexer Intelligenz
 * (Nutzer-Mandat). Von harmlos nach eingriffstief geordnet:
 *  - `assistenz`       — Vorschläge, Zusammenfassung, Vollständigkeits-Hinweise (harmlos)
 *  - `strukturierung`  — Ordnen/Gliedern von Sachverhalt/Akte (ordnend, nicht wertend)
 *  - `pruefung`        — formelle/materielle Prüfung gegen Normen/Kriterien (wertend → HITL)
 *  - `subsumtion`      — Sachverhalt unter Tatbestand fassen (rechtsnah → HITL zwingend)
 *  - `review`          — Vier-/N-Augen-Assistenz, Qualitäts-/Konsistenz-Review (rechtsnah → HITL)
 */
export type SpineAufgabe =
  "assistenz" | "strukturierung" | "pruefung" | "subsumtion" | "review";

/** Die Aufgaben, die eine MENSCHLICHE Bestätigung erzwingen (rechtsnah). Der Spine liefert hier nur einen
 *  Entwurf/Vorschlag; die Entscheidung bleibt menschlich (HCAI, EU-AI-Act, Vier-Augen). KI ist NIE ein Auge. */
export const HITL_PFLICHT_AUFGABEN: readonly SpineAufgabe[] = [
  "pruefung",
  "subsumtion",
  "review",
];

/**
 * Der SPINE-AGENT (Rückgrat) eines Composables — die deklarierte, gegatete agentische Fähigkeit. Er eskaliert
 * entlang `aufgaben` von Assistenz zu Intelligenz, geerdet auf `skills` (prozedural) + `knowledgeDomains`
 * (deklarativ, Blueprint §13). Läuft immer über den AiAssistPort (AAL-2 „Advise": reviewRequired=true).
 */
export interface SpineAgent {
  /** Rollen-Kennung des Spine (z. B. "musterverfahren-spine"). */
  role: string;
  /** Autonomie-Obergrenze. In diesem Template rechtsnah → höchstens AAL-3 (s. `assertSpineAgent`). */
  autonomy: AgenticAutonomyLevel;
  /** Die Aufgaben-Achsen, die dieser Spine übernimmt (mind. eine). */
  aufgaben: SpineAufgabe[];
  /** Prozedurale Skills, auf die der Spine geerdet ist (Blueprint §13/§14, modellagnostisch via MCP). */
  skills: string[];
  /** Deklarative Knowledge-Domains, gegen die der Spine erdet/zitiert (Blueprint §13). */
  knowledgeDomains: string[];
}

/** Capability Outcome (Blueprint §5.1) — welche Fähigkeit für wen, wie gemessen, was ausdrücklich NICHT. */
export interface ComposableOutcome {
  fuerWen: string;
  ergebnis: string;
  messung: string;
  nichtScope: string[];
}

/** Ownership (Blueprint §16) — ein Composable OHNE Owner ist kein Composable (§28). */
export interface ComposableOwners {
  capabilityOwner: string;
  serviceOwner: string;
  knowledgeSteward?: string;
  assuranceSteward?: string;
  agentOwner?: string;
}

/**
 * Der Composable Contract Envelope (Blueprint §8) — die Verträge, die ein Composable vollständig machen.
 * Additiv zum DomainModuleManifest: `moduleId` bindet die deterministische Naht (Routes/Permissions/Events);
 * dieses Envelope ergänzt Outcome, Ownership, Spine-Agent, Assurance, Evals und Austauschbarkeit.
 */
export interface AgenticComposable {
  id: string;
  version: string;
  displayName: string;
  klasse: ComposableClass;
  status: ComposableStatus;
  assurance: ComposableAssuranceLevel;
  outcome: ComposableOutcome;
  owners: ComposableOwners;
  /** Bindung an das DomainModuleManifest (die deterministische CLI-/REST-/Event-Naht). */
  moduleId?: string;
  /** Der Spine-Agent (Agentic Interface). Fehlt er, ist es ein rein deterministisches Composable. */
  spine?: SpineAgent;
  /** Eval-Referenzen (Blueprint §23) — Nachweis der Fähigkeit. */
  evals: string[];
  /** Austauschbarkeit (Blueprint §18): Composables, die dieses ersetzen könnten. */
  replaceableBy: string[];
}

const AAL_RANG: Record<AgenticAutonomyLevel, number> = {
  "AAL-0": 0,
  "AAL-1": 1,
  "AAL-2": 2,
  "AAL-3": 3,
  "AAL-4": 4,
  "AAL-5": 5,
};

/** Fasst der Spine mindestens eine rechtsnahe (HITL-pflichtige) Aufgabe an? */
export function istRechtsnah(spine: SpineAgent): boolean {
  return spine.aufgaben.some((a) => HITL_PFLICHT_AUFGABEN.includes(a));
}

/**
 * Prüft die GOVERNANCE-Invarianten eines Spine-Agenten (wirft bei Verstoß). Zwei harte Grenzen aus dem
 * Blueprint (§7) + der HCAI-Doktrin:
 *  1. Globale Obergrenze: `autonomy` ≤ AAL-3 (AAL-4/AAL-5 sind kein Produktivstandard für rechtsnahe Verfahren).
 *  2. Rechtsnah-Grenze: fasst der Spine eine HITL-pflichtige Aufgabe (Prüfung/Subsumtion/Review) an, darf er
 *     dort NUR beraten → `autonomy` ≤ AAL-2 („Advise"). Die KI ist nie eines der zwei Augen; sie liefert einen
 *     Entwurf, der Mensch entscheidet (serverseitig erzwungen über reviewRequired=true des AiAssistPort).
 */
export function assertSpineAgent(spine: SpineAgent): SpineAgent {
  if (!spine.role) throw new Error("spine agent requires a role");
  if (spine.aufgaben.length === 0)
    throw new Error("spine agent requires at least one Aufgabe");
  if (AAL_RANG[spine.autonomy] > AAL_RANG[MAX_AUTONOMY_HOCHSICHER])
    throw new Error(
      `spine autonomy ${spine.autonomy} überschreitet die Obergrenze ${MAX_AUTONOMY_HOCHSICHER} (rechtsnahes Fachverfahren)`,
    );
  if (istRechtsnah(spine) && AAL_RANG[spine.autonomy] > AAL_RANG["AAL-2"])
    throw new Error(
      `spine mit rechtsnaher Aufgabe (${spine.aufgaben.join("/")}) darf höchstens AAL-2 „Advise" sein, nicht ${spine.autonomy}`,
    );
  return spine;
}

/** Strukturelle Grundprüfung eines Composables (wirft bei Verstoß). Prüft NICHT die Zertifizierungsreife
 *  (dafür `certificationReadiness`), sondern die Wohlgeformtheit — inkl. der Spine-Governance. */
export function assertComposable(c: AgenticComposable): AgenticComposable {
  if (!c.id || !c.version)
    throw new Error("composable requires id and version");
  if (!c.displayName) throw new Error("composable requires a displayName");
  if (c.spine) assertSpineAgent(c.spine);
  return c;
}

/**
 * Zertifizierungsreife (Blueprint §19 + Anti-Patterns §28): ein Composable wird nur `certified`, wenn ALLE
 * tragenden Vertragsebenen vollständig sind. Gibt die noch FEHLENDEN Ebenen zurück (leer = zertifizierbar) —
 * damit ein Gate/CLI konkret sagen kann, was fehlt, statt nur „unvollständig".
 */
export function certificationReadiness(c: AgenticComposable): {
  certifiable: boolean;
  fehlend: string[];
} {
  const fehlend: string[] = [];
  // §5.1 Capability Outcome
  if (!c.outcome?.fuerWen) fehlend.push("outcome.fuerWen");
  if (!c.outcome?.ergebnis) fehlend.push("outcome.ergebnis");
  if (!c.outcome?.messung) fehlend.push("outcome.messung");
  // §16/§28: ein Composable ohne Owner ist kein Composable
  if (!c.owners?.capabilityOwner) fehlend.push("owners.capabilityOwner");
  if (!c.owners?.serviceOwner) fehlend.push("owners.serviceOwner");
  // §9: deterministische Naht (Routes/Permissions/Events) über das gebundene Modul
  if (!c.moduleId) fehlend.push("moduleId (deterministische Naht)");
  // §28: eine Fähigkeit ohne Evals/Evidence ist nicht produktionsfähig
  if (c.evals.length === 0) fehlend.push("evals");
  // §28: ein Spine ohne Knowledge- und Skill-Bezug ist kein produktives Composable
  if (c.spine) {
    if (c.spine.skills.length === 0) fehlend.push("spine.skills");
    if (c.spine.knowledgeDomains.length === 0)
      fehlend.push("spine.knowledgeDomains");
  }
  return { certifiable: fehlend.length === 0, fehlend };
}
