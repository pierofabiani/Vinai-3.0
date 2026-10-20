// Prove di ingest su database vero e UDP vero, con i datagrammi generati dal firmware C.
import { createSocket } from "node:dgram";
import { readFileSync } from "node:fs";
import {
  applyConfigTlv,
  type CoapRx,
  coapBuildPost,
  coapParse,
  configDefaults,
  decodeDownlink,
  encodeUplink,
  type StationConfig,
  toStationTime,
  type Uplink,
} from "@vinai/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionStation, setDesiredConfig } from "../stations/repo.js";
import { TEST_MASTER, testSql } from "../test/db.js";
import { startIngest } from "./main.js";
import { handleUplink } from "./uplink.js";

const vectors = JSON.parse(
  readFileSync(new URL("../../../packages/protocol/vectors/firmware.json", import.meta.url), "utf8"),
);
const hex = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const PORT = 15683;

const sql = testSql();
const logs: string[] = [];
let stopIngest: (() => Promise<void>) & { ready: Promise<void> };

beforeAll(async () => {
  process.env.STATION_KEY_SECRET = TEST_MASTER.toString("hex");
  stopIngest = startIngest({ sql, port: PORT, log: (m) => logs.push(m) });
  await stopIngest.ready;
});

afterAll(async () => {
  await stopIngest();
  await sql.end();
});

/** Un giro come lo fa la centralina: datagramma CoAP, attesa della risposta allegata all'ACK. */
function exchange(datagram: Uint8Array, msgId: number, token: Uint8Array): Promise<CoapRx> {
  return new Promise((resolve, reject) => {
    const sock = createSocket("udp4");
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error("nessuna risposta"));
    }, 5000);
    sock.on("message", (msg) => {
      const rx = coapParse(new Uint8Array(msg), msgId, token);
      if (rx.kind === "other") return;
      clearTimeout(timer);
      sock.close();
      resolve(rx);
    });
    sock.send(datagram, PORT, "127.0.0.1");
  });
}

let nextMsgId = 0x2000;
async function sendUplink(u: Uplink, key: Uint8Array) {
  const payload = encodeUplink(u, key);
  const msgId = nextMsgId++;
  const token = Uint8Array.from([1, 2, (msgId >> 8) & 0xff, msgId & 0xff]);
  const rx = await exchange(coapBuildPost(msgId, token, payload), msgId, token);
  if (rx.kind !== "response") return { rx, down: null };
  const tag = payload.slice(payload.length - 8, payload.length - 4);
  const down = decodeDownlink(rx.payload, key, tag);
  if (!down.ok) throw new Error(`risposta non valida: ${down.error}`);
  return { rx, down: down.value };
}

const v0 = vectors.uplinks[0];
const v0key = hex(v0.key);
async function decodedVector0(): Promise<Uplink> {
  const { decodeUplink } = await import("@vinai/protocol");
  const d = decodeUplink(hex(v0.payload), v0key);
  if (!d.ok) throw new Error("vettore 0 non decodificabile");
  return d.value;
}

describe("ingest CoAP con i datagrammi del firmware", () => {
  it("salva le misure, conferma l'ultima sequenza e attiva la centralina", async () => {
    const st = await provisionStation(sql, TEST_MASTER, {
      imei: BigInt(v0.imei),
      serverIp: "10.0.0.1",
      status: "pronta",
      key: v0key,
    });
    const rx = await exchange(hex(v0.coap.datagram), v0.coap.msg_id, hex(v0.coap.token));
    expect(rx.kind).toBe("response");
    if (rx.kind !== "response") return;
    expect(rx.code).toBe(0x44); // 2.04
    const down = decodeDownlink(rx.payload, v0key, hex(v0.tag));
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    expect(down.value.acked_seq).toBe(6);
    expect(down.value.cfg.length).toBe(0);
    expect(Math.abs(down.value.server_time - toStationTime(new Date()))).toBeLessThan(5);

    const rows = await sql<
      { seq: string; temp_c: number; hum_pct: number; press_hpa: number; wet_min: number }[]
    >`
      SELECT seq, temp_c, hum_pct, press_hpa, wet_min FROM measurement WHERE station_id = ${st.id} ORDER BY seq`;
    expect(rows.map((r) => Number(r.seq))).toEqual([1, 2, 3, 4, 5, 6]);
    const r0 = v0.records[0];
    expect(rows[0]?.temp_c).toBeCloseTo(r0.temp_dC / 10, 5);
    expect(rows[0]?.hum_pct).toBeCloseTo(r0.hum_dPct / 10, 5);
    expect(rows[0]?.press_hpa).toBeCloseTo(r0.press_dhPa / 10, 3);
    expect(rows[0]?.wet_min).toBe(r0.wet_min);

    const [s] = await sql`SELECT status, last_seq, fw_ver FROM station WHERE id = ${st.id}`;
    expect(s).toMatchObject({ status: "attiva", last_seq: "6", fw_ver: 0x0300 });
    const [h] = await sql`SELECT batt_mv, rsrp_dbm, n_records FROM health WHERE station_id = ${st.id}`;
    expect(h).toEqual({ batt_mv: 4410, rsrp_dbm: -97, n_records: 6 });
  });

  it("un reinvio non crea doppioni e riceve la stessa conferma", async () => {
    // stesso pacchetto, nuovo messaggio CoAP: come dopo una conferma persa per strada
    const payload = hex(v0.payload);
    const token = hex("0badf00d");
    const rx = await exchange(coapBuildPost(0x7777, token, payload), 0x7777, token);
    expect(rx.kind).toBe("response");
    if (rx.kind !== "response") return;
    const down = decodeDownlink(rx.payload, v0key, hex(v0.tag));
    expect(down.ok && down.value.acked_seq).toBe(6);
    const [c] = await sql`SELECT count(*)::int AS n FROM measurement m JOIN station s ON s.id = m.station_id
                          WHERE s.imei = ${v0.imei}`;
    expect(c?.n).toBe(6);
    const [raw] = await sql`SELECT result FROM raw_packet ORDER BY received_at DESC LIMIT 1`;
    expect(raw?.result).toBe("duplicato");
  });

  it("sensori guasti diventano NULL, non numeri", async () => {
    const v = vectors.uplinks[3];
    await provisionStation(sql, TEST_MASTER, { imei: BigInt(v.imei), serverIp: "10.0.0.1", key: hex(v.key) });
    const rx = await exchange(hex(v.coap.datagram), v.coap.msg_id, hex(v.coap.token));
    expect(rx.kind).toBe("response");
    const rows = await sql`
      SELECT temp_c, hum_pct, press_hpa, flags FROM measurement m JOIN station s ON s.id = m.station_id
      WHERE s.imei = ${v.imei} ORDER BY seq`;
    expect(rows[0]).toMatchObject({ temp_c: null, flags: 1 });
    expect(rows[0]?.hum_pct).not.toBeNull();
    expect(rows[1]).toMatchObject({ temp_c: -15.3, hum_pct: null, press_hpa: null });
  });

  it("firma sbagliata e centralina sconosciuta: 4.01, pacchetto grezzo comunque salvato", async () => {
    const tampered = hex(v0.payload);
    tampered[35] = (tampered[35] as number) ^ 0xff;
    const t1 = hex("00000001");
    const rx1 = await exchange(coapBuildPost(0x1001, t1, tampered), 0x1001, t1);
    expect(rx1).toEqual({ kind: "error", code: 0x81 });

    // il vettore 2 ha lo stesso IMEI del vettore 0 ma un'altra chiave: la firma non torna
    const sameImeiOtherKey = vectors.uplinks[2];
    const t3 = hex("00000003");
    const rx3 = await exchange(coapBuildPost(0x1003, t3, hex(sameImeiOtherKey.payload)), 0x1003, t3);
    expect(rx3).toEqual({ kind: "error", code: 0x81 });

    const unknown = encodeUplink({ ...(await decodedVector0()), imei: 999999999999999n }, v0key);
    const t2 = hex("00000002");
    const rx2 = await exchange(coapBuildPost(0x1002, t2, unknown), 0x1002, t2);
    expect(rx2).toEqual({ kind: "error", code: 0x81 });

    const raws = await sql`SELECT result FROM raw_packet ORDER BY received_at DESC LIMIT 3`;
    expect(raws.map((r) => r.result).sort()).toEqual(["firma", "firma", "sconosciuta"]);
  });

  it("database irraggiungibile: 5.03 e nessuna conferma", async () => {
    const postgres = (await import("postgres")).default;
    const dead = postgres("postgres://x:x@127.0.0.1:1/x", { connect_timeout: 1, max: 1 });
    const out = await handleUplink(
      { sql: dead, master: TEST_MASTER, now: () => new Date(), log: () => {} },
      hex(v0.payload),
      { address: "127.0.0.1", port: 1 },
    );
    expect(out.reply).toEqual({ code: "5.03" });
    await dead.end();
  });
});

describe("configurazione remota", () => {
  const key = Uint8Array.from({ length: 16 }, (_, i) => 200 - i);
  const imei = 861234500000001n;
  let stationId = 0;
  let seq = 0;
  let current: StationConfig = configDefaults("10.0.0.1");
  let cfgVer = 0;
  let cfgRejected = 0;

  const uplink = (): Uplink => {
    seq += 1;
    return {
      imei,
      fw_ver: 0x0300,
      cfg_ver: cfgVer,
      health: {
        batt_mv: 4300,
        rsrp_dbm: -90,
        snr_db: 5,
        csq: 20,
        last_reset: 0,
        reset_count: 0,
        modem_fails: 0,
        lost_records: 0,
        cfg_rejected: cfgRejected,
      },
      first_seq: seq,
      records: [
        {
          seq,
          time: toStationTime(new Date()) - 60,
          temp_dC: 150,
          hum_dPct: 600,
          press_dhPa: 10100,
          wet_raw: 1700,
          wet_min: 0,
          flags: 0,
        },
      ],
    };
  };

  beforeAll(async () => {
    stationId = (await provisionStation(sql, TEST_MASTER, { imei, serverIp: "10.0.0.1", key })).id;
  });

  it("invia solo le differenze, la centralina le applica e il server la segna applicata", async () => {
    const wanted = { ...current, interval_min: 15, send_every: 4 };
    const version = await setDesiredConfig(sql, stationId, wanted, "test");
    expect(version).toBe(1);
    const { down } = await sendUplink(uplink(), key);
    expect(down?.cfg_ver).toBe(1);
    expect(down?.cfg.length).toBe(6); // due parametri da un byte: 2 × (tag + lunghezza + valore)
    const applied = applyConfigTlv(current, down?.cfg ?? new Uint8Array());
    expect(applied).toEqual({ ok: true, config: wanted });
    if (applied.ok) current = applied.config;
    cfgVer = 1;

    const { down: d2 } = await sendUplink(uplink(), key);
    expect(d2?.cfg.length).toBe(0);
    const [cv] = await sql`SELECT status FROM config_version WHERE station_id = ${stationId} AND version = 1`;
    expect(cv?.status).toBe("applicata");
  });

  it("una versione rifiutata dalla centralina non viene più inviata", async () => {
    const version = await setDesiredConfig(sql, stationId, { ...current, apn: "apn.sbagliato" }, "test");
    expect(version).toBe(2);
    const { down } = await sendUplink(uplink(), key);
    expect(down?.cfg_ver).toBe(2);
    // la rete non accetta l'APN: la centralina torna alla versione 1 e segnala la 2
    cfgRejected = 2;
    const { down: d2 } = await sendUplink(uplink(), key);
    expect(d2?.cfg.length).toBe(0);
    const { down: d3 } = await sendUplink(uplink(), key);
    expect(d3?.cfg.length).toBe(0);
    const [cv] = await sql`SELECT status FROM config_version WHERE station_id = ${stationId} AND version = 2`;
    expect(cv?.status).toBe("rifiutata");

    const v3 = await setDesiredConfig(sql, stationId, { ...current, wet_threshold: 1400 }, "test");
    expect(v3).toBe(3);
    const { down: d4 } = await sendUplink(uplink(), key);
    expect(d4?.cfg_ver).toBe(3);
    expect(applyConfigTlv(current, d4?.cfg ?? new Uint8Array())).toEqual({
      ok: true,
      config: { ...current, wet_threshold: 1400 },
    });
  });

  it("una configurazione uguale a quella in uso non crea una versione nuova", async () => {
    const [st] = await sql<{ cfg_ver: number }[]>`SELECT cfg_ver FROM station WHERE id = ${stationId}`;
    const [before] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM config_version WHERE station_id = ${stationId}`;
    const applied = (await import("../stations/repo.js")).appliedConfig;
    const { params } = await applied(sql, stationId);
    expect(await setDesiredConfig(sql, stationId, params, "test")).toBe(st?.cfg_ver);
    const [after] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM config_version WHERE station_id = ${stationId}`;
    expect(after?.n).toBe(before?.n);
  });

  it("rifiuta una configurazione che il firmware non accetterebbe", async () => {
    await expect(setDesiredConfig(sql, stationId, { ...current, bands: [7] }, "test")).rejects.toThrow(
      /bande/,
    );
  });
});
