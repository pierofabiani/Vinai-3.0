// Strumento di sviluppo: stampa l'SQL delle tabelle di Better Auth contro un database vuoto.
// Uso: DATABASE_URL=.../vuoto tsx src/auth/gen-sql.ts > migrations/NNNN_auth.sql (poi rivedere a mano)
import { getMigrations } from "better-auth/db/migration";
import pg from "pg";
import { createAuth } from "./auth.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const auth = createAuth({
  pool,
  mailer: { send: async () => {} },
  appUrl: "http://localhost:5173",
  secret: "x".repeat(32),
  canSignIn: async () => false,
  canSignUp: async () => false,
});
const { compileMigrations } = await getMigrations(auth.options);
console.log(await compileMigrations());
await pool.end();
