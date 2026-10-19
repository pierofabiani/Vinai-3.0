// Schermate della console e delle pagine di accesso nel mondo Verderame, con pnpm dev acceso e la
// sessione dell'amministratore salvata dalle prove nel browser (e2e/.admin.json).
// Uso: pnpm --filter @vinai/app console:schermate [cartella]   (predefinita: e2e/screenshots/console)
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "e2e/screenshots/console";
mkdirSync(OUT, { recursive: true });
const base = "http://localhost:5173";
const b = await chromium.launch();
const admin = await b.newContext({
  storageState: "e2e/.admin.json",
  viewport: { width: 1440, height: 900 },
  locale: "it-IT",
  timezoneId: "Europe/Rome",
});
const probe = await admin.newPage();
const fleet = await (await probe.request.get(`${base}/api/console/fleet`)).json();
const orgs = await (await probe.request.get(`${base}/api/console/organizations`)).json();
const st = fleet.find((r) => r.status === "attiva" && r.location);
const org = orgs.find((o) => o.name.includes("Poggio")) ?? orgs[0];
await probe.close();

const shots = [
  ["accesso-390", "/accesso", 390, false, false],
  ["flotta-1440", "/console", 1440, true, false],
  ["flotta-1440-campo", "/console", 1440, true, true],
  ["flotta-390", "/console", 390, true, false],
  ["centralina-1440", `/console/centraline/${st?.id}`, 1440, true, false],
  ["laboratorio-1440", "/console/laboratorio", 1440, true, false],
  ["azienda-1440", `/console/aziende/${org?.id}`, 1440, true, false],
  ["installazione-390-campo", `/c/${st?.imei}`, 390, true, true],
];
for (const [name, path, w, auth, campo] of shots) {
  const ctx = await b.newContext({
    ...(auth ? { storageState: "e2e/.admin.json" } : {}),
    viewport: { width: w, height: w < 500 ? 844 : 900 },
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  });
  await ctx.addInitScript((c) => localStorage.setItem("vinai-campo", c ? "1" : "0"), campo);
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
  await p.goto(base + path);
  await p.waitForTimeout(path === "/console" ? 4500 : 2000);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name, overflow > 0 ? `OVERFLOW ${overflow}px` : "", errs.length ? errs : "");
  await ctx.close();
}
await b.close();
