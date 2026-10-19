// Migrazioni SQL in server/migrations, applicate in ordine di nome, ognuna in una transazione.
// Una migrazione già applicata non si modifica: se ne scrive una nuova.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Sql } from "../lib/db.js";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const done = new Set((await sql<{ name: string }[]>`SELECT name FROM schema_migration`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const text = await readFile(new URL(name, `file://${dir}`), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`INSERT INTO schema_migration (name) VALUES (${name})`;
    });
    applied.push(name);
  }
  return applied;
}
