declare module "pg" {
  export class Client {
    constructor(options: { connectionString: string });
    connect(): Promise<void>;
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ): Promise<{ rows: T[] }>;
    end(): Promise<void>;
  }

  const pg: {
    Client: typeof Client;
  };

  export default pg;
}
