// Job pianificati (radar, previsioni, centraline mute, notifiche): da P1 in poi.
// Fase P0: avvia la coda pg-boss, che crea il suo schema nel database.
import { PgBoss } from "pg-boss";
import { loadEnv } from "../lib/env.js";

export async function startWorker() {
  const env = loadEnv();
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) => console.error("[worker]", err));
  await boss.start();
  console.log("[worker] coda pg-boss avviata");
  return async () => {
    await boss.stop();
  };
}

if (import.meta.url === `file://${process.argv[1]}`) void startWorker();
