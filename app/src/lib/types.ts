// Forme delle risposte dell'api (server/src/api).
export type GlobalRole = "user" | "tecnico" | "admin";
export type OrgRole = "titolare" | "agronomo" | "collaboratore" | "ospite";
export type FleetStatus =
  | "attiva"
  | "in_ritardo"
  | "muta"
  | "batteria_bassa"
  | "sensore_guasto"
  | "mai_collegata"
  | "dismessa";

export interface Me {
  user: { id: string; email: string; name: string; role: GlobalRole; passkeys: number } | null;
  memberships: { organizationId: string; name: string; role: OrgRole }[];
}

export interface FleetRow {
  id: number;
  imei: string;
  label: string | null;
  lifecycle: "lab" | "pronta" | "installata" | "attiva" | "dismessa";
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

export interface StationConfig {
  interval_min: number;
  send_every: number;
  wet_sample_s: number;
  wet_threshold: number;
  wet_hyst: number;
  wet_polarity: number;
  server_ip: string;
  server_port: number;
  quiet_start_h: number;
  quiet_end_h: number;
  alert_frost_dC: number;
  low_batt_mv: number;
  apn: string;
  bands: number[];
  plmn: number;
}

export interface StationDetail {
  station: FleetRow;
  install: { at: string | null; note: string | null; hasPhoto: boolean };
  config: StationConfig;
  health: {
    time: string;
    batt_mv: number;
    rsrp_dbm: number;
    snr_db: number;
    reset_count: number;
    modem_fails: number;
    lost_records: number;
    cfg_rejected: number;
    n_records: number;
  }[];
  hourly: {
    time: string;
    temp_avg: number | null;
    temp_min: number | null;
    temp_max: number | null;
    hum_avg: number | null;
    press_avg: number | null;
    wet_min: number | null;
    n: number;
  }[];
  packets: {
    received_at: string;
    src_addr: string | null;
    bytes: number;
    result: string;
    detail: string | null;
  }[];
  configs: {
    version: number;
    status: string;
    params: StationConfig;
    created_at: string;
    created_by: string | null;
    sent_at: string | null;
    applied_at: string | null;
    rejected_at: string | null;
  }[];
  lab: { time: string; kind: string; detail: string | null; user_name: string | null }[];
}

export interface Provisioning {
  imei: string;
  key_hex: string;
  server_ip: string;
  server_port: number;
  apn: string;
  bands: number[];
}
