import { serve } from "@hono/node-server";
import { connect, dbStatus } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { createApp } from "./app.js";

export function startApi() {
  const env = loadEnv();
  const sql = connect(env.DATABASE_URL);
  const app = createApp({ dbStatus: () => dbStatus(sql) });
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: env.API_PORT }, (info) => {
    console.log(`[api] in ascolto su http://127.0.0.1:${info.port}/api`);
  });
  return async () => {
    server.close();
    await sql.end();
  };
}

if (import.meta.url === `file://${process.argv[1]}`) startApi();
