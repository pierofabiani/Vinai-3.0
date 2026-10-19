// P2 nel browser: accesso, flotta, scheda, laboratorio, aziende e inviti, passkey, installazione da QR.
import { expect, test } from "@playwright/test";
import { ADMIN, freshImei, lastLink, loginWithLink, shot, sql } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(async () => sql.end());

const run = Date.now().toString(36);
const OWNER = `titolare-${run}@prova.it`;
const ORG = `Azienda Prova ${run}`;
const IMEI = freshImei();

test("l'amministratore entra con il collegamento e vede la flotta", async ({ page }) => {
  expect(ADMIN, "BOOTSTRAP_ADMIN_EMAIL in .env").not.toBe("");
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await loginWithLink(page, ADMIN);
  await expect(page).toHaveURL(/\/console$/);
  await expect(page.getByRole("heading", { name: "Flotta" })).toBeVisible();
  await expect(page.getByText(/centraline in servizio/)).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1500); // tile della mappa
  await shot(page, "01-flotta-1440");
  // la mappa ha disegnato i punti delle centraline, senza errori (worker, colori, stile)
  expect(errors.filter((e) => !e.includes("GL Driver"))).toEqual([]);
  await page.context().storageState({ path: "e2e/.admin.json" });
});

test.describe("da amministratore", () => {
  test.use({ storageState: "e2e/.admin.json", viewport: { width: 1440, height: 900 } });

  test("scheda della centralina con grafici e configurazione", async ({ page }) => {
    await page.goto("/console");
    await page.locator("tbody tr", { hasText: "Attiva" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Temperatura, media oraria con minimo e massimo")).toBeVisible();
    await expect(page.locator(".uplot")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Invia alla centralina" })).toBeDisabled();
    await shot(page, "02-centralina-1440");
  });

  test("laboratorio: registra una scheda, la chiave si vede una volta", async ({ page }) => {
    await page.goto("/console/laboratorio");
    await page.getByLabel("IMEI del modem").fill("123456789012345");
    await page.getByRole("button", { name: "Registra" }).click();
    await expect(page.getByRole("alert")).toContainText("IMEI non valido");
    await page.getByLabel("IMEI del modem").fill(IMEI);
    await page.getByLabel("Nome").fill(`Banco ${run}`);
    await page.getByRole("button", { name: "Registra" }).click();
    await expect(page.getByRole("heading", { name: `Chiave della centralina ${IMEI}` })).toBeVisible();
    await expect(page.locator("code")).toHaveText(/^[0-9a-f]{32}$/);
    await shot(page, "03-laboratorio-chiave");
    await page.getByRole("button", { name: "Fatto, l'ho salvata" }).click();
    const row = page.locator("tr", { hasText: IMEI });
    await row.getByRole("button", { name: "Collaudo ok" }).click();
    await expect(row.getByText("collaudata")).toBeVisible();
  });

  test("crea l'azienda con il vigneto e invita il titolare", async ({ page }) => {
    await page.goto("/console/aziende");
    await page.getByRole("button", { name: "Nuova azienda" }).click();
    await page.getByLabel("Nome dell'azienda").fill(ORG);
    await page.getByLabel("Regione").fill("Toscana");
    await page.getByLabel("Email del titolare").fill(OWNER);
    await page.getByRole("button", { name: "Crea azienda" }).click();
    await expect(page.getByRole("status")).toContainText(`Invito mandato a ${OWNER}`);
    await page.getByRole("link", { name: ORG }).click();
    await page.getByLabel("Nuovo vigneto").fill("Vigna di Prova");
    await page.getByLabel("Varietà").fill("Sangiovese");
    await page.getByRole("button", { name: "Aggiungi" }).click();
    await expect(page.getByRole("cell", { name: "Vigna di Prova" })).toBeVisible();
    await expect(page.getByText(OWNER)).toBeVisible();
    await shot(page, "04-azienda");
  });

  test("installazione dal QR, sul telefono, con la posizione GPS", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: "e2e/.admin.json",
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      geolocation: { latitude: 43.4702, longitude: 11.2398, accuracy: 6 },
      permissions: ["geolocation"],
      colorScheme: "light",
    });
    const page = await ctx.newPage();
    await page.goto(`/c/${IMEI}`);
    await expect(page.getByText(`IMEI ${IMEI}`)).toBeVisible();
    await page.getByLabel("Azienda").selectOption({ label: ORG });
    await page.getByLabel("Vigneto").selectOption({ label: "Vigna di Prova" });
    await page.getByRole("button", { name: "Usa la posizione del telefono" }).click();
    await expect(page.getByText(/precisione 6 m/)).toBeVisible();
    await shot(page, "05-installazione-375-chiaro");
    await page.getByRole("button", { name: "Conferma l'installazione" }).click();
    await expect(page.getByRole("heading", { name: "Centralina installata" })).toBeVisible();
    const [st] = await sql<{ status: string; lat: number }[]>`
      SELECT status, ST_Y(location::geometry) AS lat FROM station WHERE imei = ${IMEI}`;
    expect(st?.status).toBe("installata");
    expect(st?.lat).toBeCloseTo(43.4702, 4);
    await ctx.close();
  });

  test("la console sul telefono", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: "e2e/.admin.json",
      viewport: { width: 375, height: 812 },
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto("/console");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await page.waitForTimeout(1200);
    await shot(page, "06-flotta-375");
    // nessuno scorrimento orizzontale della pagina (le tabelle scorrono dentro il loro riquadro)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await ctx.close();
  });
});

test("il titolare entra dall'invito, aggiunge una passkey ed entra con quella", async ({ page, context }) => {
  const [inv] = await sql<{ link: string }[]>`
    SELECT link FROM dev_outbox WHERE recipient = ${OWNER} AND subject LIKE 'Invito%' ORDER BY id DESC LIMIT 1`;
  expect(inv?.link).toBeTruthy();
  await page.goto(inv?.link ?? "");
  await expect(page.getByRole("heading", { name: `Invito in ${ORG}` })).toBeVisible();
  await shot(page, "07-invito");
  const t = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Ricevi il collegamento per entrare" }).click();
  await expect(page.getByRole("status")).toContainText(OWNER);
  await page.goto(await lastLink(OWNER, t));
  await expect(page.getByRole("heading", { name: ORG })).toBeVisible();
  await expect(page.getByText("Sei titolare")).toBeVisible();

  // passkey con un autenticatore virtuale (come l'impronta del telefono)
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  await page.goto("/profilo");
  await page.getByRole("button", { name: "Aggiungi questo dispositivo" }).click();
  await expect(page.getByRole("cell", { name: /Computer|Telefono/ })).toBeVisible();
  await shot(page, "08-profilo-passkey");
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/accesso/);
  await page.getByRole("button", { name: "Entra con passkey" }).click();
  await expect(page.getByRole("heading", { name: ORG })).toBeVisible();
});
