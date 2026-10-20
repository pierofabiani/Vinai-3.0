// Montaggio dei servizi dell'api a partire dall'ambiente: database, posta, autenticazione.
import { resolve } from "node:path";
import pg from "pg";
import { createAuth } from "../auth/auth.js";
import { connect, dbStatus, type Sql } from "../lib/db.js";
import type { Env } from "../lib/env.js";
import { parseMasterKey } from "../lib/keys.js";
import { devMailer, type Mailer, smtpMailer } from "../mail/mailer.js";
import { acceptOpenInvitations, hasOpenInvitation, userExists } from "../orgs/invitations.js";
import type { ApiDeps } from "./context.js";

export function buildServices(env: Env, opts: { sql?: Sql; mailer?: Mailer } = {}) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "Configurazione non valida: BETTER_AUTH_SECRET mancante (almeno 32 caratteri), serve all'api per le sessioni",
    );
  }
  const secret = env.BETTER_AUTH_SECRET;
  const sql = opts.sql ?? connect(env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
  const mailer =
    opts.mailer ??
    (env.MAILER === "smtp"
      ? smtpMailer(
          env.SMTP_URL ??
            (() => {
              throw new Error("MAILER=smtp richiede SMTP_URL");
            })(),
          env.MAIL_FROM,
        )
      : devMailer(sql));
  const bootstrap = env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const noAdminYet = async () => {
    const [r] = await sql`SELECT 1 FROM "user" WHERE role = 'admin' LIMIT 1`;
    return !r;
  };
  const auth = createAuth({
    pool,
    mailer,
    appUrl: env.APP_URL,
    secret,
    canSignIn: async (email) =>
      (await userExists(sql, email)) ||
      (await hasOpenInvitation(sql, email)) ||
      (email.toLowerCase() === bootstrap && (await noAdminYet())),
    canSignUp: async (email) =>
      (await hasOpenInvitation(sql, email)) || (email.toLowerCase() === bootstrap && (await noAdminYet())),
    onUserCreated: async (user) => {
      if (user.email.toLowerCase() === bootstrap && (await noAdminYet())) {
        await sql`UPDATE "user" SET role = 'admin' WHERE id = ${user.id}`;
      }
      await acceptOpenInvitations(sql, user);
    },
  });
  const deps: ApiDeps = {
    sql,
    auth,
    mailer,
    master: parseMasterKey(env.STATION_KEY_SECRET),
    appUrl: env.APP_URL,
    mailerKind: env.MAILER,
    uploadDir: resolve(env.UPLOAD_DIR),
    defaultServerIp: env.STATION_SERVER_IP,
    now: () => new Date(),
    dbStatus: () => dbStatus(sql),
  };
  const close = async () => {
    await pool.end();
    if (!opts.sql) await sql.end();
  };
  return { deps, close };
}
