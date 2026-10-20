// P4 nel browser: area clienti (Oggi, vigneto, trattamenti, osservazioni) e panoramica del rivenditore.
// Usa i dati dimostrativi: pnpm --filter @vinai/server seed:demo e il simulatore dal vivo.
import { expect, test } from "@playwright/test";
import { lastLink, shot, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const DEMO_ORG = "Tenuta Poggio Alto (demo)";
const DEMO_OWNER = "titolare.demo@example.com";

test.describe("da amministratore", () => {
  test.use({ storageState: "e2e/.admin.json", viewport: { width: 1440, height: 900 } });

  test("la panoramica porta all'area di un cliente, come la vede lui", async ({ page }) => {
    await page.goto("/console");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const row = page.locator("tr", { hasText: DEMO_ORG });
    await expect(row).toBeVisible();
    await shot(page, "p4-panoramica-1440");
    await row.getByRole("link", { name: /Area cliente/ }).click();
    await expect(page.getByText("come la vede il cliente")).toBeVisible();
    await expect(page.getByText("Protezione e rischio, vigneto per vigneto")).toBeVisible();
    await expect(page.getByRole("link", { name: /Campo Lungo/ })).toBeVisible();
    await shot(page, "p4-oggi-1440");
  });

  test("scheda del vigneto: registro un trattamento e un'osservazione", async ({ page }) => {
    const [v] = await sql<{ id: string; organization_id: string }[]>`
      SELECT v.id, v.organization_id FROM vineyard v JOIN organization o ON o.id = v.organization_id
      WHERE o.name = ${DEMO_ORG} AND v.name = 'Campo Lungo'`;
    await page.goto(`/a/${v?.organization_id}/vigneto/${v?.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Campo Lungo" })).toBeVisible();
    await expect(page.locator(".tc-plot svg")).toBeVisible();
    await page.getByRole("button", { name: "Registra trattamento" }).click();
    await page.getByRole("combobox", { name: /^Prodotto/ }).selectOption("Fosetil-Al");
    await expect(page.getByLabel("Copertura (giorni)")).toHaveValue("12");
    await page.getByLabel("Nota (facoltativa)").first().fill("prova automatica");
    await page.getByRole("button", { name: "Salva trattamento" }).click();
    await expect(page.getByText("Fosetil-Al").first()).toBeVisible();
    await page.getByRole("button", { name: "Segnala" }).click();
    await page.getByText("tracce").click();
    await page.getByRole("button", { name: "Salva osservazione" }).click();
    await expect(page.getByText(/Peronospora, tracce/)).toBeVisible();
    await page.getByRole("button", { name: "Conferma" }).first().click();
    await expect(page.getByText(/confermata/).first()).toBeVisible();
    await shot(page, "p4-vigneto-1440");
    // pulizia: la prova non deve cambiare i dati dimostrativi
    await sql`DELETE FROM treatment WHERE note = 'prova automatica'`;
    await sql`DELETE FROM observation WHERE vineyard_id = ${v?.id ?? ""} AND note IS NULL AND severity = 1`;
  });
});

test("il titolare entra con il collegamento e arriva dritto al suo Oggi, sul telefono", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const t = new Date(Date.now() - 1000);
  await page.goto("/accesso");
  await page.getByLabel("Email").fill(DEMO_OWNER);
  await page.getByRole("button", { name: "Mandami il collegamento" }).click();
  await page.getByRole("heading", { name: "Controlla la posta" }).waitFor();
  await page.goto(await lastLink(DEMO_OWNER, t));
  await expect(page).toHaveURL(/\/a\/[0-9a-f-]+$/);
  await expect(page.getByText("Protezione e rischio, vigneto per vigneto")).toBeVisible();
  await expect(page.getByText("come la vede il cliente")).toHaveCount(0);
  await shot(page, "p4-oggi-390");
  // modalità campo per il sole
  await page.getByRole("button", { name: "Campo" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-campo", "true");
  await shot(page, "p4-oggi-390-campo");
  // il titolare non vede la console
  await page.goto("/console");
  await expect(page).not.toHaveURL(/\/console/);
  await ctx.close();
});
