// Sviluppo: stampa le ultime email della posta di prova (per il primo accesso dell'amministratore,
// quando la console non è ancora raggiungibile). Uso: pnpm --filter @vinai/server posta
import { connect } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";

const sql = connect(loadEnv().DATABASE_URL);
try {
  const mails = await sql<{ created_at: Date; recipient: string; subject: string; link: string | null }[]>`
    SELECT created_at, recipient, subject, link FROM dev_outbox ORDER BY id DESC LIMIT 5`;
  if (!mails.length) console.log("Nessuna email nella posta di prova.");
  for (const m of mails)
    console.log(`${m.created_at.toISOString()}  ${m.recipient}  ${m.subject}\n  ${m.link ?? ""}\n`);
} finally {
  await sql.end();
}
