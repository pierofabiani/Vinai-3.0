// Gestione di un pacchetto della centralina: dal datagramma alla risposta firmata.
// Regole (docs/piattaforma.md, sezione 5):
// - il pacchetto grezzo si salva per primo, prima di qualsiasi decodifica;
// - si conferma (acked_seq) solo ciò che è già nel database: se il salvataggio fallisce, nessun ACK;
// - una versione di configurazione rifiutata dalla centralina non si reinvia mai.
import {
  decodeUplink,
  encodeConfigDiff,
  encodeDownlink,
  fromStationTime,
  peekUplinkImei,
  REC_TEMP_FAULT,
  REC_U16_FAULT,
  RecordFlag,
  type StationConfig,
  type StationRecord,
  toStationTime,
  type Uplink,
  uplinkTag,
} from "@vinai/protocol";
import type { Sql, Tx } from "../lib/db.js";
import { decryptDeviceKey } from "../lib/keys.js";

export interface IngestContext {
  sql: Sql;
  master: Buffer;
  now: () => Date;
  log: (msg: string) => void;
}

export interface Source {
  address: string;
  port: number;
}

/** Codici CoAP: 2.04 con la conferma firmata, oppure un errore senza payload. */
export type Reply =
  | { code: "2.04"; payload: Uint8Array }
  | { code: "4.00" } // non è un pacchetto nostro
  | { code: "4.01" } // centralina sconosciuta o firma sbagliata
  | { code: "5.03" }; // database non disponibile: la centralina tiene i dati e riprova

interface StationRow {
  id: string;
  key_enc: Uint8Array;
  factory_config: StationConfig;
}

export interface UplinkOutcome {
  reply: Reply;
  stationId?: number;
  inserted?: number;
  configSent?: number;
}

const flag = (r: StationRecord, f: number) => (r.flags & f) !== 0;

/** Valori in unità reali; NULL per i sensori guasti. Mai valori inventati. */
function toRow(stationId: number, r: StationRecord) {
  return {
    station_id: stationId,
    time: fromStationTime(r.time),
    seq: r.seq,
    temp_c: flag(r, RecordFlag.TEMP_FAULT) || r.temp_dC === REC_TEMP_FAULT ? null : r.temp_dC / 10,
    hum_pct: flag(r, RecordFlag.HUM_FAULT) || r.hum_dPct === REC_U16_FAULT ? null : r.hum_dPct / 10,
    press_hpa: flag(r, RecordFlag.PRESS_FAULT) || r.press_dhPa === REC_U16_FAULT ? null : r.press_dhPa / 10,
    wet_raw: flag(r, RecordFlag.WET_FAULT) || r.wet_raw === REC_U16_FAULT ? null : r.wet_raw,
    wet_min: r.wet_min,
    flags: r.flags,
  };
}

/** Ultima sequenza confermabile: la fine di questo pacchetto (u32 come nel firmware). */
export function ackedSeq(u: Uplink): number {
  return (u.first_seq + u.records.length - 1) >>> 0;
}

export async function handleUplink(
  ctx: IngestContext,
  payload: Uint8Array,
  src: Source,
): Promise<UplinkOutcome> {
  const { sql } = ctx;
  const receivedAt = ctx.now();
  let rawId: string;
  try {
    const [raw] = await sql<{ id: string }[]>`
      INSERT INTO raw_packet (received_at, src_addr, src_port, payload)
      VALUES (${receivedAt}, ${src.address}, ${src.port}, ${Buffer.from(payload)})
      RETURNING id`;
    rawId = raw?.id ?? "";
  } catch (err) {
    ctx.log(
      `database non disponibile, pacchetto da ${src.address} non confermato: ${(err as Error).message}`,
    );
    return { reply: { code: "5.03" } };
  }

  // Dentro una transazione va passata la transazione stessa: con il pool si chiederebbe una seconda
  // connessione mentre la prima resta occupata, e sotto carico il pool si blocca.
  const mark = (
    result: string,
    stationId: number | null = null,
    detail: string | null = null,
    db: Sql | Tx = sql,
  ) =>
    db`UPDATE raw_packet SET result = ${result}, station_id = ${stationId}, detail = ${detail}
       WHERE received_at = ${receivedAt} AND id = ${rawId}`;

  try {
    const imei = peekUplinkImei(payload);
    if (imei === null) {
      await mark("formato");
      return { reply: { code: "4.00" } };
    }
    const [st] = await sql<StationRow[]>`
      SELECT id, key_enc, factory_config FROM station WHERE imei = ${imei.toString()} AND status <> 'dismessa'`;
    if (!st) {
      await mark("sconosciuta", null, `IMEI ${imei}`);
      return { reply: { code: "4.01" } };
    }
    const stationId = Number(st.id);
    const key = decryptDeviceKey(ctx.master, imei, st.key_enc);
    const decoded = decodeUplink(payload, key);
    if (!decoded.ok) {
      await mark(decoded.error === "hmac" ? "firma" : "formato", stationId, decoded.error);
      return { reply: { code: decoded.error === "hmac" ? "4.01" : "4.00" }, stationId };
    }
    const u = decoded.value;

    const result = await sql.begin(async (tx) => {
      let inserted = 0;
      if (u.records.length > 0) {
        const rows = u.records.map((r) => toRow(stationId, r));
        const res = await tx`
          INSERT INTO measurement ${tx(rows, "station_id", "time", "seq", "temp_c", "hum_pct", "press_hpa", "wet_raw", "wet_min", "flags")}
          ON CONFLICT DO NOTHING`;
        inserted = res.count;
      }
      const h = u.health;
      await tx`
        INSERT INTO health (station_id, time, fw_ver, cfg_ver, batt_mv, rsrp_dbm, snr_db, csq, last_reset,
                            reset_count, modem_fails, lost_records, cfg_rejected, first_seq, n_records)
        VALUES (${stationId}, ${receivedAt}, ${u.fw_ver}, ${u.cfg_ver}, ${h.batt_mv}, ${h.rsrp_dbm}, ${h.snr_db},
                ${h.csq}, ${h.last_reset}, ${h.reset_count}, ${h.modem_fails}, ${h.lost_records},
                ${h.cfg_rejected}, ${u.first_seq}, ${u.records.length})`;
      const lastSeq = u.records.length > 0 ? ackedSeq(u) : null;
      await tx`
        UPDATE station SET
          last_seen_at = ${receivedAt},
          first_seen_at = coalesce(first_seen_at, ${receivedAt}),
          fw_ver = ${u.fw_ver},
          cfg_ver = ${u.cfg_ver},
          last_seq = CASE WHEN ${lastSeq}::bigint IS NULL THEN last_seq
                          ELSE greatest(coalesce(last_seq, 0), ${lastSeq}::bigint) END,
          status = CASE WHEN status IN ('pronta', 'installata') THEN 'attiva' ELSE status END
        WHERE id = ${stationId}`;
      const cfg = await configToSend(tx, ctx, stationId, st.factory_config, u, receivedAt);
      await mark(u.records.length > 0 && inserted === 0 ? "duplicato" : "ok", stationId, null, tx);
      return { inserted, cfg };
    });

    const response = encodeDownlink(
      {
        req_tag: uplinkTag(payload),
        acked_seq: u.records.length > 0 ? ackedSeq(u) : (u.first_seq - 1) >>> 0,
        server_time: toStationTime(ctx.now()),
        flags: 0,
        cfg_ver: result.cfg?.version ?? u.cfg_ver,
        cfg: result.cfg?.tlv ?? new Uint8Array(0),
      },
      key,
    );
    return {
      reply: { code: "2.04", payload: response },
      stationId,
      inserted: result.inserted,
      ...(result.cfg ? { configSent: result.cfg.version } : {}),
    };
  } catch (err) {
    ctx.log(`errore sul pacchetto da ${src.address}: ${(err as Error).message}`);
    await mark("errore", null, (err as Error).message).catch(() => {});
    return { reply: { code: "5.03" } };
  }
}

/** Aggiorna lo stato delle configurazioni e decide se allegarne una alla risposta. */
async function configToSend(
  tx: Tx,
  ctx: IngestContext,
  stationId: number,
  factory: StationConfig,
  u: Uplink,
  now: Date,
): Promise<{ version: number; tlv: Uint8Array } | null> {
  const rejected = u.health.cfg_rejected;
  if (rejected > 0) {
    await tx`UPDATE config_version SET status = 'rifiutata', rejected_at = coalesce(rejected_at, ${now})
             WHERE station_id = ${stationId} AND version = ${rejected} AND status <> 'rifiutata'`;
  }
  if (u.cfg_ver > 0) {
    await tx`UPDATE config_version SET status = 'applicata', applied_at = ${now}
             WHERE station_id = ${stationId} AND version = ${u.cfg_ver} AND status = 'da_inviare'`;
  }
  const [pending] = await tx<{ version: number; params: StationConfig }[]>`
    SELECT version, params FROM config_version WHERE station_id = ${stationId} AND status = 'da_inviare'`;
  if (!pending || pending.version === u.cfg_ver || pending.version === rejected) return null;

  let base: StationConfig | undefined = factory;
  if (u.cfg_ver > 0) {
    const [cur] = await tx<{ params: StationConfig }[]>`
      SELECT params FROM config_version WHERE station_id = ${stationId} AND version = ${u.cfg_ver}`;
    base = cur?.params;
  }
  if (!base) {
    ctx.log(
      `centralina ${stationId}: versione ${u.cfg_ver} sconosciuta, configurazione ${pending.version} non inviata`,
    );
    return null;
  }
  try {
    const tlv = encodeConfigDiff(base, pending.params);
    if (tlv.length === 0) {
      // la centralina ha già questi valori (con un altro numero di versione): niente da mandare
      await tx`UPDATE config_version SET status = 'superata'
               WHERE station_id = ${stationId} AND version = ${pending.version}`;
      return null;
    }
    await tx`UPDATE config_version SET sent_at = ${now} WHERE station_id = ${stationId} AND version = ${pending.version}`;
    return { version: pending.version, tlv };
  } catch (err) {
    ctx.log(
      `centralina ${stationId}: configurazione ${pending.version} non inviabile: ${(err as Error).message}`,
    );
    return null;
  }
}
