import { serve } from "@hono/node-server";
import { loadEnv } from "../lib/env.js";
import { createApp } from "./app.js";
import { buildServices } from "./services.js";

export function startApi() {
  const env = loadEnv();
  const { deps, close } = buildServices(env);
  const app = createApp(deps);
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: env.API_PORT }, (info) => {
    console.log(`[api] in ascolto su http://127.0.0.1:${info.port}/api`);
  });
  return async () => {
    server.close();
    await close();
  };
}

if (import.meta.url === `file://${process.argv[1]}`) startApi();
