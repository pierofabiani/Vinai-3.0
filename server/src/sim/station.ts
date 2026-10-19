// Una centralina simulata: segue le stesse regole del firmware (firmware/src/app/station.c)
// per misure, invii, conferme, configurazioni e ritorno alla rete precedente,
// ma con il tempo accelerato e la rete con guasti a comando.
import {
  applyConfigTlv,
  coapBuildPost,
  coapParse,
  decodeDownlink,
  encodeUplink,
  PKT_MAX_RECORDS,
  REC_TEMP_FAULT,
  REC_U16_FAULT,
  RecordFlag,
  type StationConfig,
  type StationRecord,
  toStationTime,
  uplinkTag,
} from "@vinai/protocol";
import { hash, type Weather } from "./weather.js";

const MAX_PACKETS_SESSION = 12;
const BACKOFF_FIRST_MIN = 10;
const BACKOFF_MAX_MIN = 360;
const NET_FALLBACK_FAILS = 3;
const FW_VER = 0x0300;

/** Scambio di un datagramma con il server; null se non arriva risposta. */
export type Exchange = (datagram: Uint8Array) => Promise<Uint8Array | null>;

export interface NetConditions {
  /** probabilità che l'invio non raggiunga il server */
  uplinkLoss: number;
  /** probabilità che la conferma del server si perda (il server ha salvato, la centralina no) */
  ackLoss: number;
}

export interface SimStationInit {
  id: number;
  imei: bigint;
  key: Uint8Array;
  config: StationConfig;
  cfgVer: number;
  lastSeq: number;
  weather: Weather;
  seed: number;
}

const netEqual = (a: StationConfig, b: StationConfig) =>
  a.apn === b.apn && a.plmn === b.plmn && a.bands.join(",") === b.bands.join(",");

export class SimStation {
  readonly id: number;
  readonly imei: bigint;
  private readonly key: Uint8Array;
  private readonly weather: Weather;
  private readonly seed: number;

  config: StationConfig;
  cfgVer: number;
  private goodConfig: StationConfig;
  private goodVer: number;
  cfgRejected = 0;

  /** record ancora da confermare (la flash della centralina) */
  private log = new Map<number, StationRecord>();
  /** tutti i record generati in questa simulazione, per la verifica finale */
  readonly generated: StationRecord[] = [];
  private nextSeq: number;
  acked: number;

  private nextMeasure = 0;
  private nextSend = Number.POSITIVE_INFINITY;
  private sinceSend = 0;
  private backoffMin = 0;
  private modemFails = 0;
  private resetCount = 0;
  private msgId: number;

  /** guasti a comando */
  offlineUntil = 0;
  rejectedApn: string | null = null;
  humFaultFrom = 0;
  humFaultUntil = 0;

  /** statistiche */
  sessions = 0;
  failedSessions = 0;
  packets = 0;
  /** versioni già rifiutate che il server ha comunque rimandato: deve restare 0 */
  rejectedOffers = 0;
  readonly appliedVersions: number[] = [];

  constructor(init: SimStationInit) {
    this.id = init.id;
    this.imei = init.imei;
    this.key = init.key;
    this.weather = init.weather;
    this.seed = init.seed;
    this.config = init.config;
    this.cfgVer = init.cfgVer;
    this.goodConfig = init.config;
    this.goodVer = init.cfgVer;
    this.nextSeq = init.lastSeq + 1;
    this.acked = init.lastSeq;
    this.msgId = Math.floor(hash(init.seed, 99) * 65535);
  }

  get lastSeq(): number {
    return this.nextSeq - 1;
  }

  /** Allinea la prima misura alla griglia dell'intervallo, come lo scheduler del firmware. */
  start(t: number): void {
    const step = this.config.interval_min * 60_000;
    this.nextMeasure = Math.ceil((t + 1) / step) * step;
  }

  dueAt(t: number): { measure: boolean; send: boolean } {
    return { measure: t >= this.nextMeasure, send: t >= this.nextSend };
  }

  /** Una misura a fine intervallo: media dei minuti, minuti bagnati contati uno per uno. */
  measure(t: number): void {
    const minutes = this.config.interval_min;
    let wetMin = 0;
    let wetRawSum = 0;
    for (let m = minutes - 1; m >= 0; m--) {
      const w = this.weather.at(new Date(t - m * 60_000));
      const wet = w.wet;
      if (wet) wetMin++;
      wetRawSum += wet
        ? 1150 + hash(this.seed, t / 60_000 - m, 11) * 80
        : 1750 + hash(this.seed, t / 60_000 - m, 13) * 80;
    }
    const w = this.weather.at(new Date(t));
    const humFault = t >= this.humFaultFrom && t < this.humFaultUntil;
    const r: StationRecord = {
      seq: this.nextSeq++,
      time: toStationTime(new Date(t)),
      temp_dC: Math.round(w.temp_c * 10),
      hum_dPct: humFault ? REC_U16_FAULT : Math.round(w.hum_pct * 10),
      press_dhPa: Math.round(w.press_hpa * 10),
      wet_raw: Math.round(wetRawSum / minutes),
      wet_min: wetMin,
      flags: humFault ? RecordFlag.HUM_FAULT : 0,
    };
    if (r.temp_dC === REC_TEMP_FAULT) r.temp_dC += 1;
    this.log.set(r.seq, r);
    this.generated.push(r);
    this.nextMeasure = t + this.config.interval_min * 60_000;
    this.sinceSend++;
    if (this.sinceSend >= this.config.send_every && this.nextSend === Number.POSITIVE_INFINITY)
      this.nextSend = t;
  }

  /** Una sessione radio: tutto l'arretrato a pacchetti da 30, come send_session() del firmware. */
  async session(t: number, net: NetConditions, exchange: Exchange, rand: () => number): Promise<void> {
    this.sessions++;
    this.nextSend = Number.POSITIVE_INFINITY;
    const sessionCfg = this.config;
    const sessionVer = this.cfgVer;
    let ok = true;
    let reached = false;

    const offline = t < this.offlineUntil || this.config.apn === this.rejectedApn;
    if (offline) ok = false;

    for (let p = 0; ok && p < MAX_PACKETS_SESSION; p++) {
      const from = this.acked + 1;
      const records: StationRecord[] = [];
      for (let s = from; s <= this.lastSeq && records.length < PKT_MAX_RECORDS; s++) {
        const r = this.log.get(s);
        if (r) records.push(r);
        else break;
      }
      const sentTo = records.length > 0 ? from + records.length - 1 : from - 1;
      const payload = encodeUplink(
        {
          imei: this.imei,
          fw_ver: FW_VER,
          cfg_ver: this.cfgVer,
          health: {
            batt_mv: 4300 - Math.floor(this.sessions / 50),
            rsrp_dbm: -85 - Math.floor(hash(this.seed, this.sessions, 21) * 30),
            snr_db: Math.floor(hash(this.seed, this.sessions, 22) * 15) - 3,
            csq: 18,
            last_reset: this.resetCount ? 1 : 0,
            reset_count: this.resetCount,
            modem_fails: this.modemFails,
            lost_records: 0,
            cfg_rejected: this.cfgRejected,
          },
          first_seq: from,
          records,
        },
        this.key,
      );
      if (rand() < net.uplinkLoss) {
        ok = false;
        break;
      }
      this.msgId = (this.msgId + 1) & 0xffff;
      const token = Uint8Array.from([0x51, 0x4d, (this.msgId >> 8) & 0xff, this.msgId & 0xff]);
      this.packets++;
      const resp = await exchange(coapBuildPost(this.msgId, token, payload));
      if (!resp || rand() < net.ackLoss) {
        ok = false;
        break;
      }
      const rx = coapParse(resp, this.msgId, token);
      if (rx.kind !== "response") {
        ok = false;
        break;
      }
      const dn = decodeDownlink(rx.payload, this.key, uplinkTag(payload));
      if (!dn.ok) {
        ok = false;
        break;
      }
      reached = true;
      const d = dn.value;
      if (d.acked_seq > this.acked && d.acked_seq <= sentTo) {
        for (let s = this.acked + 1; s <= d.acked_seq; s++) this.log.delete(s);
        this.acked = d.acked_seq;
      }
      if (d.cfg.length > 0 && d.cfg_ver !== this.cfgVer) {
        if (d.cfg_ver === this.cfgRejected) {
          this.rejectedOffers++;
        } else {
          const res = applyConfigTlv(this.config, d.cfg);
          if (res.ok) {
            const timing = res.config.interval_min !== this.config.interval_min;
            this.config = res.config;
            this.cfgVer = d.cfg_ver;
            this.appliedVersions.push(d.cfg_ver);
            if (timing) this.start(t);
          } else {
            this.cfgRejected = d.cfg_ver;
          }
        }
      }
      if (this.acked < sentTo) {
        ok = false;
        break;
      }
      if (this.acked >= this.lastSeq) break;
    }

    if (!ok && reached) {
      this.nextSend = t + 5 * 60_000;
      return;
    }
    if (ok) {
      this.sinceSend = 0;
      this.backoffMin = 0;
      this.modemFails = 0;
      if (!netEqual(sessionCfg, this.goodConfig) || sessionVer !== this.goodVer) {
        this.goodConfig = sessionCfg;
        this.goodVer = sessionVer;
      }
      if (this.acked < this.lastSeq) this.nextSend = t + 60_000;
      return;
    }
    this.failedSessions++;
    this.modemFails = Math.min(255, this.modemFails + 1);
    this.backoffMin =
      this.backoffMin === 0 ? BACKOFF_FIRST_MIN : Math.min(BACKOFF_MAX_MIN, this.backoffMin * 2);
    this.nextSend = t + this.backoffMin * 60_000;
    if (this.modemFails >= NET_FALLBACK_FAILS && !netEqual(this.config, this.goodConfig)) {
      this.cfgRejected = this.cfgVer;
      const timing = this.goodConfig.interval_min !== this.config.interval_min;
      this.config = this.goodConfig;
      this.cfgVer = this.goodVer;
      this.modemFails = 0;
      this.backoffMin = 0;
      if (timing) this.start(t);
      this.nextSend = t + 60_000;
    }
  }

  reset(): void {
    this.resetCount++; // le misure restano in flash: un reset non perde nulla
  }

  /** Forza un invio (fine simulazione: svuotare l'arretrato). */
  forceSend(t: number): void {
    this.nextSend = t;
  }
}
