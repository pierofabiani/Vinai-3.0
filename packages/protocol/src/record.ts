// Una misura della centralina. Specchio di firmware/src/core/record.h.

export const REC_WIRE_SIZE = 14;
export const REC_TEMP_FAULT = -32768;
export const REC_U16_FAULT = 0xffff;

export const RecordFlag = {
  TEMP_FAULT: 0x01,
  HUM_FAULT: 0x02,
  PRESS_FAULT: 0x04,
  WET_FAULT: 0x08,
  TIME_UNSYNC: 0x10,
  LOW_BATT: 0x20,
} as const;

export interface StationRecord {
  seq: number;
  /** secondi dal 2020-01-01 UTC, fine dell'intervallo di misura */
  time: number;
  /** decimi di °C; REC_TEMP_FAULT se il sensore non risponde */
  temp_dC: number;
  /** decimi di %RH */
  hum_dPct: number;
  /** decimi di hPa */
  press_dhPa: number;
  wet_raw: number;
  /** minuti con foglia bagnata nell'intervallo */
  wet_min: number;
  flags: number;
}

export function writeRecord(v: DataView, off: number, r: StationRecord): void {
  v.setUint32(off, r.time, true);
  v.setInt16(off + 4, r.temp_dC, true);
  v.setUint16(off + 6, r.hum_dPct, true);
  v.setUint16(off + 8, r.press_dhPa, true);
  v.setUint16(off + 10, r.wet_raw, true);
  v.setUint8(off + 12, r.wet_min);
  v.setUint8(off + 13, r.flags);
}

export function readRecord(v: DataView, off: number, seq: number): StationRecord {
  return {
    seq,
    time: v.getUint32(off, true),
    temp_dC: v.getInt16(off + 4, true),
    hum_dPct: v.getUint16(off + 6, true),
    press_dhPa: v.getUint16(off + 8, true),
    wet_raw: v.getUint16(off + 10, true),
    wet_min: v.getUint8(off + 12),
    flags: v.getUint8(off + 13),
  };
}
