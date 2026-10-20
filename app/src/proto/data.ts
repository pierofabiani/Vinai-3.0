// Dati dei prototipi P3: istantanea dell'azienda demo (server: pnpm --filter @vinai/server proto:dati).
// Misure del simulatore; pioggia, previsioni, rischio e trattamenti sono D'ESEMPIO.
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

export type Disease = "peronospora" | "oidio" | "botrite";
export type Level = "basso" | "medio" | "alto";
export type Action = "tratta" | "controlla" | "ok";

export interface Hour {
  t: string;
  temp: number | null;
  hum: number | null;
  wet: number;
  rain: number;
}

export interface Vineyard {
  id: string;
  name: string;
  variety: string | null;
  synthetic: boolean;
  center: [number, number];
  parcel: [number, number][];
  past: Hour[];
  forecast: Hour[];
  risk: Record<Disease, { index: number; level: Level; why: string }>;
  treatment: {
    date: string;
    product: string;
    target: Disease;
    coverDays: number;
    rainSinceMm: number;
    remainingDays: number;
    remainingPct: number;
    rainNextMm: number;
    exhaustedOn: string | null;
  };
  advice: { action: Action; disease: Disease; by: string | null };
}

export interface FleetStation {
  id: number;
  label: string;
  imei: string;
  lifecycle: string;
  vineyard: string | null;
  organization: string | null;
  lat: number | null;
  lon: number | null;
  last_seen_at: string | null;
  fw_ver: number | null;
  batt_mv: number | null;
  rsrp_dbm: number | null;
  temp_c: number | null;
  hum_pct: number | null;
  wet_min: number | null;
  flags: number | null;
  wet24: number[] | null;
  status: "attiva" | "muta" | "sensore_guasto" | "batteria_bassa";
  note: string | null;
}

export interface ProtoData {
  generatedAt: string;
  note: string;
  organization: { name: string; region: string; province: string };
  vineyards: Vineyard[];
  fleet: FleetStation[];
}

export function useProtoData() {
  return useQuery({
    queryKey: ["proto-dati"],
    queryFn: async () => (await (await fetch("/prototipi/dati.json")).json()) as ProtoData,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Quanti vigneti mostrare: ?n=1|3|14 (prova degli estremi chiesta nell'intervista). */
export function useScale(): 1 | 3 | 14 {
  const { n } = useSearch({ strict: false }) as { n?: string | number };
  const v = Number(n);
  return v === 1 || v === 14 ? v : 3;
}

const ORDER: Record<Action, number> = { tratta: 0, controlla: 1, ok: 2 };

export function pick(data: ProtoData, n: number): Vineyard[] {
  const real = data.vineyards.filter((v) => !v.synthetic);
  const chosen = n === 1 ? real.slice(0, 1) : n === 3 ? real : data.vineyards;
  return [...chosen].sort(
    (a, b) =>
      ORDER[a.advice.action] - ORDER[b.advice.action] ||
      b.risk[b.advice.disease].index - a.risk[a.advice.disease].index,
  );
}

export const DISEASE: Record<Disease, string> = {
  peronospora: "Peronospora",
  oidio: "Oidio",
  botrite: "Botrite",
};
export const ACTION: Record<Action, string> = {
  tratta: "Da trattare",
  controlla: "Da controllare",
  ok: "Tutto bene",
};
export const LEVEL: Record<Level, string> = { basso: "basso", medio: "medio", alto: "alto" };

const tz = "Europe/Rome";
export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("it", { weekday: "long", day: "numeric", timeZone: tz }).format(new Date(iso));
export const fmtDayShort = (iso: string) =>
  new Intl.DateTimeFormat("it", { weekday: "short", day: "numeric", timeZone: tz }).format(new Date(iso));
export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("it", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
export const fmtWhen = (iso: string) => `${fmtDay(iso)} alle ${fmtTime(iso)}`;
export const fmtNum = (v: number | null | undefined, d = 0) => {
  if (v === null || v === undefined) return "—";
  const r = Math.round(v * 10 ** d) / 10 ** d;
  // niente "-0": un valore che arrotonda a zero è zero
  return new Intl.NumberFormat("it", { maximumFractionDigits: d, minimumFractionDigits: d }).format(
    r === 0 ? 0 : r,
  );
};

export function daysAgo(iso: string, now: number): string {
  const d = Math.round((now - new Date(iso).getTime()) / 86_400_000);
  return d === 0 ? "oggi" : d === 1 ? "ieri" : `${d} giorni fa`;
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

/** Prima finestra di almeno 4 ore senza pioggia nelle prossime 36: quando si può trattare. */
export function treatWindow(v: Vineyard): { from: string; to: string } | null {
  const hours = v.forecast.slice(0, 36);
  let start = -1;
  for (let i = 0; i <= hours.length; i++) {
    const dry = i < hours.length && (hours[i]?.rain ?? 0) === 0;
    if (dry && start < 0) start = i;
    if (!dry && start >= 0) {
      // la fine è la fine dell'ultima ora asciutta
      if (i - start >= 4)
        return {
          from: hours[start]?.t ?? "",
          to: new Date(new Date(hours[i - 1]?.t ?? 0).getTime() + 3_600_000).toISOString(),
        };
      start = -1;
    }
  }
  return null;
}

/** Ore bagnate e pioggia per giorno, prossimi 3 giorni. */
export function nextDays(v: Vineyard) {
  const days = new Map<string, { t: string; wetH: number; rain: number; tmin: number; tmax: number }>();
  for (const h of v.forecast) {
    const key = new Intl.DateTimeFormat("it", { day: "numeric", timeZone: tz }).format(new Date(h.t));
    const d = days.get(key) ?? {
      t: h.t,
      wetH: 0,
      rain: 0,
      tmin: Number.POSITIVE_INFINITY,
      tmax: Number.NEGATIVE_INFINITY,
    };
    d.wetH += h.wet / 60;
    d.rain += h.rain;
    if (h.temp !== null) {
      d.tmin = Math.min(d.tmin, h.temp);
      d.tmax = Math.max(d.tmax, h.temp);
    }
    days.set(key, d);
  }
  return [...days.values()].slice(0, 3);
}

/** Proiezione semplice dei poligoni in un riquadro SVG, stessa scala per tutti (confronto onesto). */
export function project(points: [number, number][][], w: number, h: number, pad = 8) {
  const all = points.flat();
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const minX = Math.min(...lons);
  const maxX = Math.max(...lons);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const k = Math.min((w - 2 * pad) / (maxX - minX || 1), (h - 2 * pad) / (maxY - minY || 1));
  const ox = (w - (maxX - minX) * k) / 2;
  const oy = (h - (maxY - minY) * k) / 2;
  return (p: [number, number]) => [ox + (p[0] - minX) * k, h - (oy + (p[1] - minY) * k)] as const;
}

export function shapePath(parcel: [number, number][], size: number): string {
  const f = project([parcel], size, size, 4);
  return `${parcel.map((p, i) => `${i ? "L" : "M"}${f(p)[0].toFixed(1)},${f(p)[1].toFixed(1)}`).join("")}Z`;
}

/** Gruppi per l'azione e frase-risposta. Le due direzioni la impaginano a modo loro, i fatti sono gli stessi. */
export function summarize(vs: Vineyard[], now: number) {
  const treat = vs.filter((v) => v.advice.action === "tratta");
  const check = vs.filter((v) => v.advice.action === "controlla");
  const ok = vs.filter((v) => v.advice.action === "ok");
  const firstBy = treat
    .map((v) => v.advice.by)
    .filter((b): b is string => Boolean(b))
    .sort()[0];
  const names = (list: Vineyard[]) =>
    list.length <= 2 ? list.map((v) => v.name).join(" e ") : `${list.length} vigneti`;
  let headline: string;
  if (treat.length) headline = `Tratta ${names(treat)} ${firstBy ? byWhen(firstBy, now) : "appena puoi"}`;
  else if (check.length) headline = `Nessun trattamento urgente. Controlla ${names(check)}`;
  else headline = "Oggi non serve trattare";
  const lead = treat[0] ?? check[0] ?? null;
  return { treat, check, ok, headline, lead, window: treat[0] ? treatWindow(treat[0]) : null };
}

/** Testo breve della protezione: prodotto, quando, quanto copre ancora. */
export function coverText(v: Vineyard, now: number): string {
  const t = v.treatment;
  const left =
    t.remainingDays <= 0
      ? "copertura finita"
      : t.exhaustedOn
        ? `copre fino a ${fmtDay(t.exhaustedOn)}`
        : `copre ancora ${fmtNum(t.remainingDays)} giorni`;
  return `${t.product} ${daysAgo(t.date, now)} · ${left}`;
}

/** "mar 20, 11:00–24:00" oppure "lun 19, 22:00 – mar 20, 01:00". */
export function fmtWindow(w: { from: string; to: string }): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("it", { day: "numeric", timeZone: tz }).format(new Date(iso));
  const end = new Date(w.to);
  const prevDay = new Date(end.getTime() - 60_000).toISOString();
  if (fmtTime(w.to) === "00:00" && day(prevDay) === day(w.from))
    return `${fmtDayShort(w.from)}, ${fmtTime(w.from)}–24:00`;
  if (day(w.to) === day(w.from)) return `${fmtDayShort(w.from)}, ${fmtTime(w.from)}–${fmtTime(w.to)}`;
  return `${fmtDayShort(w.from)}, ${fmtTime(w.from)} – ${fmtDayShort(w.to)}, ${fmtTime(w.to)}`;
}
