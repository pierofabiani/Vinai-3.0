// Sviluppo: migrazioni, poi api, ingest e worker nello stesso processo. In produzione girano separati.
import { startApi } from "./api/main.js";
import { migrate } from "./db/migrate.js";
import { startIngest } from "./ingest/main.js";
import { connect } from "./lib/db.js";
import { loadEnv } from "./lib/env.js";
import { startWorker } from "./worker/main.js";

const sql = connect(loadEnv().DATABASE_URL);
const applied = await migrate(sql);
if (applied.length) console.log(`[db] migrazioni applicate: ${applied.join(", ")}`);
await sql.end();

const stops = [startApi(), startIngest(), await startWorker()];

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await Promise.allSettled(stops.map((stop) => stop()));
    process.exit(0);
  });
}
