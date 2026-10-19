// Configurazione letta dalle variabili d'ambiente, validata all'avvio:
// meglio fermarsi subito che partire con un valore sbagliato.
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(8787),
  COAP_PORT: z.coerce.number().int().positive().default(5683),
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
