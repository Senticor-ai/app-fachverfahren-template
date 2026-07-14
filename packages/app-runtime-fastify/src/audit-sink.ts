// audit-sink — die Audit-NAHT der Runtime: Routen emittieren strukturierte Ereignisse
// (SecurityEvent für Denials, AppDataAuditEvent für App-Daten-Schreibzugriffe,
// FachlicheAuditEvent für echte Domain-Ereignisse) an einen injizierten Sink — nie
// console.log in Routen. Console = eine JSON-Zeile pro Ereignis (Container-Konvention),
// Memory = Test-Assertions, Noop = bewusstes Verwerfen.
import type {
  AppDataAuditEvent,
  FachlicheAuditEvent,
  SecurityEvent,
} from "@senticor/public-sector-sdk";

export type AuditSinkEvent =
  | { kind: "security"; event: SecurityEvent }
  | { kind: "app-data"; event: AppDataAuditEvent }
  | { kind: "fachlich"; event: FachlicheAuditEvent };

export interface AuditSink {
  emit(event: AuditSinkEvent): void | Promise<void>;
}

export class ConsoleAuditSink implements AuditSink {
  emit(event: AuditSinkEvent): void {
    process.stdout.write(
      `${JSON.stringify({ level: "audit", kind: event.kind, ...event.event })}\n`,
    );
  }
}

export class MemoryAuditSink implements AuditSink {
  readonly events: AuditSinkEvent[] = [];

  emit(event: AuditSinkEvent): void {
    this.events.push(event);
  }
}

export class NoopAuditSink implements AuditSink {
  emit(_event: AuditSinkEvent): void {
    // bewusst leer — z.B. für Smoke-Läufe ohne Audit-Senke.
  }
}

export function createAuditSinkFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuditSink {
  const raw = env["APP_AUDIT_SINK"] ?? "console";
  if (raw === "console") return new ConsoleAuditSink();
  if (raw === "noop") return new NoopAuditSink();
  throw new Error(`APP_AUDIT_SINK must be console or noop, got: ${raw}`);
}
