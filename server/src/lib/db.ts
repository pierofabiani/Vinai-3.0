// Connessione a PostgreSQL. Solo il server scrive nel database (vedi CLAUDE.md).
import postgres from "postgres";

export type Sql = postgres.Sql;

export function connect(url: string): Sql {
  return postgres(url, { max: 10, idle_timeout: 30 });
}

export interface DbStatus {
  postgres: string;
  timescaledb: string | null;
  postgis: string | null;
}

export async function dbStatus(sql: Sql): Promise<DbStatus> {
  const [row] = await sql<{ pg: string }[]>`select current_setting('server_version') as pg`;
  const ext = await sql<{ extname: string; extversion: string }[]>`
    select extname, extversion from pg_extension where extname in ('timescaledb', 'postgis')`;
  const v = (name: string) => ext.find((e) => e.extname === name)?.extversion ?? null;
  return { postgres: row?.pg ?? "?", timescaledb: v("timescaledb"), postgis: v("postgis") };
}
