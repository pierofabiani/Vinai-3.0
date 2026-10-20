// Area clienti: forme delle risposte dell'api (server/src/agro) e formati in italiano.
export type Disease = "peronospora" | "oidio" | "botrite";
export type Level = "basso" | "medio" | "alto";
export type Action = "tratta" | "controlla" | "ok";
export type OrgRole = "titolare" | "agronomo" | "collaboratore" | "ospite";

export interface Hour {
  t: string;
  temp: number | null;
  hum: number | null;
  wet: number;
  rain: number;
}

export interface Protection {
  date: string;
  product: string;
  target: string;
  coverDays: number;
  rainSinceMm: number;
  rainNextMm: number;
  remainingDays: number;
  remainingPct: number;
  exhaustedOn: string | null;
}

export interface VineyardView {
  id: string;
  organizationId: string;
  name: string;
  variety: string | null;
  plantingYear: number | null;
  location: { lat: number; lon: number } | null;
  hasData: boolean;
  lastData: string | null;
  now: { temp: number | null; hum: number | null; wet: number } | null;
  risk: Record<Disease, { index: number; level: Level; why: string }>;
  protection: Protection | null;
  advice: { action: Action; disease: Disease; by: string | null };
  window: { from: string; to: string } | null;
  days: { t: string; wetH: number; rain: number; tmin: number; tmax: number }[];
  past: Hour[];
  forecast: Hour[];
}

export interface Sources {
  measures: string;
  rain: string;
  forecast: string;
}

export interface OrgToday {
  organization: { id: string; name: string; region: string | null; province: string | null };
  role: OrgRole;
  generatedAt: string;
  model: { name: string; note: string };
  sources: Sources;
  vineyards: VineyardView[];
  stations: {
    id: number;
    label: string | null;
    status: string;
    vineyardId: string | null;
    lastSeenAt: string | null;
  }[];
}

export interface VineyardDetail {
  role: OrgRole;
  organizationName: string | null;
  generatedAt: string;
  model: { name: string; note: string };
  sources: Sources;
  vineyard: VineyardView;
  treatments: {
    id: string;
    applied_at: string;
    product: string;
    target: string;
    cover_days: number;
    dose: string | null;
    note: string | null;
    by: string | null;
  }[];
  observations: {
    id: string;
    observed_at: string;
    disease: string;
    severity: number;
    phenology: string | null;
    note: string | null;
    by: string | null;
    validated_at: string | null;
    validated_by: string | null;
  }[];
  stations: {
    id: number;
    label: string | null;
    status: string;
    lastSeenAt: string | null;
    last: { tempC: number | null; humPct: number | null; wetMin: number } | null;
    battMv: number | null;
  }[];
}

export const DISEASE: Record<string, string> = {
  peronospora: "Peronospora",
  oidio: "Oidio",
  botrite: "Botrite",
  black_rot: "Black rot",
  altro: "Altro",
  nessuna: "Nessun sintomo",
};
export const ACTION: Record<Action, string> = {
  tratta: "Da trattare",
  controlla: "Da controllare",
  ok: "Tutto bene",
};
export const SEVERITY = ["nessun sintomo", "tracce", "sintomi diffusi", "sintomi gravi"];

const tz = "Europe/Rome";
export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("it", { weekday: "long", day: "numeric", timeZone: tz }).format(new Date(iso));
export const fmtDayShort = (iso: string) =>
  new Intl.DateTimeFormat("it", { weekday: "short", day: "numeric", timeZone: tz }).format(new Date(iso));
export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("it", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
export const fmtWhen = (iso: string) => `${fmtDay(iso)} alle ${fmtTime(iso)}`;
export const fmtNum = (v: number | null | undefined, d = 0) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return new Intl.NumberFormat("it", { maximumFractionDigits: d, minimumFractionDigits: d }).format(
    r === 0 ? 0 : r,
  );
};
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function daysAgo(iso: string, now: number): string {
  const d = Math.round((now - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "oggi" : d === 1 ? "ieri" : `${d} giorni fa`;
}

/** "entro domani mattina", "entro stasera", "entro mercoledì 21". */
export function byWhen(iso: string, now: number): string {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("it", { day: "numeric", timeZone: tz }).format(x);
  const h = Number(
    new Intl.DateTimeFormat("it", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(d),
  );
  if (day(d) === day(new Date(now))) return h < 18 ? "entro oggi" : "entro stasera";
  if (day(d) === day(new Date(now + 86_400_000))) return h < 12 ? "entro domani mattina" : "entro domani";
  return `entro ${fmtDay(iso)}`;
}

/** "mar 20, 11:00–24:00" oppure "lun 19, 22:00 – mar 20, 01:00". */
export function fmtWindow(w: { from: string; to: string }): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("it", { day: "numeric", timeZone: tz }).format(new Date(iso));
  const prev = new Date(new Date(w.to).getTime() - 60_000).toISOString();
  if (fmtTime(w.to) === "00:00" && day(prev) === day(w.from))
    return `${fmtDayShort(w.from)}, ${fmtTime(w.from)}–24:00`;
  if (day(w.to) === day(w.from)) return `${fmtDayShort(w.from)}, ${fmtTime(w.from)}–${fmtTime(w.to)}`;
  return `${fmtDayShort(w.from)}, ${fmtTime(w.from)} – ${fmtDayShort(w.to)}, ${fmtTime(w.to)}`;
}

/** Testo breve della protezione: prodotto, quando, quanto copre ancora. */
export function coverText(p: Protection | null, now: number): string {
  if (!p) return "nessun trattamento registrato";
  const left =
    p.remainingDays <= 0
      ? "copertura finita"
      : p.exhaustedOn
        ? `copre fino a ${fmtDay(p.exhaustedOn)}`
        : `copre ancora ${fmtNum(p.remainingDays)} giorni`;
  return `${p.product} ${daysAgo(p.date, now)} · ${left}`;
}
