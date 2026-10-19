// Applicazione HTTP per la web app e la console.
// Le dipendenze arrivano da fuori, così i test non hanno bisogno del database.
import { Hono } from "hono";
import type { DbStatus } from "../lib/db.js";

export interface ApiDeps {
  dbStatus: () => Promise<DbStatus>;
}

export function createApp(deps: ApiDeps) {
  return new Hono().basePath("/api").get("/health", async (c) => {
    try {
      const db = await deps.dbStatus();
      return c.json({ ok: true, db });
    } catch {
      return c.json({ ok: false, db: null }, 503);
    }
  });
}

export type AppType = ReturnType<typeof createApp>;
