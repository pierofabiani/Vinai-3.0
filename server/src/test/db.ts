import postgres from "postgres";
import type { Sql } from "../lib/db.js";

export function testSql(): Sql {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL non impostato (global-setup)");
  return postgres(url, { max: 5, onnotice: () => {} });
}

export const TEST_MASTER = Buffer.alloc(32, 7);
