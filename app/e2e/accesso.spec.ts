// Visitatore senza sessione: le pagine protette portano all'accesso, e la pagina risponde.
// Regressione: con <Navigate> nella rotta protetta il browser restava bloccato (RESULT_CODE_HUNG).
import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

for (const path of ["/", "/console", "/profilo", "/a/00000000-0000-0000-0000-000000000000"]) {
  test(`senza sessione ${path} porta all'accesso e non si blocca`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/accesso\?next=/, { timeout: 15_000 });
    await expect(page.getByLabel("Email")).toBeVisible();
    // la pagina risponde: un'operazione semplice deve completarsi
    expect(await page.evaluate(() => document.readyState)).toBe("complete");
  });
}
