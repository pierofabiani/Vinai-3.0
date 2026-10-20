import { connect } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { migrate } from "./migrate.js";

const sql = connect(loadEnv().DATABASE_URL);
try {
  const applied = await migrate(sql);
  console.log(applied.length ? `Migrazioni applicate: ${applied.join(", ")}` : "Database già aggiornato");
} finally {
  await sql.end();
}
