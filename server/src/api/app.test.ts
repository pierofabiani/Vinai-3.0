import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("GET /api/health", () => {
  it("risponde ok con le versioni del database", async () => {
    const app = createApp({
      dbStatus: async () => ({ postgres: "17.6", timescaledb: "2.22.0", postgis: "3.6.0" }),
    });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      db: { postgres: "17.6", timescaledb: "2.22.0", postgis: "3.6.0" },
    });
  });

  it("risponde 503 se il database non è raggiungibile", async () => {
    const app = createApp({
      dbStatus: async () => {
        throw new Error("connessione rifiutata");
      },
    });
    const res = await app.request("/api/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: null });
  });
});
