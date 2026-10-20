import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Page } from "@playwright/test";
import postgres from "postgres";

if (existsSync("../.env")) process.loadEnvFile("../.env");

export const ADMIN = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "";
// condivisa tra i file di prova: non si chiude a mano, si chiude da sola quando resta inattiva
export const sql = postgres(process.env.DATABASE_URL ?? "", { max: 2, idle_timeout: 2, onnotice: () => {} });
export const SHOTS = process.env.E2E_SHOTS ?? "e2e/screenshots";

/** Collegamento più recente arrivato nella posta di prova per questa email. */
export async function lastLink(email: string, after: Date): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const [m] = await sql<{ link: string }[]>`
      SELECT link FROM dev_outbox WHERE recipient = ${email.toLowerCase()} AND created_at >= ${after} AND link IS NOT NULL
      ORDER BY id DESC LIMIT 1`;
    if (m) return m.link;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`nessuna email per ${email}`);
}

export async function loginWithLink(page: Page, email: string) {
  const t = new Date(Date.now() - 1000);
  await page.goto("/accesso");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Mandami il collegamento" }).click();
  await page.getByRole("heading", { name: "Controlla la posta" }).waitFor();
  await page.goto(await lastLink(email, t));
}

export async function shot(page: Page, name: string) {
  await mkdir(SHOTS, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** IMEI valido (Luhn) e diverso a ogni giro. */
export function freshImei(): string {
  const body = `35${String(Date.now()).slice(-12)}`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(body[13 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return body + ((10 - (sum % 10)) % 10);
}
