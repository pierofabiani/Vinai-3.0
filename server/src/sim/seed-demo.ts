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
  // trattamenti d'esempio: uno per vigneto, tra 2 e 9 giorni fa, se non ce ne sono già
  const PRODUCTS = [
    { product: "Rame idrossido", target: "peronospora", cover: 8 },
    { product: "Zolfo bagnabile", target: "oidio", cover: 7 },
    { product: "Poltiglia bordolese", target: "peronospora", cover: 9 },
  ];
  let treated = 0;
  for (const [k, v] of vineyards.entries()) {
    const [has] = await sql`SELECT 1 FROM treatment WHERE vineyard_id = ${v.id} LIMIT 1`;
    if (has) continue;
    const p = PRODUCTS[k % PRODUCTS.length] ?? PRODUCTS[0];
    if (!p) continue;
    const daysAgo = 2 + ((k * 3) % 8);
    await sql`INSERT INTO treatment (vineyard_id, applied_at, product, target, cover_days, note)
              VALUES (${v.id}, now() - make_interval(days => ${daysAgo}), ${p.product}, ${p.target}, ${p.cover},
                      'trattamento d''esempio (dati dimostrativi)')`;
    treated++;
  }

  // un titolare dimostrativo per la prima azienda: per vedere l'app come la vede un cliente
  const email = "titolare.demo@example.com";
  const [firstOrg] = await sql<{ id: string }[]>`SELECT id FROM organization WHERE name = ${ORGS[0].name}`;
  let [u] = await sql<{ id: string }[]>`SELECT id FROM "user" WHERE email = ${email}`;
  if (!u) {
    [u] = await sql<{ id: string }[]>`
      INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, 'Titolare demo', ${email}, false, 'user', now(), now()) RETURNING id`;
  }
  if (u && firstOrg)
    await sql`INSERT INTO membership (organization_id, user_id, role) VALUES (${firstOrg.id}, ${u.id}, 'titolare')
              ON CONFLICT DO NOTHING`;

  // un vigneto senza centralina: per vedere come l'app lo mostra
  if (firstOrg) {
    const [has] =
      await sql`SELECT 1 FROM vineyard WHERE organization_id = ${firstOrg.id} AND name = 'Vigna Nuova'`;
    if (!has)
      await sql`INSERT INTO vineyard (organization_id, name, variety, planting_year)
                VALUES (${firstOrg.id}, 'Vigna Nuova', 'Sangiovese', 2024)`;
  }
  console.log(
    `[demo] ${ORGS.length} aziende, ${vineyards.length} vigneti, ${i} centraline installate, ${treated} trattamenti d'esempio, titolare demo: ${email}`,
  );
} finally {
  await sql.end();
}
