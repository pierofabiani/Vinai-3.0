// Simulatore di flotta: centraline finte che parlano con l'ingest vero, via UDP, con lo stesso
// protocollo del firmware. Il tempo è accelerato; la rete ha guasti a comando.
// Alla fine confronta ciò che le centraline hanno misurato con ciò che c'è nel database.
import { createSocket } from "node:dgram";
import type { StationConfig } from "@vinai/protocol";
import type { Sql } from "../lib/db.js";
import { decryptDeviceKey } from "../lib/keys.js";
import { appliedConfig, provisionStation, setDesiredConfig } from "../stations/repo.js";
import { type Exchange, SimStation } from "./station.js";
import { Weather } from "./weather.js";

export const SIM_IMEI_BASE = 990000000000000n;

export interface FleetOptions {
  sql: Sql;
  master: Buffer;
  host: string;
  port: number;
  stations: number;
  days: number;
  /** fine della simulazione (default: adesso) */
  end?: Date;
  uplinkLoss: number;
  ackLoss: number;
  /** scenari: centralina isolata, cambio di configurazione, APN rifiutato, sensore guasto */
  scenarios: boolean;
  imeiBase?: bigint;
  seed?: number;
  log?: (msg: string) => void;
}

export interface StationReport {
  imei: string;
  generated: number;
  saved: number;
  ok: boolean;
  problems: string[];
}

export interface FleetReport {
  stations: number;
  records: number;
  saved: number;
  sessions: number;
  failedSessions: number;
  packets: number;
  durationMs: number;
  ok: boolean;
  problems: string[];
  perStation: StationReport[];
}

/** PRNG piccolo e deterministico (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ogni centralina ha il suo socket UDP, come un modem ha il suo indirizzo: la libreria CoAP del
 * server riconosce le ritrasmissioni da (indirizzo, porta, message id), quindi due centraline
 * finte non devono mai condividere la stessa porta.
 */
function stationSocket(
  host: string,
  port: number,
  timeoutMs = 3000,
): { exchange: Exchange; close: () => void } {
  const sock = createSocket(host.includes(":") ? "udp6" : "udp4");
  let waiting: ((msg: Uint8Array | null) => void) | null = null;
  sock.on("message", (msg) => {
    const w = waiting;
    waiting = null;
    w?.(new Uint8Array(msg));
  });
  const exchange: Exchange = (datagram) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting = null;
        resolve(null);
      }, timeoutMs);
      waiting = (msg) => {
        clearTimeout(timer);
        resolve(msg);
      };
      sock.send(datagram, port, host);
    });
  return { exchange, close: () => sock.close() };
}

async function loadOrProvision(opts: FleetOptions, index: number, rand: () => number): Promise<SimStation> {
  const { sql, master } = opts;
  const imei = (opts.imeiBase ?? SIM_IMEI_BASE) + BigInt(index);
  const [row] = await sql<{ id: string; key_enc: Uint8Array; last_seq: string | null; cfg_ver: number }[]>`
    SELECT id, key_enc, last_seq, cfg_ver FROM station WHERE imei = ${imei.toString()}`;
  let id: number;
  let key: Uint8Array;
  let config: StationConfig;
  let cfgVer = 0;
  let lastSeq = 0;
  if (row) {
    id = Number(row.id);
    key = decryptDeviceKey(master, imei, row.key_enc);
    const applied = await appliedConfig(sql, id);
    config = applied.params;
    cfgVer = applied.version;
    lastSeq = Number(row.last_seq ?? 0);
  } else {
    const p = await provisionStation(sql, master, {
      imei,
      label: `Simulatore ${index + 1}`,
      serverIp: "127.0.0.1",
      status: "pronta",
    });
    id = p.id;
    key = p.key;
    config = p.factory;
  }
  const seed = Math.floor(rand() * 2 ** 31);
  return new SimStation({
    id,
    imei,
    key,
    config,
    cfgVer,
    lastSeq,
    weather: new Weather(seed, index % 3),
    seed,
  });
}

export async function runFleet(opts: FleetOptions): Promise<FleetReport> {
  const started = Date.now();
  const log = opts.log ?? (() => {});
  const rand = prng(opts.seed ?? 42);
  const fleet: SimStation[] = [];
  for (let i = 0; i < opts.stations; i++) fleet.push(await loadOrProvision(opts, i, rand));
  const sockets = new Map(fleet.map((s) => [s.id, stationSocket(opts.host, opts.port)]));
  const exchangeOf = (s: SimStation) => (sockets.get(s.id) as { exchange: Exchange }).exchange;
  try {
    return await simulate(opts, fleet, exchangeOf, rand, started, log);
  } finally {
    for (const sock of sockets.values()) sock.close();
  }
}

async function simulate(
  opts: FleetOptions,
  fleet: SimStation[],
  exchangeOf: (s: SimStation) => Exchange,
  rand: () => number,
  started: number,
  log: (msg: string) => void,
): Promise<FleetReport> {
  const end = Math.floor((opts.end ?? new Date()).getTime() / 60_000) * 60_000;
  const start = end - opts.days * 86_400_000;
  const firstSeq = new Map(fleet.map((s) => [s.id, s.lastSeq + 1]));
  // chi ha già misure nel database riparte da lì: niente sovrapposizioni con un giro precedente
  const lastTimes = await opts.sql<{ station_id: string; t: Date }[]>`
    SELECT station_id, max(time) AS t FROM measurement
    WHERE station_id = ANY(${fleet.map((s) => s.id)}) GROUP BY station_id`;
  const lastTime = new Map(lastTimes.map((r) => [Number(r.station_id), r.t.getTime()]));
  const covered = Math.max(0, ...lastTime.values());
  if (covered > start + (end - start) / 2) {
    throw new Error(
      `le centraline simulate hanno già misure fino a ${new Date(covered).toISOString()}: ` +
        "per un nuovo giro usa un'altra serie di IMEI (--imei-base)",
    );
  }
  for (const s of fleet) s.start(Math.max(start, lastTime.get(s.id) ?? 0));

  // scenari a metà strada, su centraline diverse
  const at = (f: number) => start + Math.floor((end - start) * f);
  const badApn = opts.scenarios ? fleet[0] : undefined;
  const isolated = opts.scenarios && fleet.length > 1 ? fleet[1] : undefined;
  const faulty = opts.scenarios && fleet.length > 2 ? fleet[2] : undefined;
  const changed = opts.scenarios ? fleet.slice(3).filter((_, i) => i % 10 === 0) : [];
  if (isolated) isolated.offlineUntil = at(0.25) + Math.min(3, opts.days / 2) * 86_400_000;
  if (faulty) {
    faulty.humFaultFrom = at(0.6);
    faulty.humFaultUntil = at(0.6) + 6 * 3_600_000;
  }
  if (badApn) badApn.rejectedApn = "apn.rifiutato";
  let badApnVersion = 0;
  const changedVersions = new Map<number, number>();
  let configsSet = false;
  let badApnSet = false;
  const net = { uplinkLoss: opts.uplinkLoss, ackLoss: opts.ackLoss };

  log(
    `${fleet.length} centraline, ${opts.days} giorni simulati, perdite ${opts.uplinkLoss * 100}% / ${opts.ackLoss * 100}%`,
  );
  let lastDay = -1;
  for (let t = start; t <= end; t += 60_000) {
    if (badApn && !badApnSet && t >= at(0.4)) {
      badApnSet = true;
      badApnVersion = await setDesiredConfig(
        opts.sql,
        badApn.id,
        { ...badApn.config, apn: "apn.rifiutato" },
        "simulatore",
      );
    }
    if (!configsSet && t >= at(0.5)) {
      configsSet = true;
      for (const s of changed) {
        changedVersions.set(
          s.id,
          await setDesiredConfig(
            opts.sql,
            s.id,
            { ...s.config, interval_min: 15, send_every: 4 },
            "simulatore",
          ),
        );
      }
    }
    const due: SimStation[] = [];
    for (const s of fleet) {
      const d = s.dueAt(t);
      if (d.measure) s.measure(t);
      if (s.dueAt(t).send) due.push(s);
      if (rand() < 0.02 / 1440) s.reset();
    }
    if (due.length) await Promise.all(due.map((s) => s.session(t, net, exchangeOf(s), rand)));
    const day = Math.floor((t - start) / 86_400_000);
    if (day !== lastDay) {
      lastDay = day;
      if (day > 0) log(`giorno ${day}/${opts.days}`);
    }
  }

  // fine: rete perfetta finché ogni centralina ha svuotato la sua memoria
  log("svuotamento degli arretrati");
  net.uplinkLoss = 0;
  net.ackLoss = 0;
  for (const s of fleet) s.offlineUntil = 0;
  for (let round = 0; round < 50 && fleet.some((s) => s.acked < s.lastSeq); round++) {
    const t = end + (round + 1) * 60_000;
    const pending = fleet.filter((s) => s.acked < s.lastSeq);
    for (const s of pending) s.forceSend(t);
    await Promise.all(pending.map((s) => s.session(t, net, exchangeOf(s), rand)));
  }

  return verify(opts.sql, fleet, firstSeq, { badApn, badApnVersion, changedVersions }, started);
}

async function verify(
  sql: Sql,
  fleet: SimStation[],
  firstSeq: Map<number, number>,
  sc: { badApn: SimStation | undefined; badApnVersion: number; changedVersions: Map<number, number> },
  started: number,
): Promise<FleetReport> {
  const perStation: StationReport[] = [];
  for (const s of fleet) {
    const from = firstSeq.get(s.id) ?? 1;
    const problems: string[] = [];
    const [db] = await sql<
      {
        n: number;
        min_seq: string | null;
        max_seq: string | null;
        temp_sum: string | null;
        hum_null: number;
        wet: string | null;
      }[]
    >`
      SELECT count(*)::int AS n, min(seq) AS min_seq, max(seq) AS max_seq,
             sum(round(temp_c * 10))::bigint AS temp_sum,
             count(*) FILTER (WHERE hum_pct IS NULL)::int AS hum_null,
             sum(wet_min)::bigint AS wet
      FROM measurement WHERE station_id = ${s.id} AND seq >= ${from}`;
    const g = s.generated;
    const expTemp = g.reduce((a, r) => a + r.temp_dC, 0);
    const expHumNull = g.filter((r) => r.hum_dPct === 0xffff).length;
    const expWet = g.reduce((a, r) => a + r.wet_min, 0);
    if ((db?.n ?? 0) !== g.length) problems.push(`misure: ${db?.n} salvate, ${g.length} generate`);
    if (g.length && (Number(db?.min_seq) !== g[0]?.seq || Number(db?.max_seq) !== g.at(-1)?.seq))
      problems.push(`sequenze ${db?.min_seq}-${db?.max_seq}, attese ${g[0]?.seq}-${g.at(-1)?.seq}`);
    if (Number(db?.temp_sum ?? 0) !== expTemp) problems.push("valori di temperatura diversi");
    if ((db?.hum_null ?? 0) !== expHumNull)
      problems.push(`umidità guasta: ${db?.hum_null} NULL, attesi ${expHumNull}`);
    if (Number(db?.wet ?? 0) !== expWet) problems.push("minuti di bagnatura diversi");
    if (s.acked !== s.lastSeq)
      problems.push(`arretrato non svuotato: confermato ${s.acked}, ultimo ${s.lastSeq}`);
    if (s.rejectedOffers > 0) problems.push(`configurazione rifiutata reinviata ${s.rejectedOffers} volte`);

    if (s === sc.badApn && sc.badApnVersion) {
      const [cv] =
        await sql`SELECT status FROM config_version WHERE station_id = ${s.id} AND version = ${sc.badApnVersion}`;
      if (cv?.status !== "rifiutata") problems.push(`APN rifiutato: versione in stato ${cv?.status}`);
      if (s.cfgRejected !== sc.badApnVersion)
        problems.push("la centralina non è tornata alla rete precedente");
    }
    const changedVer = sc.changedVersions.get(s.id);
    if (changedVer) {
      const [cv] =
        await sql`SELECT status FROM config_version WHERE station_id = ${s.id} AND version = ${changedVer}`;
      if (cv?.status !== "applicata") problems.push(`cambio di intervallo: versione in stato ${cv?.status}`);
      const tail = g.slice(-3);
      if (tail.length === 3 && (tail[2]?.time ?? 0) - (tail[1]?.time ?? 0) !== 900)
        problems.push("dopo il cambio le misure non sono ogni 15 minuti");
    }
    perStation.push({
      imei: s.imei.toString(),
      generated: g.length,
      saved: db?.n ?? 0,
      ok: problems.length === 0,
      problems,
    });
  }
  const problems = perStation.flatMap((p) => p.problems.map((x) => `${p.imei}: ${x}`));
  // ogni datagramma spedito deve risultare tra i pacchetti grezzi, nessuno escluso
  const sent = fleet.reduce((a, s) => a + s.packets, 0);
  const [raw] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM raw_packet
    WHERE received_at >= ${new Date(started)} AND station_id = ANY(${fleet.map((s) => s.id)})`;
  if (raw?.n !== sent) problems.push(`pacchetti grezzi: ${raw?.n} salvati, ${sent} spediti`);
  return {
    stations: fleet.length,
    records: perStation.reduce((a, p) => a + p.generated, 0),
    saved: perStation.reduce((a, p) => a + p.saved, 0),
    sessions: fleet.reduce((a, s) => a + s.sessions, 0),
    failedSessions: fleet.reduce((a, s) => a + s.failedSessions, 0),
    packets: fleet.reduce((a, s) => a + s.packets, 0),
    durationMs: Date.now() - started,
    ok: problems.length === 0,
    problems,
    perStation,
  };
}
