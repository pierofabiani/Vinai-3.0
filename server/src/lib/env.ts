// Configurazione letta dalle variabili d'ambiente, validata all'avvio:
// meglio fermarsi subito che partire con un valore sbagliato.
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(8787),
  COAP_PORT: z.coerce.number().int().positive().default(5683),
  /** chiave master che cifra le chiavi delle centraline: 64 caratteri esadecimali */
  STATION_KEY_SECRET: z.string().regex(/^[0-9a-fA-F]{64}$/, "servono 64 caratteri esadecimali"),
  /** indirizzo pubblico della web app: link nelle email, origine delle passkey */
  APP_URL: z.string().url().default("http://localhost:5173"),
  /** segreto delle sessioni: almeno 32 caratteri */
  /** obbligatorio solo per l'api (accesso): ingest e worker non lo usano e partono anche senza */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** dev = email nella tabella dev_outbox; smtp = invio vero */
  MAILER: z.enum(["dev", "smtp"]).default("dev"),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("Vinai <noreply@localhost>"),
  /** cartella delle foto di installazione */
  UPLOAD_DIR: z.string().default("../data/uploads"),
  /** IP del server CoAP scritto in laboratorio nelle centraline nuove */
  STATION_SERVER_IP: z.string().default("127.0.0.1"),
  /** email del primo amministratore: l'unica che può entrare senza invito */
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configurazione non valida: ${problems}`);
  }
  return parsed.data;
}
