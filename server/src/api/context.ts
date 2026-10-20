// Tipi condivisi dalle rotte: servizi a disposizione e utente della richiesta.
import type { ForecastProvider } from "../agro/forecast.js";
import type { Auth, GlobalRole } from "../auth/auth.js";
import type { DbStatus, Sql } from "../lib/db.js";
import type { Mailer } from "../mail/mailer.js";

export interface ApiDeps {
  sql: Sql;
  auth: Auth;
  mailer: Mailer;
  /** chiave master delle chiavi delle centraline */
  master: Buffer;
  appUrl: string;
  mailerKind: "dev" | "smtp";
  uploadDir: string;
  /** IP del server scritto in laboratorio nelle centraline nuove */
  defaultServerIp: string;
  now: () => Date;
  /** previsioni meteo (oggi simulate) */
  forecast: ForecastProvider;
  dbStatus: () => Promise<DbStatus>;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
}

export type AppEnv = { Variables: { user: SessionUser | null } };
