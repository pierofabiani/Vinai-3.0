// Previsioni meteo. Per ora solo il fornitore SIMULATO, generato dallo stesso meteo del simulatore:
// dati coerenti per provare le schermate. In produzione si sostituisce con un servizio con licenza
// commerciale (piano, "Dati esterni") dietro la stessa interfaccia.
import { Weather } from "../sim/weather.js";
import { type Hour, hashNum } from "./model.js";

export interface ForecastProvider {
  /** nome mostrato nell'app accanto ai dati */
  source: string;
  forecast(place: { id: string; lat: number; lon: number }, fromMs: number, hours: number): Promise<Hour[]>;
}

const HOUR = 3_600_000;
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export const simulatedForecast: ForecastProvider = {
  source: "previsione simulata",
  async forecast(place, fromMs, hours) {
    const seed = Math.floor(hashNum(place.id) * 1e6);
    // stessa "zona" per vigneti vicini: piogge condivise, come nella realtà
    const zone = Math.floor(place.lat * 10) * 1000 + Math.floor(place.lon * 10);
    const w = new Weather(seed, zone);
    const out: Hour[] = [];
    const start = Math.floor(fromMs / HOUR) * HOUR + HOUR;
    for (let i = 0; i < hours; i++) {
      const t = start + i * HOUR;
      let wet = 0;
      for (let m = 0; m < 60; m += 10) if (w.at(new Date(t + m * 60_000)).wet) wet += 10;
      const x = w.at(new Date(t + 30 * 60_000));
      const rain = x.hum_pct >= 99 && wet >= 50 ? round(0.4 + hashNum(place.id, t) * 3.2) : 0;
      out.push({ t: new Date(t).toISOString(), temp: round(x.temp_c), hum: round(x.hum_pct, 0), wet, rain });
    }
    return out;
  },
};
