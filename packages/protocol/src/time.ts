// Le centraline contano i secondi dal 2020-01-01 00:00:00 UTC (u32).
export const EPOCH_2020_MS = Date.UTC(2020, 0, 1);

export function fromStationTime(s: number): Date {
  return new Date(EPOCH_2020_MS + s * 1000);
}

export function toStationTime(d: Date): number {
  return Math.floor((d.getTime() - EPOCH_2020_MS) / 1000);
}
