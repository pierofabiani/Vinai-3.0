// Sviluppo: api, ingest e worker nello stesso processo. In produzione girano separati.
import { startApi } from "./api/main.js";
import { startIngest } from "./ingest/main.js";
import { startWorker } from "./worker/main.js";

const stops = [startApi(), startIngest(), await startWorker()];

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await Promise.allSettled(stops.map((stop) => stop()));
    process.exit(0);
  });
}
