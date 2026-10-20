// Dati dimostrativi per lo sviluppo e il design: due aziende "(demo)" con vigneti veri sulla mappa,
// e le centraline simulate installate lì. Uso, con pnpm dev acceso:
//   pnpm --filter @vinai/server sim --stations 20 --days 3 --imei-base 992000000000000
//   pnpm --filter @vinai/server seed:demo --imei-base 992000000000000
import { parseArgs } from "node:util";
import { connect } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";

const { values } = parseArgs({ options: { "imei-base": { type: "string", default: "992000000000000" } } });
const base = BigInt(values["imei-base"]);

const ORGS = [
  {
    name: "Tenuta Poggio Alto (demo)",
    region: "Toscana",
    province: "Siena",
    vineyards: [
      { name: "Vigna del Poggio", variety: "Sangiovese", year: 2008, at: [43.4691, 11.2405] },
      { name: "Le Coste", variety: "Sangiovese", year: 2015, at: [43.4612, 11.2551] },
      { name: "Campo Lungo", variety: "Merlot", year: 2011, at: [43.4775, 11.2287] },
    ],
  },
  {
    name: "Cantina Colli Euganei (demo)",
    region: "Veneto",
    province: "Padova",
    vineyards: [
      { name: "Monte Rua", variety: "Glera", year: 2012, at: [45.3163, 11.6977] },
      { name: "Le Basse", variety: "Cabernet Franc", year: 2004, at: [45.2938, 11.7213] },
    ],
  },
] as const;

const sql = connect(loadEnv().DATABASE_URL);
try {
  const vineyards: { id: string; orgId: string; at: readonly [number, number] }[] = [];
  for (const o of ORGS) {
    const [existing] = await sql<{ id: string }[]>`SELECT id FROM organization WHERE name = ${o.name}`;
    const orgId =
      existing?.id ??
      (
        await sql<
          { id: string }[]
        >`INSERT INTO organization (name, region, province) VALUES (${o.name}, ${o.region}, ${o.province}) RETURNING id`
      )[0]?.id;
    if (!orgId) throw new Error("azienda non creata");
    for (const v of o.vineyards) {
      const [ex] = await sql<
        { id: string }[]
      >`SELECT id FROM vineyard WHERE organization_id = ${orgId} AND name = ${v.name}`;
      const id =
        ex?.id ??
        (
          await sql<{ id: string }[]>`
          INSERT INTO vineyard (organization_id, name, variety, planting_year) VALUES (${orgId}, ${v.name}, ${v.variety}, ${v.year}) RETURNING id`
        )[0]?.id;
      if (id) vineyards.push({ id, orgId, at: v.at });
    }
  }
  const stations = await sql<{ id: string; imei: string }[]>`
    SELECT id, imei::text FROM station WHERE imei >= ${base.toString()} AND imei < ${(base + 1000n).toString()} ORDER BY imei`;
  let i = 0;
  for (const s of stations) {
    const v = vineyards[i % vineyards.length];
    if (!v) break;
    // poche decine di metri tra centraline dello stesso vigneto
    const lat = v.at[0] + ((i * 37) % 11) * 0.0004 - 0.002;
    const lon = v.at[1] + ((i * 53) % 13) * 0.0004 - 0.0025;
    await sql`
      UPDATE station SET organization_id = ${v.orgId}, vineyard_id = ${v.id},
        location = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
        installed_at = coalesce(installed_at, now() - interval '3 days'), label = coalesce(label, ${`Hive ${i + 1}`})
      WHERE id = ${s.id}`;
    i++;
  }
  console.log(`[demo] ${ORGS.length} aziende, ${vineyards.length} vigneti, ${i} centraline installate`);
} finally {
  await sql.end();
}
