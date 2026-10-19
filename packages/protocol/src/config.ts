// Parametri della centralina modificabili da remoto. Specchio di firmware/src/core/config.c.
// Il server manda solo i parametri che cambiano, come TLV: tutti insieme non stanno nei 64 byte.
import { PKT_MAX_CFG_TLV, ProtocolError } from "./packet.js";

export const CFG_NO_HOUR = 0xff;
export const CFG_ALERT_OFF = -32768;
export const CFG_APN_MAX = 29;
export const CFG_BANDS_MAX = 4;
/** bande NB-IoT supportate dal SIM7020E (versione europea) */
export const SUPPORTED_BANDS = [1, 3, 5, 8, 20, 28] as const;

export const CfgTag = {
  INTERVAL: 1,
  SEND_EVERY: 2,
  WET_SAMPLE: 3,
  WET_THRESH: 4,
  WET_HYST: 5,
  WET_POL: 6,
  SERVER: 7,
  QUIET: 8,
  FROST: 9,
  LOW_BATT: 10,
  APN: 11,
  BANDS: 12,
  PLMN: 13,
} as const;

export interface StationConfig {
  interval_min: number;
  send_every: number;
  wet_sample_s: number;
  wet_threshold: number;
  wet_hyst: number;
  wet_polarity: number;
  /** "a.b.c.d" */
  server_ip: string;
  server_port: number;
  quiet_start_h: number;
  quiet_end_h: number;
  alert_frost_dC: number;
  low_batt_mv: number;
  apn: string;
  bands: number[];
  /** operatore forzato (MCC+MNC), 0 = automatico */
  plmn: number;
}

/** Configurazione di fabbrica, con l'IP del server scritto in laboratorio. */
export function configDefaults(serverIp = "0.0.0.0"): StationConfig {
  return {
    interval_min: 10,
    send_every: 6,
    wet_sample_s: 60,
    wet_threshold: 1500,
    wet_hyst: 40,
    wet_polarity: 0,
    server_ip: serverIp,
    server_port: 5683,
    quiet_start_h: CFG_NO_HOUR,
    quiet_end_h: CFG_NO_HOUR,
    alert_frost_dC: 10,
    low_batt_mv: 3300,
    apn: "iot.1nce.net",
    bands: [8, 20],
    plmn: 0,
  };
}

function ipBytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const b = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  return b.every((x) => x >= 0 && x <= 255) ? b : null;
}

const hourOk = (h: number) => Number.isInteger(h) && ((h >= 0 && h < 24) || h === CFG_NO_HOUR);
const between = (x: number, lo: number, hi: number) => Number.isInteger(x) && x >= lo && x <= hi;

/** Gli stessi controlli di config_valid() del firmware. Ritorna i problemi in italiano. */
export function validateConfig(c: StationConfig): string[] {
  const e: string[] = [];
  if (!between(c.interval_min, 1, 60)) e.push("intervallo di misura: 1-60 minuti");
  if (!between(c.send_every, 1, 30)) e.push("misure per invio: 1-30");
  if (!between(c.wet_sample_s, 15, 600)) e.push("campionamento bagnatura: 15-600 s");
  if (!between(c.wet_threshold, 0, 4095)) e.push("soglia bagnatura: 0-4095");
  if (!between(c.wet_hyst, 0, 1000)) e.push("isteresi bagnatura: 0-1000");
  if (c.wet_polarity !== 0 && c.wet_polarity !== 1) e.push("polarità bagnatura: 0 o 1");
  if (!ipBytes(c.server_ip)) e.push("IP del server non valido");
  if (!between(c.server_port, 1, 65535)) e.push("porta del server: 1-65535");
  if (!hourOk(c.quiet_start_h) || !hourOk(c.quiet_end_h)) e.push("ore di silenzio: 0-23");
  else if ((c.quiet_start_h === CFG_NO_HOUR) !== (c.quiet_end_h === CFG_NO_HOUR))
    e.push("ore di silenzio: servono inizio e fine, o nessuna delle due");
  if (!between(c.alert_frost_dC, -32768, 32767)) e.push("soglia di gelo fuori scala");
  if (!between(c.low_batt_mv, 2000, 5000)) e.push("batteria bassa: 2000-5000 mV");
  if (c.apn.length < 1 || c.apn.length > CFG_APN_MAX || !/^[\x21-\x7e]+$/.test(c.apn) || /["\\,]/.test(c.apn))
    e.push("APN: 1-29 caratteri stampabili, senza spazi, virgolette, barre o virgole");
  if (
    c.bands.length < 1 ||
    c.bands.length > CFG_BANDS_MAX ||
    !c.bands.every((b) => (SUPPORTED_BANDS as readonly number[]).includes(b))
  )
    e.push(`bande: da 1 a 4 tra ${SUPPORTED_BANDS.join(", ")}`);
  if (c.plmn !== 0 && !between(c.plmn, 10000, 999999))
    e.push("operatore: 5 o 6 cifre, oppure 0 per automatico");
  return e;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function encodeParam(tag: number, c: StationConfig): number[] {
  const tlv = (v: number[]) => [tag, v.length, ...v];
  switch (tag) {
    case CfgTag.INTERVAL:
      return tlv([c.interval_min]);
    case CfgTag.SEND_EVERY:
      return tlv([c.send_every]);
    case CfgTag.WET_SAMPLE:
      return tlv(u16(c.wet_sample_s));
    case CfgTag.WET_THRESH:
      return tlv(u16(c.wet_threshold));
    case CfgTag.WET_HYST:
      return tlv(u16(c.wet_hyst));
    case CfgTag.WET_POL:
      return tlv([c.wet_polarity]);
    case CfgTag.SERVER:
      return tlv([...(ipBytes(c.server_ip) ?? [0, 0, 0, 0]), ...u16(c.server_port)]);
    case CfgTag.QUIET:
      return tlv([c.quiet_start_h, c.quiet_end_h]);
    case CfgTag.FROST:
      return tlv(u16(c.alert_frost_dC & 0xffff));
    case CfgTag.LOW_BATT:
      return tlv(u16(c.low_batt_mv));
    case CfgTag.APN:
      return tlv([...Buffer.from(c.apn, "ascii")]);
    case CfgTag.BANDS:
      return tlv(c.bands);
    case CfgTag.PLMN:
      return tlv(u32(c.plmn));
    default:
      throw new ProtocolError(`tag ${tag} sconosciuto`);
  }
}

/**
 * TLV dei soli parametri che cambiano da 'from' a 'to', in ordine di tag.
 * Errore se 'to' non è valida o se le differenze superano i 64 byte del pacchetto.
 */
export function encodeConfigDiff(from: StationConfig, to: StationConfig): Uint8Array {
  const problems = validateConfig(to);
  if (problems.length) throw new ProtocolError(`configurazione non valida: ${problems.join("; ")}`);
  const out: number[] = [];
  for (const tag of Object.values(CfgTag)) {
    const a = encodeParam(tag, from);
    const b = encodeParam(tag, to);
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) out.push(...b);
  }
  if (out.length > PKT_MAX_CFG_TLV) {
    throw new ProtocolError(
      `le modifiche occupano ${out.length} byte, massimo ${PKT_MAX_CFG_TLV}: dividerle in due versioni`,
    );
  }
  return Uint8Array.from(out);
}

export type ApplyResult = { ok: true; config: StationConfig } | { ok: false; error: "format" | "range" };

/** Applica i TLV come fa la centralina: tutto o niente. */
export function applyConfigTlv(c: StationConfig, tlv: Uint8Array): ApplyResult {
  const n: StationConfig = { ...c, bands: [...c.bands] };
  const v = new DataView(tlv.buffer, tlv.byteOffset, tlv.byteLength);
  let i = 0;
  while (i < tlv.length) {
    if (tlv.length - i < 2) return { ok: false, error: "format" };
    const tag = tlv[i] as number;
    const l = tlv[i + 1] as number;
    const p = i + 2;
    if (p + l > tlv.length) return { ok: false, error: "format" };
    const need = (len: number) => l === len;
    switch (tag) {
      case CfgTag.INTERVAL:
        if (!need(1)) return { ok: false, error: "format" };
        n.interval_min = v.getUint8(p);
        break;
      case CfgTag.SEND_EVERY:
        if (!need(1)) return { ok: false, error: "format" };
        n.send_every = v.getUint8(p);
        break;
      case CfgTag.WET_SAMPLE:
        if (!need(2)) return { ok: false, error: "format" };
        n.wet_sample_s = v.getUint16(p, true);
        break;
      case CfgTag.WET_THRESH:
        if (!need(2)) return { ok: false, error: "format" };
        n.wet_threshold = v.getUint16(p, true);
        break;
      case CfgTag.WET_HYST:
        if (!need(2)) return { ok: false, error: "format" };
        n.wet_hyst = v.getUint16(p, true);
        break;
      case CfgTag.WET_POL:
        if (!need(1)) return { ok: false, error: "format" };
        n.wet_polarity = v.getUint8(p);
        break;
      case CfgTag.SERVER:
        if (!need(6)) return { ok: false, error: "format" };
        n.server_ip = [0, 1, 2, 3].map((k) => v.getUint8(p + k)).join(".");
        n.server_port = v.getUint16(p + 4, true);
        break;
      case CfgTag.QUIET:
        if (!need(2)) return { ok: false, error: "format" };
        n.quiet_start_h = v.getUint8(p);
        n.quiet_end_h = v.getUint8(p + 1);
        break;
      case CfgTag.FROST:
        if (!need(2)) return { ok: false, error: "format" };
        n.alert_frost_dC = v.getInt16(p, true);
        break;
      case CfgTag.LOW_BATT:
        if (!need(2)) return { ok: false, error: "format" };
        n.low_batt_mv = v.getUint16(p, true);
        break;
      case CfgTag.APN:
        if (l < 1 || l > CFG_APN_MAX) return { ok: false, error: "format" };
        n.apn = Buffer.from(tlv.subarray(p, p + l)).toString("latin1");
        break;
      case CfgTag.BANDS:
        if (l < 1 || l > CFG_BANDS_MAX) return { ok: false, error: "format" };
        n.bands = [...tlv.subarray(p, p + l)];
        break;
      case CfgTag.PLMN:
        if (!need(4)) return { ok: false, error: "format" };
        n.plmn = v.getUint32(p, true);
        break;
      default:
        return { ok: false, error: "format" };
    }
    i = p + l;
  }
  // il firmware accetta zeri in coda alle bande (posti liberi): qui non arrivano mai dal TLV
  if (validateConfig(n).length) return { ok: false, error: "range" };
  return { ok: true, config: n };
}
