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

interface PgModule {
  Client?: PgClientConstructor;
  default?: {
    Client?: PgClientConstructor;
  };
}

export async function createPgClient(databaseUrl: string): Promise<PgClient> {
  const pg = (await import("pg")) as PgModule;
  const Client = pg.default?.Client ?? pg.Client;
  if (!Client) {
    throw new Error("pg Client export not found");
  }
  return new Client({ connectionString: databaseUrl });
}
