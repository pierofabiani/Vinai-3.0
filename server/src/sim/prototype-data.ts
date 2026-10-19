// Dati per i prototipi di design (P3): un'istantanea dell'azienda demo, scritta in app/public/prototipi/dati.json.
// Misure vere del simulatore per gli ultimi 7 giorni; tutto il resto è D'ESEMPIO e lo dichiara:
// pioggia (dedotta dalla bagnatura), previsioni (dallo stesso meteo del simulatore), rischio malattie
// (regole semplificate, NON i modelli della traccia D), trattamenti e protezione residua (inventati).
// Uso, con il database di sviluppo pieno: pnpm --filter @vinai/server proto:dati
import { mkdir, writeFile } from "node:fs/promises";
import { connect } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { hash, Weather } from "./weather.js";

const ORG = "Tenuta Poggio Alto (demo)";
const OUT = new URL("../../../app/public/prototipi/dati.json", import.meta.url);
const HOUR = 3_600_000;

interface Hour {
  t: string;
  temp: number | null;
  hum: number | null;
  /** minuti di foglia bagnata nell'ora */
  wet: number;
  /** pioggia, mm nell'ora (d'esempio) */
  rain: number;
}

type Level = "basso" | "medio" | "alto";
interface Risk {
  index: number;
  level: Level;
  why: string;
}

const level = (i: number): Level => (i >= 75 ? "alto" : i >= 40 ? "medio" : "basso");
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const dayIt = (d: Date) =>
  new Intl.DateTimeFormat("it", { weekday: "long", day: "numeric", timeZone: "Europe/Rome" }).format(d);
const hourIt = (d: Date) =>
  new Intl.DateTimeFormat("it", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(d);

/** Periodi di bagnatura continua (ore con almeno 30 minuti bagnati). */
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

/** Sensibilità varietale alla peronospora (valori d'esempio, da concordare con l'agronomo). */
const SUSCEPTIBILITY: Record<string, number> = {
  Merlot: 1.3,
  "Malvasia nera": 1.25,
  Canaiolo: 1.1,
  Sangiovese: 1,
  Colorino: 0.85,
  "Cabernet Sauvignon": 0.75,
};

/** Rischio D'ESEMPIO: regole semplici e leggibili, solo per dare forma alle schermate. */
function risks(
  past: Hour[],
  forecast: Hour[],
  variety: string | null,
): Record<"peronospora" | "oidio" | "botrite", Risk> {
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
      const t = new Date(window[s.start]?.t ?? Date.now());
      const future = t.getTime() > Date.now();
      best = {
        score,
        why: `${s.len} ore di foglia bagnata a ${round(s.temp, 0)} °C ${future ? "previste" : "misurate"} da ${dayIt(t)} alle ${hourIt(t)}.`,
      };
    }
  }
  const pero = Math.min(100, Math.round(best.score * susc * 100));
  if (pero > 0 && susc !== 1)
    best.why += ` ${variety} è ${susc > 1 ? "più" : "meno"} sensibile della media alla peronospora.`;
  // oidio: ore tra 21 e 30 °C negli ultimi 3 giorni (alla Gubler-Thomas, semplificato)
  const warm = past.slice(-72).filter((h) => h.temp !== null && h.temp >= 21 && h.temp <= 30).length;
  const oidio = Math.min(100, Math.round((warm / 18) * 100));
  // botrite: ore bagnate tra 15 e 25 °C nelle ultime 72 ore
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

const PRODUCTS = [
  { name: "Rame idrossido", target: "peronospora", days: 9 },
  { name: "Zolfo bagnabile", target: "oidio", days: 8 },
  { name: "Rame ossicloruro", target: "peronospora", days: 10 },
];

/** Trattamento D'ESEMPIO e protezione residua: i giorni passano e la pioggia la lava via. */
function treatment(seed: number, past: Hour[], forecast: Hour[], now: number) {
  const p = PRODUCTS[Math.floor(hash(seed, 31) * PRODUCTS.length)] ?? PRODUCTS[0];
  if (!p) throw new Error("prodotti mancanti");
  const daysAgo = 2 + Math.floor(hash(seed, 37) * 9);
  const at = now - daysAgo * 24 * HOUR;
  // si consuma un giorno di copertura ogni 24 ore, più 2 giorni ogni 10 mm di pioggia (regola d'esempio);
  // si percorre il tempo ora per ora, passato e previsione, per trovare quando la copertura finisce davvero
  let left = p.days;
  let exhausted: string | null = null;
  let leftNow = p.days;
  for (const h of [...past, ...forecast]) {
    const t = new Date(h.t).getTime();
    if (t < at) continue;
    left -= 1 / 24 + (h.rain / 10) * 2;
    if (t <= now) leftNow = left;
    if (left <= 0) {
      exhausted = h.t;
      break;
    }
  }
  const rainSince = past.filter((h) => new Date(h.t).getTime() >= at).reduce((a, h) => a + h.rain, 0);
  const rainNext = forecast.reduce((a, h) => a + h.rain, 0);
  const remainingDays = Math.max(0, leftNow);
  return {
    date: new Date(at).toISOString(),
    product: p.name,
    target: p.target,
    coverDays: p.days,
    rainSinceMm: round(rainSince),
    remainingDays: round(remainingDays),
    remainingPct: Math.round((remainingDays / p.days) * 100),
    rainNextMm: round(rainNext),
    /** quando la copertura finisce (nel passato se è già finita), null se dura oltre i 3 giorni di previsione */
    exhaustedOn: exhausted,
  };
}

function advice(r: ReturnType<typeof risks>, tr: ReturnType<typeof treatment>, now: number) {
  const lead = (Object.entries(r) as [keyof typeof r, Risk][]).sort((a, b) => b[1].index - a[1].index)[0];
  if (!lead) throw new Error("rischi mancanti");
  const [disease, risk] = lead;
  const exp = tr.exhaustedOn ? new Date(tr.exhaustedOn).getTime() : Number.POSITIVE_INFINITY;
  const soon = exp - now < 36 * HOUR;
  const covered = tr.target === disease && !soon;
  if (risk.level === "alto" && !covered) {
    // copertura già finita: il prima possibile; altrimenti prima che finisca, al più tardi entro 24 ore
    const by = exp <= now ? now + 12 * HOUR : Math.min(exp, now + 24 * HOUR);
    return { action: "tratta" as const, disease, by: new Date(by).toISOString() };
  }
  if (risk.level !== "basso" && (soon || tr.target !== disease))
    return { action: "controlla" as const, disease, by: null };
  return { action: "ok" as const, disease, by: null };
}

/** Un appezzamento irregolare attorno al centro: la stessa geometria in mappa e nelle liste. */
function parcel(seed: number, lat: number, lon: number): [number, number][] {
  const pts: [number, number][] = [];
  const n = 5 + Math.floor(hash(seed, 41) * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, 43 + i) * 0.5;
    const r = 0.0018 + hash(seed, 59 + i) * 0.0012;
    pts.push([round(lon + Math.cos(a) * r * 1.35, 6), round(lat + Math.sin(a) * r, 6)]);
  }
  return pts;
}

/** Ore sintetiche dal modello del simulatore: per i vigneti d'esempio e per le previsioni. */
function synth(w: Weather, from: number, hours: number, seed: number): Hour[] {
  const out: Hour[] = [];
  for (let i = 0; i < hours; i++) {
    const t = from + i * HOUR;
    let wet = 0;
    for (let m = 0; m < 60; m += 10) if (w.at(new Date(t + m * 60_000)).wet) wet += 10;
    const x = w.at(new Date(t + 30 * 60_000));
    const rain = x.hum_pct >= 99 && wet >= 50 ? round(0.4 + hash(seed, Math.floor(t / HOUR), 71) * 3.2) : 0;
    out.push({ t: new Date(t).toISOString(), temp: round(x.temp_c), hum: round(x.hum_pct, 0), wet, rain });
  }
  return out;
}

const EXTRA = [
  "Vigna Vecchia",
  "Il Poggiolo",
  "Fontanelle",
  "Le Macie",
  "San Biagio",
  "Campo al Pero",
  "La Torre",
  "Pian dei Ciliegi",
  "Le Ripe",
  "Casanuova",
  "Il Colombaio",
];
const VARIETIES = ["Sangiovese", "Canaiolo", "Merlot", "Cabernet Sauvignon", "Colorino", "Malvasia nera"];

const sql = connect(loadEnv().DATABASE_URL);
try {
  const now = Math.floor(Date.now() / HOUR) * HOUR;
  const since = new Date(now - 7 * 24 * HOUR);
  const [org] = await sql<{ id: string; name: string; region: string; province: string }[]>`
    SELECT id, name, region, province FROM organization WHERE name = ${ORG}`;
  if (!org) throw new Error(`manca "${ORG}": lancia prima seed:demo`);
  const vys = await sql<{ id: string; name: string; variety: string | null; lat: number; lon: number }[]>`
    SELECT v.id, v.name, v.variety, avg(ST_Y(s.location::geometry)) AS lat, avg(ST_X(s.location::geometry)) AS lon
    FROM vineyard v JOIN station s ON s.vineyard_id = v.id
    WHERE v.organization_id = ${org.id} GROUP BY v.id ORDER BY v.name`;

  const vineyards = [];
  for (const [i, v] of vys.entries()) {
    const rows = await sql<{ t: Date; temp: number | null; hum: number | null; wet: number | null }[]>`
      SELECT m.bucket AS t, avg(m.temp_avg) AS temp, avg(m.hum_avg) AS hum, avg(m.wet_min) AS wet
      FROM measurement_1h m JOIN station s ON s.id = m.station_id
      WHERE s.vineyard_id = ${v.id} AND m.bucket >= ${since} GROUP BY m.bucket ORDER BY m.bucket`;
    const seed = Math.floor(hash(i + 1, 7) * 1e6);
    const past: Hour[] = rows.map((r) => {
      const wet = Math.round(Number(r.wet ?? 0));
      const hum = r.hum === null ? null : round(Number(r.hum), 0);
      const rain =
        hum !== null && hum >= 97 && wet >= 55 ? round(0.4 + hash(seed, r.t.getTime() / HOUR, 71) * 3.2) : 0;
      return { t: r.t.toISOString(), temp: r.temp === null ? null : round(Number(r.temp)), hum, wet, rain };
    });
    vineyards.push({
      id: v.id,
      name: v.name,
      variety: v.variety,
      lat: v.lat,
      lon: v.lon,
      synthetic: false,
      seed,
      past,
    });
  }
  const base = vineyards[0];
  if (!base) throw new Error("nessun vigneto con centraline");
  for (const [k, name] of EXTRA.entries()) {
    const seed = Math.floor(hash(100 + k, 7) * 1e6);
    const w = new Weather(seed, k % 3);
    vineyards.push({
      id: `esempio-${k + 1}`,
      name,
      variety: VARIETIES[k % VARIETIES.length] ?? null,
      lat: base.lat + (hash(seed, 3) - 0.5) * 0.06,
      lon: base.lon + (hash(seed, 5) - 0.5) * 0.08,
      synthetic: true,
      seed,
      past: synth(w, now - 7 * 24 * HOUR, 7 * 24, seed),
    });
  }

  const out = vineyards.map((v, i) => {
    const forecast = synth(new Weather(v.seed, i % 3), now + HOUR, 72, v.seed);
    const r = risks(v.past, forecast, v.variety);
    const tr = treatment(v.seed, v.past, forecast, now);
    return {
      id: v.id,
      name: v.name,
      variety: v.variety,
      synthetic: v.synthetic,
      center: [round(v.lat, 5), round(v.lon, 5)],
      parcel: parcel(v.seed, v.lat, v.lon),
      past: v.past,
      forecast,
      risk: r,
      treatment: tr,
      advice: advice(r, tr, now),
    };
  });

  // Flotta: le centraline vere della demo, più due stati costruiti apposta per vederli (dichiarati)
  const fleet = await sql`
    SELECT s.id, s.label, s.imei::text, s.status AS lifecycle, v.name AS vineyard, o.name AS organization,
           ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lon, s.last_seen_at, s.fw_ver,
           h.batt_mv, h.rsrp_dbm, m.temp_c, m.hum_pct, m.wet_min, m.flags,
           (SELECT json_agg(x.wet ORDER BY x.b) FROM (SELECT bucket AS b, wet_min AS wet FROM measurement_1h
              WHERE station_id = s.id AND bucket >= ${new Date(now - 24 * HOUR)}) x) AS wet24
    FROM station s LEFT JOIN vineyard v ON v.id = s.vineyard_id LEFT JOIN organization o ON o.id = s.organization_id
    LEFT JOIN LATERAL (SELECT batt_mv, rsrp_dbm FROM health WHERE station_id = s.id ORDER BY time DESC LIMIT 1) h ON true
    LEFT JOIN LATERAL (SELECT temp_c, hum_pct, wet_min, flags FROM measurement WHERE station_id = s.id ORDER BY time DESC LIMIT 1) m ON true
    WHERE s.status <> 'dismessa' AND o.name LIKE '%(demo)' ORDER BY o.name, v.name, s.label`;
  const fleetOut = fleet.map((f, i) => {
    let status = "attiva";
    let note: string | null = null;
    if (i === 3) {
      status = "muta";
      note = "stato costruito per il prototipo";
    } else if (i === 8) {
      status = "sensore_guasto";
      note = "stato costruito per il prototipo";
    } else if (i === 12) {
      status = "batteria_bassa";
      note = "stato costruito per il prototipo";
    }
    return {
      ...f,
      status,
      note,
      last_seen_at: status === "muta" ? new Date(now - 5.2 * HOUR).toISOString() : f.last_seen_at,
      batt_mv: status === "batteria_bassa" ? 3240 : f.batt_mv,
      hum_pct: status === "sensore_guasto" ? null : f.hum_pct,
    };
  });

  await mkdir(new URL(".", OUT), { recursive: true });
  await writeFile(
    OUT,
    JSON.stringify({
      generatedAt: new Date(now).toISOString(),
      note: "Misure del simulatore. Pioggia, previsioni, rischio malattie e trattamenti sono D'ESEMPIO: regole semplificate, non i modelli della traccia D.",
      organization: { name: org.name.replace(" (demo)", ""), region: org.region, province: org.province },
      vineyards: out,
      fleet: fleetOut,
    }),
  );
  const counts = out.reduce<Record<string, number>>(
    (a, v) => ({ ...a, [v.advice.action]: (a[v.advice.action] ?? 0) + 1 }),
    {},
  );
  console.log(
    `[proto] ${out.length} vigneti (${vys.length} veri), ${fleetOut.length} centraline, consigli:`,
    counts,
  );
} finally {
  await sql.end();
}
