import { describe, expect, it } from "vitest";
import { advice, estimateRain, type Hour, protection, risks, treatWindow } from "./model.js";

const NOW = Date.UTC(2027, 4, 10, 12);
const H = 3_600_000;
/** ore consecutive a partire da `from`, con valori costanti salvo eccezioni */
function hours(from: number, n: number, f: (i: number) => Partial<Hour> = () => ({})): Hour[] {
  return Array.from({ length: n }, (_, i) => ({
    t: new Date(from + i * H).toISOString(),
    temp: 18,
    hum: 70,
    wet: 0,
    rain: 0,
    ...f(i),
  }));
}

describe("protezione residua", () => {
  const past = hours(NOW - 72 * H, 73);
  const forecast = hours(NOW + H, 72);
  const tr = {
    applied_at: new Date(NOW - 2 * 24 * H),
    product: "Rame",
    target: "peronospora",
    cover_days: 8,
  };

  it("senza pioggia si consuma un giorno ogni 24 ore", () => {
    const p = protection(tr, past, forecast, NOW);
    expect(p?.remainingDays).toBeCloseTo(6, 0);
    expect(p?.rainSinceMm).toBe(0);
    expect(p?.exhaustedOn).toBeNull(); // dura oltre i 3 giorni di previsione
  });

  it("la pioggia la consuma: 10 mm valgono 2 giorni", () => {
    const wetPast = hours(NOW - 72 * H, 73, (i) => (i === 60 ? { rain: 10 } : {}));
    const p = protection(tr, wetPast, forecast, NOW);
    expect(p?.rainSinceMm).toBe(10);
    expect(p?.remainingDays).toBeCloseTo(4, 0);
  });

  it("un trattamento vecchio ha la copertura finita, con la data in cui è finita", () => {
    const old = { ...tr, applied_at: new Date(NOW - 20 * 24 * H) };
    const p = protection(old, past, forecast, NOW);
    expect(p?.remainingDays).toBe(0);
    expect(new Date(p?.exhaustedOn ?? 0).getTime()).toBeLessThan(NOW);
  });

  it("senza trattamento non si inventa una protezione", () => {
    expect(protection(null, past, forecast, NOW)).toBeNull();
  });
});

describe("consiglio", () => {
  const wetNight = hours(NOW - 48 * H, 49, (i) => (i >= 30 && i < 40 ? { wet: 60, temp: 17 } : {}));
  const forecast = hours(NOW + H, 72);

  it("rischio alto e nessuna protezione: tratta, con una scadenza futura", () => {
    const r = risks(wetNight, forecast, "Merlot", NOW);
    expect(r.peronospora.level).toBe("alto");
    expect(r.peronospora.why).toMatch(/10 ore di foglia bagnata/);
    const a = advice(r, null, NOW);
    expect(a.action).toBe("tratta");
    expect(new Date(a.by ?? 0).getTime()).toBeGreaterThan(NOW);
  });

  it("rischio alto ma coperto contro la stessa malattia per giorni: niente allarme", () => {
    const r = risks(wetNight, forecast, "Merlot", NOW);
    const p = protection(
      { applied_at: new Date(NOW - 24 * H), product: "Rame", target: "peronospora", cover_days: 10 },
      wetNight,
      forecast,
      NOW,
    );
    expect(advice(r, p, NOW).action).not.toBe("tratta");
  });

  it("niente bagnatura: tutto bene", () => {
    const dry = hours(NOW - 48 * H, 49);
    expect(advice(risks(dry, forecast, "Sangiovese", NOW), null, NOW).action).toBe("ok");
  });
});

describe("finestra per trattare e pioggia stimata", () => {
  it("trova la prima finestra asciutta di almeno 4 ore", () => {
    const fc = hours(NOW + H, 36, (i) => (i < 3 || (i >= 6 && i < 8) ? { rain: 2 } : {}));
    const w = treatWindow(fc);
    expect(w?.from).toBe(fc[8]?.t); // la finestra di 3 ore (3-5) è troppo corta
  });

  it("nessuna finestra se piove sempre", () => {
    expect(treatWindow(hours(NOW, 36, () => ({ rain: 1 })))).toBeNull();
  });

  it("la pioggia stimata è ripetibile: stessi dati, stesso risultato", () => {
    const h = hours(NOW, 5, (i) => (i === 2 ? { hum: 99, wet: 60 } : {})).map(({ rain: _r, ...x }) => x);
    expect(estimateRain(h, "v1")).toEqual(estimateRain(h, "v1"));
    expect(estimateRain(h, "v1")[2]?.rain).toBeGreaterThan(0);
    expect(estimateRain(h, "v1")[0]?.rain).toBe(0);
  });
});
