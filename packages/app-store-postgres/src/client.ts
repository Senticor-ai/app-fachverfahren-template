export interface PgClient {
  connect(): Promise<void>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

interface PgClientConstructor {
  new (options: { connectionString: string }): PgClient;
}

interface PgPoolClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
  release(): void;
}

interface PgPool {
  connect(): Promise<PgPoolClient>;
  end(): Promise<void>;
  /** node-postgres-Pools emittieren `'error'`, wenn eine IDLE-Verbindung serverseitig stirbt (DB-Neustart/Failover/
   *  Netz-Blip). Ohne Listener reicht Node das als uncaught exception weiter → der langlaufende Prozess stürzt ab. */
  on(event: "error", listener: (err: Error) => void): void;
}

interface PgPoolConstructor {
  new (options: { connectionString: string }): PgPool;
}

interface PgModule {
  Client?: PgClientConstructor;
  Pool?: PgPoolConstructor;
  default?: {
    Client?: PgClientConstructor;
    Pool?: PgPoolConstructor;
  };
}

/** Rohe, UNGEPOOLTE Verbindung (eine je Aufruf). Für kurzlebige, dedizierte Vorgänge — v. a. `migrate.ts`
 *  (Advisory-Lock + lange DDL-Transaktion auf einer eigenen Verbindung) und Tests. */
export async function createPgClient(databaseUrl: string): Promise<PgClient> {
  const pg = (await import("pg")) as PgModule;
  const Client = pg.default?.Client ?? pg.Client;
  if (!Client) {
    throw new Error("pg Client export not found");
  }
  return new Client({ connectionString: databaseUrl });
}

// Prozess-weiter Pool je Datenbank-URL. Die Stores öffnen NICHT mehr pro Query eine TCP-Verbindung, sondern leihen
// sich für die Dauer eines `withClient`-Blocks GENAU EINE Verbindung aus dem Pool (damit läuft `BEGIN … COMMIT`
// garantiert auf derselben Verbindung) und geben sie danach zurück. Der Cache hält das Erzeugungs-Promise, damit
// zwei nebenläufige Erst-Aufrufe nicht zwei Pools bauen.
const pgPools = new Map<string, Promise<PgPool>>();

function poolFor(databaseUrl: string): Promise<PgPool> {
  let pool = pgPools.get(databaseUrl);
  if (!pool) {
    pool = (async () => {
      const pg = (await import("pg")) as PgModule;
      const Pool = pg.default?.Pool ?? pg.Pool;
      if (!Pool) {
        throw new Error("pg Pool export not found");
      }
      const pool = new Pool({ connectionString: databaseUrl });
      // PFLICHT-Listener: stirbt eine IDLE-Verbindung serverseitig, emittiert der Pool `'error'`. Ohne Listener
      // reißt Node den gesamten server-autoritativen Prozess mit (uncaught exception) — obwohl gerade KEIN Request
      // diese Verbindung nutzt. node-postgres entfernt die kaputte Verbindung selbst; wir loggen nur strukturiert.
      pool.on("error", (err: Error) => {
        // Infrastruktur-Fehler einer Idle-Pool-Verbindung; kein Domain-Log-Kanal in dieser Adapter-Schicht.
        console.error(
          "[app-store-postgres] idle pool client error:",
          err.message,
        );
      });
      return pool;
    })();
    pgPools.set(databaseUrl, pool);
  }
  return pool;
}

/** Eine aus dem Pool geliehene Verbindung, die dieselbe `PgClient`-Naht erfüllt: `connect()` = leihen,
 *  `end()` = zurückgeben (schließt NICHT den Pool). So bleiben Mehrfach-Statements (Transaktionen) auf einer
 *  Verbindung, und Verbindungen werden wiederverwendet statt pro Query neu aufgebaut. */
export async function createPooledPgClient(
  databaseUrl: string,
): Promise<PgClient> {
  const pool = await poolFor(databaseUrl);
  let leased: PgPoolClient | undefined;
  return {
    async connect(): Promise<void> {
      leased = await pool.connect();
    },
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ): Promise<{ rows: T[] }> {
      if (!leased) throw new Error("pooled client not connected");
      return leased.query<T>(sql, values);
    },
    async end(): Promise<void> {
      leased?.release();
      leased = undefined;
    },
  };
}

/** Schließt alle prozessweiten Pools (Graceful Shutdown / Test-Teardown). Danach ist der Cache leer; ein erneuter
 *  Store-Aufruf baut bei Bedarf einen frischen Pool. */
export async function closePgPools(): Promise<void> {
  const pending = [...pgPools.values()];
  pgPools.clear();
  await Promise.all(
    pending.map(async (p) => {
      try {
        await (await p).end();
      } catch {
        /* Pool war nie verbunden — ignorieren */
      }
    }),
  );
}
