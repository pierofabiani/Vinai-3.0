// pnpm sim -- --stations 50 --days 7 --loss 0.05 --ack-loss 0.05
// Simula una flotta contro l'ingest in esecuzione (pnpm dev) e verifica il database.
import { parseArgs } from "node:util";
import { connect } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { parseMasterKey } from "../lib/keys.js";
import { runFleet } from "./fleet.js";

const { values } = parseArgs({
  options: {
    stations: { type: "string", default: "10" },
    days: { type: "string", default: "2" },
    loss: { type: "string", default: "0.05" },
    "ack-loss": { type: "string", default: "0.05" },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string" },
    "no-scenarios": { type: "boolean", default: false },
    seed: { type: "string", default: "42" },
    "imei-base": { type: "string" },
  },
});

const env = loadEnv();
const sql = connect(env.DATABASE_URL);
try {
  const report = await runFleet({
    sql,
    master: parseMasterKey(env.STATION_KEY_SECRET),
    host: values.host,
    port: Number(values.port ?? env.COAP_PORT),
    stations: Number(values.stations),
    days: Number(values.days),
    uplinkLoss: Number(values.loss),
    ackLoss: Number(values["ack-loss"]),
    scenarios: !values["no-scenarios"],
    seed: Number(values.seed),
    ...(values["imei-base"] ? { imeiBase: BigInt(values["imei-base"]) } : {}),
    log: (m) => console.log(`[sim] ${m}`),
  });
  console.log(
    `[sim] ${report.stations} centraline · ${report.records} misure generate · ${report.saved} nel database · ` +
      `${report.sessions} sessioni (${report.failedSessions} fallite) · ${report.packets} pacchetti · ` +
      `${(report.durationMs / 1000).toFixed(1)} s`,
  );
  if (report.ok)
    console.log("[sim] VERIFICA SUPERATA: nessuna misura persa, nessun doppione, configurazioni corrette");
  else {
    console.log("[sim] VERIFICA FALLITA:");
    for (const p of report.problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
