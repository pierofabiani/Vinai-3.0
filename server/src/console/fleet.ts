// Stato della flotta per la console: una riga per centralina, con lo stato calcolato.
import { configDefaults, type StationConfig } from "@vinai/protocol";
import type { Sql } from "../lib/db.js";

export type FleetStatus =
  | "attiva"
  | "in_ritardo"
  | "muta"
  | "batteria_bassa"
  | "sensore_guasto"
  | "mai_collegata"
  | "dismessa";

/** Una centralina che tace da 3 ore genera un allarme per l'amministratore (piano, traccia B). */
export const SILENT_AFTER_MS = 3 * 3_600_000;

export interface StatusInput {
  status: string;
  lastSeenAt: Date | null;
  battMv: number | null;
  lastFlags: number | null;
  config: Pick<StationConfig, "interval_min" | "send_every" | "low_batt_mv">;
}

/** Stato principale e tutti i problemi riscontrati, dal più grave. */
export function fleetStatus(s: StatusInput, now: Date): { status: FleetStatus; issues: FleetStatus[] } {
  if (s.status === "dismessa") return { status: "dismessa", issues: [] };
  if (!s.lastSeenAt) return { status: "mai_collegata", issues: ["mai_collegata"] };
  const issues: FleetStatus[] = [];
  const silence = now.getTime() - s.lastSeenAt.getTime();
  const expected = s.config.interval_min * s.config.send_every * 60_000;
  if (silence > SILENT_AFTER_MS) issues.push("muta");
  else if (silence > 2 * expected + 10 * 60_000) issues.push("in_ritardo");
  if (s.battMv !== null && s.battMv < s.config.low_batt_mv) issues.push("batteria_bassa");
  if (s.lastFlags !== null && (s.lastFlags & 0x0f) !== 0) issues.push("sensore_guasto");
  return { status: issues[0] ?? "attiva", issues };
}

export interface FleetRow {
  id: number;
  imei: string;
  label: string | null;
  lifecycle: string;
  status: FleetStatus;
  issues: FleetStatus[];
  organization: { id: string; name: string } | null;
  vineyard: { id: string; name: string } | null;
  location: { lat: number; lon: number } | null;
  lastSeenAt: string | null;
  fwVer: number | null;
  cfgVer: number;
  battMv: number | null;
  rsrpDbm: number | null;
  last: { time: string; tempC: number | null; humPct: number | null; wetMin: number; flags: number } | null;
}

export async function listFleet(
  sql: Sql,
  now: Date,
  filter: { organizationId?: string } = {},
): Promise<FleetRow[]> {
  const rows = await sql<
    {
      id: string;
      imei: string;
      label: string | null;
      status: string;
      org_id: string | null;
      org_name: string | null;
      vy_id: string | null;
      vy_name: string | null;
      lat: number | null;
      lon: number | null;
      last_seen_at: Date | null;
      fw_ver: number | null;
      cfg_ver: number;
      config: StationConfig;
      batt_mv: number | null;
      rsrp_dbm: number | null;
      m_time: Date | null;
      temp_c: number | null;
      hum_pct: number | null;
      wet_min: number | null;
      flags: number | null;
    }[]
  >`
    SELECT s.id, s.imei::text, s.label, s.status,
           o.id AS org_id, o.name AS org_name, v.id AS vy_id, v.name AS vy_name,
           ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lon,
           s.last_seen_at, s.fw_ver, s.cfg_ver,
           coalesce(cv.params, s.factory_config) AS config,
           h.batt_mv, h.rsrp_dbm, m.time AS m_time, m.temp_c, m.hum_pct, m.wet_min, m.flags
    FROM station s
    LEFT JOIN organization o ON o.id = s.organization_id
    LEFT JOIN vineyard v ON v.id = s.vineyard_id
    LEFT JOIN config_version cv ON cv.station_id = s.id AND cv.version = s.cfg_ver
    LEFT JOIN LATERAL (SELECT batt_mv, rsrp_dbm FROM health WHERE station_id = s.id ORDER BY time DESC LIMIT 1) h ON true
    LEFT JOIN LATERAL (SELECT time, temp_c, hum_pct, wet_min, flags FROM measurement
                       WHERE station_id = s.id AND (flags & 16) = 0 ORDER BY time DESC LIMIT 1) m ON true
    WHERE (${filter.organizationId ?? null}::uuid IS NULL OR s.organization_id = ${filter.organizationId ?? null}::uuid)
    ORDER BY s.status = 'dismessa', o.name NULLS FIRST, s.label NULLS LAST, s.imei`;
  return rows.map((r) => {
    const config = { ...configDefaults(), ...r.config };
    const st = fleetStatus(
      { status: r.status, lastSeenAt: r.last_seen_at, battMv: r.batt_mv, lastFlags: r.flags, config },
      now,
    );
    return {
      id: Number(r.id),
      imei: r.imei,
      label: r.label,
      lifecycle: r.status,
      ...st,
      organization: r.org_id ? { id: r.org_id, name: r.org_name ?? "" } : null,
      vineyard: r.vy_id ? { id: r.vy_id, name: r.vy_name ?? "" } : null,
      location: r.lat !== null && r.lon !== null ? { lat: r.lat, lon: r.lon } : null,
      lastSeenAt: r.last_seen_at?.toISOString() ?? null,
      fwVer: r.fw_ver,
      cfgVer: r.cfg_ver,
      battMv: r.batt_mv,
      rsrpDbm: r.rsrp_dbm,
      last: r.m_time
        ? {
            time: r.m_time.toISOString(),
            tempC: r.temp_c,
            humPct: r.hum_pct,
            wetMin: r.wet_min ?? 0,
            flags: r.flags ?? 0,
          }
        : null,
    };
  });
}

/** Tutto ciò che serve alla scheda della centralina, ultimi 7 giorni. */
export async function stationDetail(sql: Sql, id: number, now: Date) {
  const [row] = (await listFleet(sql, now)).filter((r) => r.id === id);
  if (!row) return null;
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [health, hourly, packets, configs, lab, appliedRow] = await Promise.all([
    sql`SELECT time, batt_mv, rsrp_dbm, snr_db, reset_count, modem_fails, lost_records, cfg_rejected, n_records
        FROM health WHERE station_id = ${id} AND time >= ${since} ORDER BY time`,
    sql`SELECT bucket AS time, temp_avg, temp_min, temp_max, hum_avg, press_avg, wet_min, n
        FROM measurement_1h WHERE station_id = ${id} AND bucket >= ${since} ORDER BY bucket`,
    sql`SELECT received_at, src_addr::text, length(payload) AS bytes, result, detail
        FROM raw_packet WHERE station_id = ${id} ORDER BY received_at DESC LIMIT 20`,
    sql`SELECT version, status, params, created_at, created_by, sent_at, applied_at, rejected_at
        FROM config_version WHERE station_id = ${id} ORDER BY version DESC`,
    sql`SELECT l.time, l.kind, l.detail, u.name AS user_name
        FROM lab_event l LEFT JOIN "user" u ON u.id = l.user_id WHERE l.station_id = ${id} ORDER BY l.time DESC`,
    sql<
      {
        factory_config: StationConfig;
        install_note: string | null;
        installed_at: Date | null;
        install_photo: string | null;
      }[]
    >`
        SELECT factory_config, install_note, installed_at, install_photo FROM station WHERE id = ${id}`,
  ]);
  const applied = configs.find((c) => c.version === row.cfgVer)?.params ?? appliedRow[0]?.factory_config;
  return {
    station: row,
    install: {
      at: appliedRow[0]?.installed_at ?? null,
      note: appliedRow[0]?.install_note ?? null,
      hasPhoto: Boolean(appliedRow[0]?.install_photo),
    },
    config: applied,
    health,
    hourly,
    packets,
    configs,
    lab,
  };
}
