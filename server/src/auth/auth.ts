// Autenticazione con Better Auth: link via email, passkey, sessioni, ruoli globali.
// Registrazione chiusa: entra solo chi ha già un account o un invito valido (nota 0009).
// Aziende, ruoli per azienda e inviti sono tabelle nostre (src/orgs).
import { passkey } from "@better-auth/passkey";
import { APIError, betterAuth } from "better-auth";
import { admin, magicLink } from "better-auth/plugins";
import type { Pool } from "pg";
import type { Mailer } from "../mail/mailer.js";

/** Ruoli globali: chi gestisce la piattaforma. I ruoli per azienda stanno in membership. */
export const GLOBAL_ROLES = ["user", "tecnico", "admin"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export interface AuthDeps {
  pool: Pool;
  mailer: Mailer;
  appUrl: string;
  secret: string;
  /** true se l'email può ricevere un link: utente esistente o invito valido */
  canSignIn: (email: string) => Promise<boolean>;
  /** true se l'email può diventare un utente nuovo: invito valido o primo amministratore */
  canSignUp: (email: string) => Promise<boolean>;
  /** dopo la creazione: ruolo del primo amministratore, inviti accettati */
  onUserCreated?: (user: { id: string; email: string }) => Promise<void>;
}

export function createAuth(deps: AuthDeps) {
  const app = new URL(deps.appUrl);
  return betterAuth({
    appName: "Vinai",
    baseURL: deps.appUrl,
    basePath: "/api/auth",
    secret: deps.secret,
    database: deps.pool,
    trustedOrigins: [app.origin],
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 giorni: in vigna non si vuole rifare l'accesso ogni settimana
      updateAge: 60 * 60 * 24,
    },
    user: { deleteUser: { enabled: true } },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        async sendMagicLink({ email, url }) {
          // Nessun errore se l'email non è ammessa: non si rivela chi ha un account.
          if (!(await deps.canSignIn(email))) return;
          await deps.mailer.send({
            to: email,
            subject: "Il tuo accesso a Vinai",
            text: `Per entrare in Vinai apri questo collegamento entro 15 minuti:\n\n${url}\n\nSe non hai chiesto tu l'accesso, ignora questa email.`,
            link: url,
          });
        },
      }),
      passkey({ rpID: app.hostname, rpName: "Vinai", origin: app.origin }),
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
    ],
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            if (!(await deps.canSignUp(user.email))) {
              throw new APIError("FORBIDDEN", { message: "Serve un invito per entrare in Vinai" });
            }
            const email = user.email.toLowerCase();
            // chi entra con il collegamento non ha ancora un nome: si parte dall'email, poi lo cambia nel profilo
            const name = user.name?.trim() || (email.split("@")[0] ?? email);
            return { data: { ...user, email, name } };
          },
          async after(user) {
            await deps.onUserCreated?.({ id: user.id, email: user.email });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
