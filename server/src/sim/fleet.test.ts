// Prova di flotta ridotta (per il CI): stesse regole e scenari della prova da 50 × 7 giorni.
import { afterAll, beforeAll, expect, it } from "vitest";
import { startIngest } from "../ingest/main.js";
import { TEST_MASTER, testSql } from "../test/db.js";
import { runFleet } from "./fleet.js";

const sql = testSql();
const PORT = 15684;
let stop: (() => Promise<void>) & { ready: Promise<void> };

beforeAll(async () => {
  process.env.STATION_KEY_SECRET = TEST_MASTER.toString("hex");
  stop = startIngest({ sql, port: PORT, log: () => {} });
  await stop.ready;
});

afterAll(async () => {
  await stop();
  await sql.end();
});

it("12 centraline × 2 giorni con perdite, isolamento, APN rifiutato e cambio di intervallo: nessuna misura persa", async () => {
  const report = await runFleet({
    sql,
    master: TEST_MASTER,
    host: "127.0.0.1",
    port: PORT,
    stations: 12,
    days: 2,
    uplinkLoss: 0.1,
    ackLoss: 0.1,
    scenarios: true,
    imeiBase: 980000000000000n,
    seed: 7,
  });
  expect(report.problems).toEqual([]);
  expect(report.records).toBeGreaterThan(12 * 250);
  expect(report.failedSessions).toBeGreaterThan(0); // le perdite ci sono state davvero
  const dups =
    await sql`SELECT result, count(*)::int AS n FROM raw_packet WHERE result = 'duplicato' GROUP BY result`;
  expect(dups[0]?.n ?? 0).toBeGreaterThan(0); // e i reinvii sono stati scartati
}, 120_000);
