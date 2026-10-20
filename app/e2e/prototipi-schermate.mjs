// Schermate dei prototipi P3 (telefono e computer, scuro e campo), con pnpm dev acceso.
// Uso: pnpm --filter @vinai/app proto:schermate [cartella]   (predefinita: e2e/screenshots/p3)
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "e2e/screenshots/p3";
await import("node:fs").then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const base = "http://localhost:5173";
const data = await (await fetch(base + "/prototipi/dati.json")).json();
const vid = data.vineyards.find((v) => v.advice.action === "tratta" && !v.synthetic)?.id;
const shots = [];
for (const d of ["a", "b"]) {
  shots.push([`${d}-oggi-390`, `/prototipi/${d}/oggi?n=3`, 390]);
  shots.push([`${d}-oggi-1440`, `/prototipi/${d}/oggi?n=3`, 1440]);
  shots.push([`${d}-oggi14-390`, `/prototipi/${d}/oggi?n=14`, 390]);
  shots.push([`${d}-vigneto-390`, `/prototipi/${d}/vigneto/${vid}?n=3`, 390]);
  shots.push([`${d}-vigneto-1440`, `/prototipi/${d}/vigneto/${vid}?n=3`, 1440]);
  shots.push([`${d}-flotta-1440`, `/prototipi/${d}/flotta`, 1440]);
}
shots.push(["b-oggi-campo-390", "/prototipi/b/oggi?n=3&campo=1", 390]);
const b = await chromium.launch();
for (const [name, path, w] of shots) {
  const ctx = await b.newContext({
    viewport: { width: w, height: w < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
  await p.goto(base + path);
  await p.waitForTimeout(path.includes("flotta") ? 4000 : 1500);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(name, overflow > 0 ? `OVERFLOW ${overflow}px` : "", errs.length ? errs : "");
  await ctx.close();
}
await b.close();
