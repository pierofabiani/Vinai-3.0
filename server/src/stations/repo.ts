// Centraline: provisioning in laboratorio e configurazioni remote.
import { configDefaults, encodeConfigDiff, type StationConfig, validateConfig } from "@vinai/protocol";
import type { Sql } from "../lib/db.js";
import { encryptDeviceKey, newDeviceKey } from "../lib/keys.js";

export interface ProvisionInput {
  imei: bigint;
  label?: string;
  /** IP del server che il laboratorio scrive nella EEPROM */
  serverIp: string;
  status?: "lab" | "pronta";
  /** solo per test e importazioni: altrimenti si genera una chiave nuova */
  key?: Uint8Array;
}

/** Crea la centralina con una chiave nuova. La chiave in chiaro esce solo da qui, per programmarla. */
export async function provisionStation(sql: Sql, master: Buffer, input: ProvisionInput) {
  const key = input.key ?? newDeviceKey();
  const factory = configDefaults(input.serverIp);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO station (imei, key_enc, label, status, factory_config)
    VALUES (${input.imei.toString()}, ${encryptDeviceKey(master, input.imei, key)}, ${input.label ?? null},
            ${input.status ?? "lab"}, ${sql.json(factory as never)})
    RETURNING id`;
  if (!row) throw new Error("provisioning non riuscito");
  return { id: Number(row.id), key, factory };
}

/** Configurazione oggi applicata dalla centralina (versione 0 = quella di fabbrica). */
export async function appliedConfig(
  sql: Sql,
  stationId: number,
): Promise<{ version: number; params: StationConfig }> {
  const [st] = await sql<{ cfg_ver: number; factory_config: StationConfig }[]>`
    SELECT cfg_ver, factory_config FROM station WHERE id = ${stationId}`;
  if (!st) throw new Error(`centralina ${stationId} inesistente`);
  if (st.cfg_ver === 0) return { version: 0, params: st.factory_config };
  const [cv] = await sql<{ params: StationConfig }[]>`
    SELECT params FROM config_version WHERE station_id = ${stationId} AND version = ${st.cfg_ver}`;
  if (!cv) throw new Error(`versione ${st.cfg_ver} della centralina ${stationId} sconosciuta al server`);
  return { version: st.cfg_ver, params: cv.params };
}

/**
 * Nuova configurazione desiderata: arriverà alla centralina con la prossima risposta.
 * Una versione in attesa non ancora arrivata viene superata da questa.
 * Ritorna il numero di versione; se la configurazione è uguale a quella in uso, la versione in uso.
 */
export async function setDesiredConfig(
  sql: Sql,
  stationId: number,
  params: StationConfig,
  createdBy: string,
) {
  const problems = validateConfig(params);
  if (problems.length) throw new Error(`configurazione non valida: ${problems.join("; ")}`);
  // le modifiche devono stare in un solo pacchetto, rispetto a quanto la centralina ha oggi
  const applied = await appliedConfig(sql, stationId);
  const diff = encodeConfigDiff(applied.params, params);
  return sql.begin(async (tx) => {
    await tx`UPDATE config_version SET status = 'superata'
             WHERE station_id = ${stationId} AND status = 'da_inviare'`;
    // Uguale a quella in uso: nessuna versione nuova. Il firmware ignora una configurazione vuota,
    // quindi una versione senza differenze resterebbe "da inviare" per sempre.
    if (diff.length === 0) return applied.version;
    const [v] = await tx<{ version: number }[]>`
      SELECT greatest(coalesce(max(cv.version), 0), max(s.cfg_ver)) + 1 AS version
      FROM station s LEFT JOIN config_version cv ON cv.station_id = s.id
      WHERE s.id = ${stationId}`;
    const version = v?.version ?? 1;
    if (version > 65535) throw new Error("numeri di versione esauriti per questa centralina");
    await tx`INSERT INTO config_version (station_id, version, params, created_by)
             VALUES (${stationId}, ${version}, ${tx.json(params as never)}, ${createdBy})`;
    return version;
  });
}
