// module-server — der FRAMEWORK-AGNOSTISCHE Vertrag eines Domänen-Modul-Servers (ModuleHost, Skalierungsplan
// „mehrere Backends für unterschiedliche Bereiche"). Ein Modul (`modules/<domain>/server`) exportiert einen
// `ModuleServer` aus REINEN Descriptoren + Handlern `(ctx) => ModuleResult`; es importiert NIE ein HTTP-Framework,
// `pg` oder einen Store. Das Mounten, die Session-/RBAC-Durchsetzung und die VOR-GESCOPTE Port-Injektion übernimmt
// der Host (`apps/*/server/module-host`). Diese Typen liegen im module-import-erlaubten SDK (Modul UND Host teilen
// sie), NICHT im App-Paket — sonst könnte ein Modul sie nicht importieren (module-boundaries).

/** Der server-autoritative Mandanten-/Akteur-Scope — der Host leitet ihn aus der Session (HTTP) bzw. dem
 *  Event-Envelope (Consumer) ab, NIE aus Query/Body. Ein Modul liest den Kontext ausschliesslich hieraus. */
export interface ModuleScope {
  // readonly + der Host friert das Objekt ein (Object.freeze) — ein Handler kann `ctx.scope` nicht mutieren, um einen
  // vor-gescopten Port auf einen fremden Mandanten umzulenken (Fix-First #1, Adversarial-Review-Härtung).
  readonly tenantId: string;
  readonly authorityId: string;
  readonly jurisdictionId: string;
  readonly actorId: string;
  readonly permissions: readonly string[];
}

/** Ergebnis eines Modul-Route-Handlers. `ok:true` ⇒ Status (Default 200) + optionaler Body; `ok:false` ⇒ Fehlerstatus
 *  + Fehlercode (+ optionaler Grund). Der Host übersetzt das in eine HTTP-Antwort (immer `Cache-Control: no-store`). */
export type ModuleResult =
  | { ok: true; status?: number; body?: unknown }
  | { ok: false; status: number; error: string; reason?: string };

export type ModuleHttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** Sicherheits-/Persona-Zone einer Route (fürs spätere Zonen-Routing; heute mountet der Host alle auf den
 *  Public-Server, `internal` ausgenommen — s. ModuleHost-Phasenplan). */
export type ModuleSurface = "citizen" | "caseworker" | "audit" | "internal";

export interface ModuleRequestContext<P = unknown> {
  /** Aus der Session, tenant-gepinnt. */
  scope: ModuleScope;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  /** Nur Fachnutzdaten — der Handler narrowt selbst. NIE für Mandanten-/Akteur-Scope (der kommt aus `scope`). */
  body: unknown;
  requestId: string;
  /** NUR die im `ModuleServer.requiredPorts` deklarierten, VOR-GESCOPTEN Ports. */
  ports: P;
}

export interface RouteDescriptor<P = unknown> {
  method: ModuleHttpMethod;
  path: string;
  surface: ModuleSurface;
  /** Stabiler Route↔Handler-Anker (Drift-Check + Doku). */
  operationId: string;
  /** RBAC-UND: die Session muss ALLE diese Rechte tragen (sonst 403). */
  requiredPermissions: readonly string[];
  /** Schreib-Route mit Vier-Augen-Pflicht (port-getrieben; in frühen Phasen deferred). */
  fourEyes?: boolean;
  handle: (
    ctx: ModuleRequestContext<P>,
  ) => Promise<ModuleResult> | ModuleResult;
}

/** Ein getyptes Domänen-Event, wie ein Modul-Consumer es sieht — der Host mappt es aus der Outbox (`eventType`
 *  non-null, weil der Fan-out nur getypte Events liefert). */
export interface DomainEvent {
  eventId: string;
  eventType: string;
  eventVersion: number | null;
  tenantId: string;
  authorityId: string;
  procedureId: string;
  caseId: string | null;
  taskId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  correlationId: string | null;
  causationId: string | null;
}

export interface ConsumerDescriptor<P = unknown> {
  /** Consumer-Kennung — der Host namespaced sie zu `${moduleId}.${id}` (eindeutiger Zustell-Cursor im Fan-out). */
  id: string;
  eventTypes?: readonly string[];
  handle: (
    event: DomainEvent,
    ctx: { scope: ModuleScope; ports: P },
  ) => Promise<void> | void;
}

/** Was ein Modul-Server exportiert: seine Id, die verlangten (VOR-GESCOPTEN) Ports und optionale HTTP-Routen und/oder
 *  Event-Consumer. Beide Flächen sind optional — ein reines event-first Backend hat nur `consumers`. */
export interface ModuleServer<P = unknown> {
  moduleId: string;
  /** Capability-/Port-Namen; der Host baut GENAU diese (undeklariert ⇒ nicht verfügbar). */
  requiredPorts: readonly string[];
  routes?: readonly RouteDescriptor<P>[];
  consumers?: readonly ConsumerDescriptor<P>[];
}

/** VOR-GESCOPTER Benachrichtigungs-Port: der Mandant ist im Host an die Session gebunden (Closure), NICHT Parameter —
 *  ein Modul kann so PHYSISCH keinen fremden Mandanten adressieren (Scope nie aus Query/Body). Die zurückgelieferten
 *  Meldungen bleiben opak (der Host reicht die Server-Objekte durch — kein Store-Typ im Modul). */
export interface NotificationPort {
  list(input: { unreadOnly?: boolean }): Promise<readonly unknown[]>;
  markRead(input: { notificationId: string }): Promise<void>;
}
