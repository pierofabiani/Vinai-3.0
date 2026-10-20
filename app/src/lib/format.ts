// Numeri e date in italiano. Valori mancanti: un trattino, mai uno zero inventato.
const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "mai";
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const a = Math.abs(s);
  if (a < 60) return "adesso";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function num(v: number | null | undefined, digits = 1, unit = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = new Intl.NumberFormat("it", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
  return unit ? `${s} ${unit}` : s;
}

export function volts(mv: number | null | undefined): string {
  return mv === null || mv === undefined ? "—" : num(mv / 1000, 2, "V");
}

export function fw(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v >> 8}.${String(v & 0xff).padStart(2, "0")}`;
}
