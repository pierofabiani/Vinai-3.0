// Modello agronomico D'ESEMPIO: regole semplici e leggibili per dare forma alle schermate dei clienti
// finché non arrivano i modelli validati con l'agronomo (piano, traccia D). Ogni risultato porta il
// suo perché. Funzioni pure: niente database, testabili da sole.

export type Disease = "peronospora" | "oidio" | "botrite";
export type Level = "basso" | "medio" | "alto";
export type Action = "tratta" | "controlla" | "ok";

export interface Hour {
  t: string;
  temp: number | null;
  hum: number | null;
  /** minuti di foglia bagnata nell'ora */
  wet: number;
  /** pioggia nell'ora, mm */
  rain: number;
}

export interface Risk {
  index: number;
  level: Level;
  why: string;
}

export interface TreatmentRow {
  applied_at: Date;
  product: string;
  target: string;
  cover_days: number;
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
  /** quando la copertura finisce (anche nel passato); null se dura oltre la previsione */
  exhaustedOn: string | null;
}

export const MODEL = {
  name: "esempio-0",
  note: "Regole d'esempio, non i modelli validati con l'agronomo: servono a provare le schermate.",
};

const HOUR = 3_600_000;
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const level = (i: number): Level => (i >= 75 ? "alto" : i >= 40 ? "medio" : "basso");
const tz = "Europe/Rome";
const dayIt = (d: Date) =>
  new Intl.DateTimeFormat("it", { weekday: "long", day: "numeric", timeZone: tz }).format(d);
const hourIt = (d: Date) =>
  new Intl.DateTimeFormat("it", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);

/** Hash intero deterministico, per dati sintetici ripetibili. */
export function hashNum(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts.join("|")) {
    h ^= p.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Pioggia passata STIMATA dalla bagnatura (le centraline non hanno pluviometro): un'ora quasi tutta
 * bagnata con umidità al 97% o più conta come pioggia. In produzione arriva dal radar (nota 0005).
 */
export function estimateRain(hours: Omit<Hour, "rain">[], seed: string): Hour[] {
  return hours.map((h) => ({
    ...h,
    rain: h.hum !== null && h.hum >= 97 && h.wet >= 55 ? round(0.4 + hashNum(seed, h.t) * 3.2) : 0,
  }));
}

/** Sensibilità varietale alla peronospora (valori d'esempio, da concordare con l'agronomo). */
export const SUSCEPTIBILITY: Record<string, number> = {
  Merlot: 1.3,
  "Malvasia nera": 1.25,
  Canaiolo: 1.1,
  Glera: 1.1,
  Sangiovese: 1,
  Colorino: 0.85,
  "Cabernet Franc": 0.8,
  "Cabernet Sauvignon": 0.75,
};

function wetSpells(hours: Hour[]) {
  const spells: { start: number; len: number; temp: number }[] = [];
  let cur: { start: number; len: number; tsum: number } | null = null;
  hours.forEach((h, i) => {
    if (h.wet >= 30 && h.temp !== null) {
      if (!cur) cur = { start: i, len: 0, tsum: 0 };
      cur.len++;
      cur.tsum += h.temp;
    } else if (cur) {
      spells.push({ start: cur.start, len: cur.len, temp: cur.tsum / cur.len });
      cur = null;
    }
  });
  const last = cur as { start: number; len: number; tsum: number } | null;
  if (last) spells.push({ start: last.start, len: last.len, temp: last.tsum / last.len });
  return spells;
}

export function risks(
  past: Hour[],
  forecast: Hour[],
  variety: string | null,
  now: number,
): Record<Disease, Risk> {
  const susc = SUSCEPTIBILITY[variety ?? ""] ?? 1;
  const window = [...past.slice(-48), ...forecast];
  // peronospora: ore di bagnatura × temperatura media, se tra 10 e 28 °C (d'esempio: da 30 a 110 gradi-ora)
  let best = {
    score: 0,
    why: "Nessun periodo di foglia bagnata abbastanza lungo nelle ultime 48 ore e nei prossimi 3 giorni.",
  };
  for (const s of wetSpells(window)) {
    if (s.temp < 10 || s.temp > 28) continue;
    const score = Math.max(0, (s.len * s.temp - 30) / 80);
    if (score > best.score) {
      const t = new Date(window[s.start]?.t ?? now);
      best = {
        score,
        why: `${s.len} ore di foglia bagnata a ${round(s.temp, 0)} °C ${t.getTime() > now ? "previste" : "misurate"} da ${dayIt(t)} alle ${hourIt(t)}.`,
      };
    }
  }
  const pero = Math.min(100, Math.round(best.score * susc * 100));
  if (pero > 0 && susc !== 1)
    best.why += ` ${variety} è ${susc > 1 ? "più" : "meno"} sensibile della media alla peronospora.`;
  const warm = past.slice(-72).filter((h) => h.temp !== null && h.temp >= 21 && h.temp <= 30).length;
  const oidio = Math.min(100, Math.round((warm / 18) * 100));
  const botHours = past
    .slice(-72)
    .filter((h) => h.wet >= 30 && h.temp !== null && h.temp >= 15 && h.temp <= 25).length;
  const botrite = Math.min(100, Math.round((botHours / 15) * 100));
  return {
    peronospora: { index: pero, level: level(pero), why: best.why },
    oidio: {
      index: oidio,
      level: level(oidio),
      why: `${warm} ore tra 21 e 30 °C negli ultimi 3 giorni: l'oidio cresce con il caldo, anche senza pioggia.`,
    },
    botrite: {
      index: botrite,
      level: level(botrite),
      why: `${botHours} ore di foglia bagnata tra 15 e 25 °C negli ultimi 3 giorni.`,
    },
  };
}

/**
 * Protezione residua dell'ultimo trattamento: un giorno di copertura ogni 24 ore, più 2 giorni ogni
 * 10 mm di pioggia (regola d'esempio). Si percorre il tempo ora per ora, passato e previsione.
 */
export function protection(
  tr: TreatmentRow | null,
  past: Hour[],
  forecast: Hour[],
  now: number,
): Protection | null {
  if (!tr) return null;
  const at = tr.applied_at.getTime();
  let left = tr.cover_days;
  let leftNow = tr.cover_days;
  let exhausted: string | null = null;
  // le ore prima della finestra di 7 giorni (trattamento vecchio) contano solo come tempo che passa
  const firstHour = past[0] ? new Date(past[0].t).getTime() : now;
  if (at < firstHour) left -= (firstHour - at) / (24 * HOUR);
  if (left <= 0) exhausted = new Date(at + tr.cover_days * 24 * HOUR).toISOString();
  for (const h of [...past, ...forecast]) {
    if (exhausted) break;
    const t = new Date(h.t).getTime();
    if (t < at) continue;
    left -= 1 / 24 + (h.rain / 10) * 2;
    if (t <= now) leftNow = left;
    if (left <= 0) exhausted = h.t;
  }
  if (exhausted && new Date(exhausted).getTime() <= now) leftNow = 0;
  const rainSince = past.filter((h) => new Date(h.t).getTime() >= at).reduce((a, h) => a + h.rain, 0);
  const remaining = Math.max(0, leftNow);
  return {
    date: tr.applied_at.toISOString(),
    product: tr.product,
    target: tr.target,
    coverDays: tr.cover_days,
    rainSinceMm: round(rainSince),
    rainNextMm: round(forecast.reduce((a, h) => a + h.rain, 0)),
    remainingDays: round(remaining),
    remainingPct: Math.round((remaining / tr.cover_days) * 100),
    exhaustedOn: exhausted,
  };
}

export function advice(r: Record<Disease, Risk>, p: Protection | null, now: number) {
  const lead = (Object.entries(r) as [Disease, Risk][]).sort((a, b) => b[1].index - a[1].index)[0];
  if (!lead) throw new Error("rischi mancanti");
  const [disease, risk] = lead;
  const exp = p?.exhaustedOn ? new Date(p.exhaustedOn).getTime() : p ? Number.POSITIVE_INFINITY : now;
  const soon = exp - now < 36 * HOUR;
  const covered = p !== null && p.target === disease && !soon;
  if (risk.level === "alto" && !covered) {
    const by = exp <= now ? now + 12 * HOUR : Math.min(exp, now + 24 * HOUR);
    return { action: "tratta" as Action, disease, by: new Date(by).toISOString() };
  }
  if (risk.level !== "basso" && (soon || p?.target !== disease))
    return { action: "controlla" as Action, disease, by: null };
  return { action: "ok" as Action, disease, by: null };
}

/** Prima finestra di almeno 4 ore senza pioggia nelle prossime 36: quando si può trattare. */
export function treatWindow(forecast: Hour[]): { from: string; to: string } | null {
  const hours = forecast.slice(0, 36);
  let start = -1;
  for (let i = 0; i <= hours.length; i++) {
    const dry = i < hours.length && (hours[i]?.rain ?? 0) === 0;
    if (dry && start < 0) start = i;
    if (!dry && start >= 0) {
      if (i - start >= 4)
        return {
          from: hours[start]?.t ?? "",
          to: new Date(new Date(hours[i - 1]?.t ?? 0).getTime() + HOUR).toISOString(),
        };
      start = -1;
    }
  }
  return null;
}

/** Ore bagnate, pioggia e temperature per giorno, prossimi 3 giorni. */
export function nextDays(forecast: Hour[]) {
  const days = new Map<string, { t: string; wetH: number; rain: number; tmin: number; tmax: number }>();
  for (const h of forecast) {
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
  return [...days.values()].slice(0, 3).map((d) => ({
    ...d,
    wetH: round(d.wetH),
    rain: round(d.rain),
    tmin: round(d.tmin),
    tmax: round(d.tmax),
  }));
}

/** Prodotti comuni con la loro copertura indicativa: proposti nel modulo, modificabili. */
export const PRODUCTS = [
  { name: "Rame idrossido", target: "peronospora", coverDays: 8 },
  { name: "Rame ossicloruro", target: "peronospora", coverDays: 8 },
  { name: "Poltiglia bordolese", target: "peronospora", coverDays: 9 },
  { name: "Fosetil-Al", target: "peronospora", coverDays: 12 },
  { name: "Zolfo bagnabile", target: "oidio", coverDays: 7 },
  { name: "Zolfo in polvere", target: "oidio", coverDays: 6 },
  { name: "Bicarbonato di potassio", target: "oidio", coverDays: 5 },
  { name: "Bacillus subtilis", target: "botrite", coverDays: 7 },
] as const;
