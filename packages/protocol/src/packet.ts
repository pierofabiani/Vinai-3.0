// Formato dei messaggi tra centralina e server. Specchio di firmware/src/core/packet.h:
// i test lo verificano byte per byte sui vettori generati dal firmware.
import { createHmac, timingSafeEqual } from "node:crypto";
import { REC_WIRE_SIZE, readRecord, type StationRecord, writeRecord } from "./record.js";

export const PKT_PROTO_VER = 1;
export const PKT_TYPE_DATA = 0x01;
export const PKT_TYPE_ACK = 0x81;
export const PKT_HMAC_LEN = 8;
export const PKT_HEADER_LEN = 32;
export const PKT_MAX_RECORDS = 30;
export const PKT_MAX_CFG_TLV = 64;
export const DEVICE_KEY_LEN = 16;
export const DL_FLAG_FW_AVAILABLE = 0x01;
const DL_HEADER_LEN = 18;

export interface Health {
  batt_mv: number;
  rsrp_dbm: number;
  snr_db: number;
  /** AT+CSQ grezzo, 99 = sconosciuto */
  csq: number;
  last_reset: number;
  reset_count: number;
  modem_fails: number;
  lost_records: number;
  /** ultima versione di configurazione rifiutata o annullata, 0 = nessuna */
  cfg_rejected: number;
}

export interface Uplink {
  /** IMEI a 15 cifre */
  imei: bigint;
  fw_ver: number;
  cfg_ver: number;
  health: Health;
  first_seq: number;
  records: StationRecord[];
}

export interface Downlink {
  req_tag: Uint8Array;
  acked_seq: number;
  server_time: number;
  flags: number;
  cfg_ver: number;
  cfg: Uint8Array;
}

export type DecodeError = "len" | "type" | "hmac" | "tag";
export type Decoded<T> = { ok: true; value: T } | { ok: false; error: DecodeError };

export class ProtocolError extends Error {}

function sign(key: Uint8Array, msg: Uint8Array): Uint8Array {
  if (key.length !== DEVICE_KEY_LEN) throw new ProtocolError(`chiave di ${key.length} byte, ne servono 16`);
  return createHmac("sha256", key).update(msg).digest().subarray(0, PKT_HMAC_LEN);
}

function sameMac(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

/** Tag della richiesta: primi 4 byte dell'HMAC dell'uplink. */
export function uplinkTag(payload: Uint8Array): Uint8Array {
  return payload.slice(payload.length - PKT_HMAC_LEN, payload.length - PKT_HMAC_LEN + 4);
}

/**
 * Legge l'IMEI senza verificare la firma: serve solo a cercare la chiave della centralina.
 * Ritorna null se il pacchetto non ha la forma di un uplink.
 */
export function peekUplinkImei(payload: Uint8Array): bigint | null {
  if (payload.length < PKT_HEADER_LEN + PKT_HMAC_LEN) return null;
  if (payload[0] !== PKT_PROTO_VER || payload[1] !== PKT_TYPE_DATA) return null;
  return view(payload).getBigUint64(2, true);
}

export function encodeUplink(u: Uplink, key: Uint8Array): Uint8Array {
  const n = Math.min(u.records.length, PKT_MAX_RECORDS);
  const len = PKT_HEADER_LEN + n * REC_WIRE_SIZE;
  const out = new Uint8Array(len + PKT_HMAC_LEN);
  const v = view(out);
  out[0] = PKT_PROTO_VER;
  out[1] = PKT_TYPE_DATA;
  v.setBigUint64(2, u.imei, true);
  v.setUint16(10, u.fw_ver, true);
  v.setUint16(12, u.cfg_ver, true);
  const h = u.health;
  v.setUint16(14, h.batt_mv, true);
  v.setInt8(16, h.rsrp_dbm);
  v.setInt8(17, h.snr_db);
  v.setUint8(18, h.csq);
  v.setUint8(19, h.last_reset);
  v.setUint16(20, h.reset_count, true);
  v.setUint8(22, h.modem_fails);
  v.setUint16(23, h.lost_records, true);
  v.setUint16(25, h.cfg_rejected, true);
  v.setUint32(27, u.first_seq, true);
  out[31] = n;
  for (let i = 0; i < n; i++) {
    const r = u.records[i] as StationRecord;
    writeRecord(v, PKT_HEADER_LEN + i * REC_WIRE_SIZE, r);
  }
  out.set(sign(key, out.subarray(0, len)), len);
  return out;
}

export function decodeUplink(payload: Uint8Array, key: Uint8Array): Decoded<Uplink> {
  if (payload.length < PKT_HEADER_LEN + PKT_HMAC_LEN) return { ok: false, error: "len" };
  if (payload[0] !== PKT_PROTO_VER || payload[1] !== PKT_TYPE_DATA) return { ok: false, error: "type" };
  const n = payload[31] as number;
  if (n > PKT_MAX_RECORDS || payload.length !== PKT_HEADER_LEN + n * REC_WIRE_SIZE + PKT_HMAC_LEN) {
    return { ok: false, error: "len" };
  }
  const body = payload.subarray(0, payload.length - PKT_HMAC_LEN);
  if (!sameMac(sign(key, body), payload.subarray(payload.length - PKT_HMAC_LEN))) {
    return { ok: false, error: "hmac" };
  }
  const v = view(payload);
  const first_seq = v.getUint32(27, true);
  const records: StationRecord[] = [];
  for (let i = 0; i < n; i++) {
    // la sequenza è u32 nel firmware: si avvolge come lì
    records.push(readRecord(v, PKT_HEADER_LEN + i * REC_WIRE_SIZE, (first_seq + i) >>> 0));
  }
  return {
    ok: true,
    value: {
      imei: v.getBigUint64(2, true),
      fw_ver: v.getUint16(10, true),
      cfg_ver: v.getUint16(12, true),
      health: {
        batt_mv: v.getUint16(14, true),
        rsrp_dbm: v.getInt8(16),
        snr_db: v.getInt8(17),
        csq: v.getUint8(18),
        last_reset: v.getUint8(19),
        reset_count: v.getUint16(20, true),
        modem_fails: v.getUint8(22),
        lost_records: v.getUint16(23, true),
        cfg_rejected: v.getUint16(25, true),
      },
      first_seq,
      records,
    },
  };
}

export function encodeDownlink(d: Downlink, key: Uint8Array): Uint8Array {
  if (d.req_tag.length !== 4) throw new ProtocolError("req_tag deve essere di 4 byte");
  if (d.cfg.length > PKT_MAX_CFG_TLV)
    throw new ProtocolError(`configurazione di ${d.cfg.length} byte, massimo 64`);
  const len = DL_HEADER_LEN + d.cfg.length;
  const out = new Uint8Array(len + PKT_HMAC_LEN);
  const v = view(out);
  out[0] = PKT_PROTO_VER;
  out[1] = PKT_TYPE_ACK;
  out.set(d.req_tag, 2);
  v.setUint32(6, d.acked_seq, true);
  v.setUint32(10, d.server_time, true);
  out[14] = d.flags;
  v.setUint16(15, d.cfg_ver, true);
  out[17] = d.cfg.length;
  out.set(d.cfg, DL_HEADER_LEN);
  out.set(sign(key, out.subarray(0, len)), len);
  return out;
}

export function decodeDownlink(
  payload: Uint8Array,
  key: Uint8Array,
  expectedTag: Uint8Array,
): Decoded<Downlink> {
  if (payload.length < DL_HEADER_LEN + PKT_HMAC_LEN) return { ok: false, error: "len" };
  if (payload[0] !== PKT_PROTO_VER || payload[1] !== PKT_TYPE_ACK) return { ok: false, error: "type" };
  const cl = payload[17] as number;
  if (cl > PKT_MAX_CFG_TLV || payload.length !== DL_HEADER_LEN + cl + PKT_HMAC_LEN)
    return { ok: false, error: "len" };
  const body = payload.subarray(0, payload.length - PKT_HMAC_LEN);
  if (!sameMac(sign(key, body), payload.subarray(payload.length - PKT_HMAC_LEN))) {
    return { ok: false, error: "hmac" };
  }
  if (!sameMac(payload.subarray(2, 6), expectedTag)) return { ok: false, error: "tag" };
  const v = view(payload);
  return {
    ok: true,
    value: {
      req_tag: payload.slice(2, 6),
      acked_seq: v.getUint32(6, true),
      server_time: v.getUint32(10, true),
      flags: payload[14] as number,
      cfg_ver: v.getUint16(15, true),
      cfg: payload.slice(DL_HEADER_LEN, DL_HEADER_LEN + cl),
    },
  };
}
