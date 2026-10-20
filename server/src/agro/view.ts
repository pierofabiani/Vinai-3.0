// Vista agronomica dei vigneti per l'app dei clienti: misure (media delle centraline del vigneto),
// ultimo trattamento, previsione, rischio, protezione residua, consiglio. Ogni fonte è dichiarata.
import { listFleet } from "../console/fleet.js";
import type { Sql } from "../lib/db.js";
import type { ForecastProvider } from "./forecast.js";
import {
  advice,
  estimateRain,
  type Hour,
  MODEL,
  nextDays,
  protection,
  risks,
  type TreatmentRow,
  treatWindow,
} from "./model.js";

const HOUR = 3_600_000;

interface VineyardRow {
  id: string;
  organization_id: string;
  name: string;
  variety: string | null;
  planting_year: number | null;
  lat: number | null;
  lon: number | null;
}

async function vineyards(sql: Sql, where: { orgId?: string; id?: string }): Promise<VineyardRow[]> {
  return sql<VineyardRow[]>`
    SELECT v.id, v.organization_id, v.name, v.variety, v.planting_year,
           avg(ST_Y(s.location::geometry)) AS lat, avg(ST_X(s.location::geometry)) AS lon
    FROM vineyard v LEFT JOIN station s ON s.vineyard_id = v.id AND s.status <> 'dismessa'
    WHERE (${where.orgId ?? null}::uuid IS NULL OR v.organization_id = ${where.orgId ?? null}::uuid)
      AND (${where.id ?? null}::uuid IS NULL OR v.id = ${where.id ?? null}::uuid)
    GROUP BY v.id ORDER BY v.name`;
}

/** Ore degli ultimi 7 giorni, media delle centraline del vigneto (misure senza orologio valido escluse). */
async function pastHours(sql: Sql, vineyardId: string, now: number): Promise<Hour[]> {
  const rows = await sql<{ t: Date; temp: number | null; hum: number | null; wet: number | null }[]>`
    SELECT m.bucket AS t, avg(m.temp_avg) AS temp, avg(m.hum_avg) AS hum, avg(m.wet_min) AS wet
    FROM measurement_1h m JOIN station s ON s.id = m.station_id
    WHERE s.vineyard_id = ${vineyardId} AND s.status <> 'dismessa'
      AND m.bucket >= ${new Date(now - 7 * 24 * HOUR)} AND m.bucket <= ${new Date(now)}
    GROUP BY m.bucket ORDER BY m.bucket`;
  return estimateRain(
    rows.map((r) => ({
      t: r.t.toISOString(),
      temp: r.temp === null ? null : Math.round(Number(r.temp) * 10) / 10,
      hum: r.hum === null ? null : Math.round(Number(r.hum)),
      wet: Math.round(Number(r.wet ?? 0)),
    })),
    vineyardId,
  );
}

async function lastTreatment(sql: Sql, vineyardId: string): Promise<TreatmentRow | null> {
  const [t] = await sql<TreatmentRow[]>`
    SELECT applied_at, product, target, cover_days FROM treatment
    WHERE vineyard_id = ${vineyardId} ORDER BY applied_at DESC LIMIT 1`;
  return t ?? null;
}

async function buildOne(sql: Sql, fc: ForecastProvider, v: VineyardRow, now: number, detail: boolean) {
  const past = await pastHours(sql, v.id, now);
  const place = { id: v.id, lat: v.lat ?? 43.5, lon: v.lon ?? 11.2 };
  const forecast = await fc.forecast(place, now, 72);
  const tr = await lastTreatment(sql, v.id);
  const r = risks(past, forecast, v.variety, now);
  const p = protection(tr, past, forecast, now);
  const a = advice(r, p, now);
  const last = past.at(-1);
  return {
    id: v.id,
    organizationId: v.organization_id,
    name: v.name,
    variety: v.variety,
    plantingYear: v.planting_year,
    location: v.lat !== null && v.lon !== null ? { lat: v.lat, lon: v.lon } : null,
    hasData: past.length > 0,
    lastData: last?.t ?? null,
    now: last ? { temp: last.temp, hum: last.hum, wet: last.wet } : null,
    risk: r,
    protection: p,
    advice: a,
    window: treatWindow(forecast),
    days: nextDays(forecast),
    ...(detail ? { past, forecast } : {}),
  };
}

export type VineyardView = Awaited<ReturnType<typeof buildOne>>;

const ORDER = { tratta: 0, controlla: 1, ok: 2 } as const;

/** "Oggi" di un'azienda: tutti i vigneti, prima dove intervenire. */
export async function orgToday(sql: Sql, fc: ForecastProvider, orgId: string, now = Date.now()) {
  const vs = await vineyards(sql, { orgId });
  const views = await Promise.all(vs.map((v) => buildOne(sql, fc, v, now, true)));
  // in "Oggi" bastano le ultime 48 ore e la previsione, non tutta la settimana
  const slim = views.map((v) => ({ ...v, past: (v.past ?? []).slice(-48) }));
  slim.sort(
    (a, b) =>
      ORDER[a.advice.action] - ORDER[b.advice.action] ||
      // a parità di consiglio prima i vigneti con centraline: il loro rischio è misurato, non solo previsto
      Number(b.hasData) - Number(a.hasData) ||
      b.risk[b.advice.disease].index - a.risk[a.advice.disease].index,
  );
  const stations = (await listFleet(sql, new Date(now), { organizationId: orgId })).map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    vineyardId: s.vineyard?.id ?? null,
    lastSeenAt: s.lastSeenAt,
  }));
  return {
    generatedAt: new Date(now).toISOString(),
    model: MODEL,
    sources: { measures: "centraline", rain: "stimata dalla bagnatura", forecast: fc.source },
    vineyards: slim,
    stations,
  };
}

/** Scheda di un vigneto: 7 giorni misurati e 3 previsti, trattamenti, osservazioni, centraline. */
export async function vineyardDetail(sql: Sql, fc: ForecastProvider, vineyardId: string, now = Date.now()) {
  const [v] = await vineyards(sql, { id: vineyardId });
  if (!v) return null;
  const view = await buildOne(sql, fc, v, now, true);
  const [treatments, observations, stations] = await Promise.all([
    sql`SELECT t.id, t.applied_at, t.product, t.target, t.cover_days, t.dose, t.note, u.name AS by
        FROM treatment t LEFT JOIN "user" u ON u.id = t.created_by
        WHERE t.vineyard_id = ${vineyardId} ORDER BY t.applied_at DESC LIMIT 20`,
    sql`SELECT o.id, o.observed_at, o.disease, o.severity, o.phenology, o.note, u.name AS by,
               o.validated_at, vu.name AS validated_by
        FROM observation o LEFT JOIN "user" u ON u.id = o.created_by LEFT JOIN "user" vu ON vu.id = o.validated_by
        WHERE o.vineyard_id = ${vineyardId} ORDER BY o.observed_at DESC LIMIT 20`,
    listFleet(sql, new Date(now), { organizationId: v.organization_id }),
  ]);
  const [org] = await sql<{ name: string }[]>`SELECT name FROM organization WHERE id = ${v.organization_id}`;
  return {
    generatedAt: new Date(now).toISOString(),
    model: MODEL,
    sources: { measures: "centraline", rain: "stimata dalla bagnatura", forecast: fc.source },
    organizationName: org?.name ?? null,
    vineyard: view,
    treatments,
    observations,
    stations: stations
      .filter((s) => s.vineyard?.id === vineyardId)
      .map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        lastSeenAt: s.lastSeenAt,
        last: s.last,
        battMv: s.battMv,
      })),
  };
}
