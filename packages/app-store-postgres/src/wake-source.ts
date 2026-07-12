// wake-source (#17) — der WAKE-Seam: weckt einen Poller/Worker SOFORT, wenn ein neues Outbox-Event eingereiht wurde,
// statt bis zum nächsten Poll-Intervall zu warten (Latenz-Gewinn). Der Poll bleibt IMMER das SICHERHEITSNETZ: ein
// verpasstes Signal (Netzwerk, Reconnect, In-Memory-Prozessgrenze) fängt der nächste Poll → KEIN Korrektheitsrisiko,
// nur ggf. etwas höhere Latenz.
//
// Zwei Laufzeiten: InMemory (gleicher Prozess — der Store ruft `notify()` beim Enqueue direkt) und Postgres
// (prozess-übergreifend — der Enqueue sendet `NOTIFY app_automation_wake`, eine dedizierte LISTEN-Verbindung weckt).
import { AUTOMATION_WAKE_CHANNEL } from "./automation-store.js";
import {
  InMemoryAutomationStore,
  PostgresAutomationStore,
  type AutomationStore,
} from "./automation-store.js";

/** Ein Wecker: `subscribe` meldet einen Callback an (früher Tick), gibt die Abmelde-Funktion zurück; `close` gibt
 *  Ressourcen frei (z. B. die LISTEN-Verbindung). */
export interface WakeSource {
  subscribe(onWake: () => void): () => void;
  close(): Promise<void>;
}

/** Prozess-lokaler Wecker: der In-Memory-Store ruft `notify()` beim Einreihen eines neuen Events; alle Subscriber
 *  (der In-Prozess-Poller) feuern synchron einen frühen Tick. */
export class InMemoryWakeSource implements WakeSource {
  private readonly subscribers = new Set<() => void>();

  subscribe(onWake: () => void): () => void {
    this.subscribers.add(onWake);
    return () => {
      this.subscribers.delete(onWake);
    };
  }

  /** Signalisiert allen Subscribern einen frühen Tick. Ein werfender Subscriber darf die anderen nicht blockieren. */
  notify(): void {
    for (const s of [...this.subscribers]) {
      try {
        s();
      } catch {
        /* Subscriber-Fehler isolieren — der Poll bleibt das Sicherheitsnetz. */
      }
    }
  }

  async close(): Promise<void> {
    this.subscribers.clear();
  }
}

// ── Postgres LISTEN (prozess-übergreifend, attended) ──────────────────────────────────────────────
interface RawPgNotificationClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  on(event: "notification", cb: (msg: { channel: string }) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "end", cb: () => void): void;
  removeAllListeners(): void;
  end(): Promise<void>;
}
interface RawPgModule {
  Client?: new (o: { connectionString: string }) => RawPgNotificationClient;
  default?: {
    Client?: new (o: { connectionString: string }) => RawPgNotificationClient;
  };
}

/** Weckt auf `NOTIFY app_automation_wake` über eine DEDIZIERTE (ungepoolte) LISTEN-Verbindung. Best-effort: bricht die
 *  Verbindung weg, wird EINMAL verzögert neu verbunden; scheitert auch das, bleibt der Poll das Sicherheitsnetz. */
export class PgWakeSource implements WakeSource {
  private readonly subscribers = new Set<() => void>();
  private client: RawPgNotificationClient | undefined;
  private geschlossen = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly databaseUrl: string,
    private readonly reconnectMs = 2000,
  ) {}

  subscribe(onWake: () => void): () => void {
    this.subscribers.add(onWake);
    // Erst mit dem ersten Subscriber die LISTEN-Verbindung aufbauen (lazy).
    if (this.subscribers.size === 1 && !this.client) void this.verbinde();
    return () => {
      this.subscribers.delete(onWake);
    };
  }

  private notify(): void {
    for (const s of [...this.subscribers]) {
      try {
        s();
      } catch {
        /* isolieren */
      }
    }
  }

  private async verbinde(): Promise<void> {
    if (this.geschlossen) return;
    // `client` ausserhalb des try, damit der catch eine TEIL-aufgebaute (z. B. connect ok, LISTEN-Query gescheitert)
    // Verbindung sauber schliessen kann statt sie zu leaken.
    let client: RawPgNotificationClient | undefined;
    try {
      const pg = (await import("pg")) as RawPgModule;
      const Client = pg.default?.Client ?? pg.Client;
      if (!Client) return; // ohne pg-Client bleibt es beim Poll
      client = new Client({ connectionString: this.databaseUrl });
      client.on("notification", (msg) => {
        if (msg.channel === AUTOMATION_WAKE_CHANNEL) this.notify();
      });
      client.on("error", () => this.planeReconnect());
      client.on("end", () => this.planeReconnect());
      await client.connect();
      await client.query(`LISTEN ${AUTOMATION_WAKE_CHANNEL}`);
      // POST-await-Guard: lief close() WÄHREND des Verbindens (this.client war da noch undefined, close() übersah die
      // Verbindung), die frisch verbundene Verbindung SOFORT schliessen statt behalten — sonst leakt eine lebende
      // LISTEN-Verbindung an einer bereits geschlossenen Quelle (Adversarial-Review-Fund).
      if (this.geschlossen) {
        client.removeAllListeners();
        await client.end().catch(() => {});
        return;
      }
      this.client = client;
    } catch {
      // Teil-aufgebaute Verbindung best-effort schliessen, dann später erneut (Poll überbrückt).
      if (client) {
        client.removeAllListeners();
        await client.end().catch(() => {});
      }
      this.planeReconnect();
    }
  }

  private planeReconnect(): void {
    if (this.geschlossen || this.reconnectTimer) return;
    this.client = undefined;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.subscribers.size > 0) void this.verbinde();
    }, this.reconnectMs);
    this.reconnectTimer.unref?.();
  }

  async close(): Promise<void> {
    this.geschlossen = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.subscribers.clear();
    const client = this.client;
    this.client = undefined;
    if (client) {
      client.removeAllListeners();
      await client.end().catch(() => {});
    }
  }
}

/** Baut den passenden Wecker für den Store: Postgres ⇒ LISTEN-basiert (prozess-übergreifend); In-Memory ⇒ prozess-
 *  lokal, an den Store gekoppelt (der Store weckt beim Enqueue). Unbekannter Store ⇒ kein Wecker (nur Poll). */
export function createWakeSource(
  store: AutomationStore,
  env: NodeJS.ProcessEnv = process.env,
): WakeSource | undefined {
  if (store instanceof PostgresAutomationStore) {
    const url = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
    if (!url) return undefined;
    return new PgWakeSource(url);
  }
  if (store instanceof InMemoryAutomationStore) {
    const source = new InMemoryWakeSource();
    // Der In-Memory-Store weckt beim Einreihen eines NEUEN Events (gleicher Prozess).
    store.wakeNotify = () => source.notify();
    return source;
  }
  return undefined;
}
