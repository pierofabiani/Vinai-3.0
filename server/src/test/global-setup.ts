// Prepara un database di test pulito (vinai_test) accanto a quello di sviluppo e applica le migrazioni.
// I test che lo usano leggono TEST_DATABASE_URL. Se PostgreSQL non è raggiungibile i test falliscono:
// non si saltano in silenzio.
import postgres from "postgres";
import { migrate } from "../db/migrate.js";

export default async function setup() {
  const base = process.env.DATABASE_URL;
  if (!base)
    throw new Error("DATABASE_URL mancante: copia .env.example in .env o avvia il database (pnpm db:up)");
  const url = new URL(base);
  url.pathname = "/vinai_test";
  const admin = postgres(base, { max: 1, onnotice: () => {} });
  await admin.unsafe("DROP DATABASE IF EXISTS vinai_test WITH (FORCE)");
  await admin.unsafe("CREATE DATABASE vinai_test");
  await admin.end();
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(sql);
  await sql.end();
  process.env.TEST_DATABASE_URL = url.toString();
}
