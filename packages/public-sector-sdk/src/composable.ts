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
  /**
   * DIE SELBST DEKLARIERTEN RECHTSGRUNDLAGEN dieser Stelle — `anspruch` des Mesh-Manifests.
   *
   * ⛔ 2026-09-03 — SIE STARBEN BIS HEUTE AM MOUNT. Gemessen am emittierten Manifest von
   * eines Live-Laufs: jede Stelle fuehrt 5 Anspruchsgrundlagen MIT TITEL (Landesabgabenrecht, Erhebung
   * kommunaler Abgaben, Autoritaetsfamilie, E-Government, Onlinezugang). `mapManifestToComposable` las `wissen`,
   * `faehigkeiten`, `befugnis` und `leistungen` — `anspruch` kam in keiner Zeile vor. Der Assistent
   * einer rechtsnahen Stelle wusste damit nicht, worauf sich seine eigene Stelle stuetzt.
   *
   * ⛔ WAS SIE NICHT SIND: der WORTLAUT der Norm. Sie NENNEN die Grundlage, sie tragen sie nicht.
   * Deshalb heben sie `erdung.geerdet` NICHT — das bleibt an den kuratierten Wissenseintraegen.
   * «GEERDET beglaubigt die EXISTENZ der Norm, nie ihren GEHALT» ist die teuerste Lehre dieses
   * Hauses; ein Titel, der als Beleg zaehlt, waere genau ihr Rueckfall.
   */
  rechtsgrundlagen?: { id: string; titel: string; ubiquitaer?: boolean }[];
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
/** Eine publizierende Quelle der Mount-Provenienz — Verbund/Tenant/Zeitpunkt (ERP-Reuse-Herkunft). */
export interface ComposableHerkunftQuelle {
  verbundId: string;
  tenant: string;
  /** Zeitpunkt der Registry-Publikation (ISO-8601), sofern der Beleg ihn trägt. */
  publishedAt?: string;
}

/**
 * Reuse-Herkunft eines Composables (Blueprint §18 „ERP-Reuse"): wurde die Stelle aus der GETEILTEN Mesh-Registry
 * GEMOUNTET (aus einem anderen Verbund/Tenant wiederverwendet) oder im eigenen Verfahren LOKAL abgeleitet?
 * Die EINE Wahrheit ist die neben dem Manifest liegende Mount-Provenienz (`<id>.mount.json`, von CHOS geschrieben);
 * fehlt sie, ist die Stelle lokal abgeleitet (evidence-driven: absente Provenienz = lokal, nie geraten).
 */
export type ComposableHerkunft =
  | {
      art: "registry-mount";
      /** Die aggregierte Provenienz-Kette der Publisher (aus der Mount-Provenienz). Kann leer sein (Beleg ohne Quelle). */
      quelle: ComposableHerkunftQuelle[];
      /** Content-Version des gemounteten Records. */
      version?: string;
      /** Der Ketten-Hash des gewinnenden Registry-Records (Mount-Beleg). */
      recordHash?: string;
      /** Zeitpunkt des Mounts (ISO-8601). */
      mountedAt?: string;
    }
  | { art: "lokal-abgeleitet" };

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
  /** Reuse-Herkunft (Blueprint §18): aus der geteilten Registry gemountet vs. lokal abgeleitet. Fehlt das Feld,
   *  gilt „lokal abgeleitet" (evidence-driven: absente Mount-Provenienz = lokal). */
  herkunft?: ComposableHerkunft;
  /** WAS die Stelle im laufenden Verfahren ENTSCHEIDET — die Verfahrensschritte, fuer die sie berechtigt ist.
   *
   *  GEMESSEN (32 reale Mesh-Manifeste): ein Composable deklarierte bisher Faehigkeiten, Befugnis und
   *  Wissensbindung — und nirgends, was bei ihm herauskommt. Fuer einen Fachbereich ist das die erste Frage.
   *
   *  ABGELEITET, NICHT GEPFLEGT: die Zuordnung entsteht im Emitter aus der Zustandsmaschine der Leistung
   *  (Uebergaenge x `rollen`). Ein handgepflegtes Feld waere eine zweite Wahrheit und beim ersten
   *  Verfassungs-Update falsch. Fehlt es, entscheidet die Stelle nichts — das ist eine Aussage, keine Luecke. */
  leistungen?: ComposableLeistung[];
  /** WAS in welcher BAU-Phase entsteht (aus RACI x produces). Ergaenzt `leistungen` um die Herstellungs-Sicht. */
  artefakte?: ComposableArtefakt[];
  /** DIE STRUKTURIERTE FAEHIGKEITS-SEITE — gleichrangig zur Wissensseite (`spine.skills`), nicht ihr Zulieferer.
   *
   *  Ein Composable besteht IMMER aus beidem: Tarif, Regel, Formel, Pruefung NEBEN Lesen, Verstehen, Erklaeren.
   *  Bisher kannte dieser Typ nur `spine` — ein rein deterministisches Composable galt als „ohne Faehigkeiten",
   *  und ein rechnendes Composable konnte nicht sagen, WOMIT es rechnet.
   *
   *  ES REIST DER ANSPRUCH, NIE DER KOERPER: `programm` ist eine Kennung. Sie sagt, DASS ein Programm existiert
   *  und welches — nicht, was es tut. Wer das Composable betreibt, kann damit beurteilen, ob er es betreiben
   *  darf; nachbauen kann er es nicht. */
  strukturiert?: ComposableStrukturFaehigkeit[];
  /** WERKZEUG-KANTEN: welche Wissens-Faehigkeit welches Programm aufruft. Die Wissensseite BENUTZT die
   *  strukturierte wie ein Werkzeug — sie rechnet nicht selbst, sie ruft auf und traegt das Ergebnis mit Beleg
   *  weiter. Diese Kante ist die Governance-Aussage dazu. */
  benutzt?: ComposableWerkzeugKante[];
}

/** Eine STRUKTURIERTE Faehigkeit, wie sie beim Betreiber ankommt — der Anspruch, nicht das Programm. */
export interface ComposableStrukturFaehigkeit {
  id: string;
  ergebnis: string;
  /** Die Klasse (tarif | regel | formel | pruefung | frist | …) — DATEN der Verfassung, kein Engine-Vokabular. */
  klasse?: string;
  /** Die KENNUNG des Programms. Der Koerper bleibt beim Herausgeber. */
  programm?: string;
  /** Die Rechtsgrundlagen DIESER Faehigkeit (nicht die der Leistung). */
  grundlagen?: string[];
  evalSuite?: string;
  /** Von einer Wissens-Faehigkeit ERZEUGT — und von wem freigegeben. Fehlt die Freigabe, betreibt der Betreiber
   *  eine ungelesene Regel. Das muss er SEHEN koennen, darum reist der Befund mit. */
  erzeugtVon?: string;
  freigegebenVon?: string;
}

/** Wissens-Faehigkeit → Programm. WER WEN benutzen darf, nie WIE das Programm rechnet. */
export interface ComposableWerkzeugKante {
  wissen: string;
  werkzeug: string;
}

/** Ein Verfahrensschritt, den diese Stelle verantwortet — die fachliche Leistung des Composables. */
export interface ComposableLeistung {
  /** Der Schritt in der Sprache des Verfahrens („Grundsteuerwert feststellen"). */
  schritt: string;
  /** Der Zustand, den er herbeifuehrt — das eigentliche Ergebnis. */
  ergebnis: string;
  /** Verlangt der Schritt eine zweite Person? Eine Rechtsfolge, keine Nuance. */
  vierAugen: boolean;
  /** Muss die Entscheidung begruendet werden? */
  begruendungsPflicht: boolean;
  /** Erlaesst dieser Schritt einen Verwaltungsakt? Der schwerste Marker, den ein Schritt tragen kann. */
  erlaesstBescheid: boolean;
}

/** Ein Artefakt, das diese Stelle in einer Bau-Phase verantwortet. */
export interface ComposableArtefakt {
  ziel: string;
  phase: string;
  /** DATEI-Zusage oder abstraktes ERGEBNIS-Ziel — beides legitim, aber nicht dasselbe. */
  art: "datei" | "ergebnis";
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

/**
 * Composable Registry (Blueprint §20/§32) — die aktive Steuerungsbasis für Discovery, Austauschbarkeit und
 * Impact-Analyse. Auffindbar nach `id[@version]`; ohne Version gewinnt die zuletzt registrierte. Naht wie
 * `ProcedureRegistry` (In-Memory-Stub im Template; chos-Graph hinter derselben Naht als PROD-Backing).
 */
export interface ComposableRegistry {
  get(id: string, version?: string): AgenticComposable | undefined;
  list(): AgenticComposable[];
  /** Nur enabled/produktive Composables (`status` ∈ certified/active) — für die Laufzeit-Auswahl. */
  listEnabled(): AgenticComposable[];
}

/**
 * Is this composable selectable AT RUNTIME?
 *
 * ⛔ THIS LINE READ `c.status === "certified" || c.status === "active"` — THE CERTIFICATION LOCK.
 * REMOVED 2026-09-03 on an explicit, REPEATED user directive: certification was struck from the
 * constitution on 2026-08-28 («certification at the earliest at production — burning time and money on it
 * during the first product slice makes no sense»), and the user had to repeat the order because THIS line,
 * inside the generated product, carried the effect on its own after the constitutional half was done.
 *
 * ## What it cost, measured
 * On the running product (2026-09-03): **8 of 8 generated composables mounted, 0 runtime-selectable.**
 * Generated composables sit at `incubated`/`candidate` in the lifecycle — and the certification that would
 * have raised them to `certified` is switched off by the very same directive. The condition was therefore
 * structurally unsatisfiable: a lock with no key, i.e. a dead end.
 * The same measurement during the build (2026-08-28): 52.7 % of wall-clock time, 130–513 s per composable
 * strictly serial, ~0.74 USD — and futile, because `normGedeckt` was `false` in 39 of 39 verdicts (the
 * missing Land-level law corpus).
 *
 * ## What STAYS — this is not relabelling
 * `status` is UNCHANGED on the composable and is still served and displayed: a composable still states
 * honestly whether it is `incubated`, `candidate`, `certified` or `active`. What fell is only that this
 * state BLOCKS USE. The statement remains; the gate is gone.
 *
 * ## How it comes back for production
 * The directive says «at the earliest at production». Whoever re-arms the lock there must NOT do it here,
 * but bound to the BUILD DEPTH (`produktiv` at the earliest) — otherwise this exact dead end returns in
 * every first-slice run.
 *
 * ⛔ NON-GOAL: `deprecated`/`retired` stay excluded. Making a retired composable selectable would no longer
 * be a relaxation of the certification lock, but a different defect.
 */
export function istEnabled(c: AgenticComposable): boolean {
  return c.status !== "deprecated" && c.status !== "retired";
}

/** Baut eine In-Memory-`ComposableRegistry` aus einer Liste von Composables (wirft bei wohlgeformten Verstößen
 *  über `assertComposable` — ein kaputtes Composable darf gar nicht erst in die Registry). */
export function createInMemoryComposableRegistry(
  composables: readonly AgenticComposable[],
): ComposableRegistry {
  const byKey = new Map<string, AgenticComposable>();
  const byId = new Map<string, AgenticComposable>();
  for (const c of composables) {
    assertComposable(c);
    byKey.set(`${c.id}:${c.version}`, c);
    byId.set(c.id, c); // zuletzt registrierte Version gewinnt bei versionsloser Abfrage
  }
  return {
    get: (id, version) =>
      version ? byKey.get(`${id}:${version}`) : byId.get(id),
    list: () => [...byKey.values()],
    listEnabled: () => [...byKey.values()].filter(istEnabled),
  };
}
