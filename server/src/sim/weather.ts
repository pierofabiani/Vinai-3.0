// Meteo sintetico ma plausibile per una vigna in primavera, deterministico:
// stesso seme e stessa ora danno sempre lo stesso valore.
// Le centraline della stessa "zona" condividono le piogge, come vigneti vicini.

function hash(a: number, b: number, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export interface MinuteWeather {
  temp_c: number;
  hum_pct: number;
  press_hpa: number;
  /** foglia bagnata in questo minuto */
  wet: boolean;
}

export class Weather {
  constructor(
    private readonly seed: number,
    private readonly zone: number,
  ) {}

  private raining(hour: number): boolean {
    const block = Math.floor(hour / 3); // eventi di pioggia a blocchi di 3 ore
    return hash(this.zone, block, 7) < 0.07;
  }

  at(t: Date): MinuteWeather {
    const ms = t.getTime();
    const hour = Math.floor(ms / 3_600_000);
    const day = Math.floor(hour / 24);
    const hourOfDay = (ms / 3_600_000) % 24;
    const stationOffset = (hash(this.seed, 1) - 0.5) * 2; // ±1 °C per esposizione e quota
    const dayOffset = (hash(this.zone, day, 3) - 0.5) * 6; // giornate più calde o più fresche
    const rain = this.raining(hour);
    const recentRain = rain || this.raining(hour - 1) || this.raining(hour - 2);
    const temp =
      13 + 7 * Math.sin((2 * Math.PI * (hourOfDay - 9)) / 24) + stationOffset + dayOffset - (rain ? 3 : 0);
    const hum = Math.min(
      100,
      Math.max(30, 100 - (temp - 5) * 3.2 + (rain ? 25 : 0) + hash(this.seed, hour, 5) * 4),
    );
    const press =
      1013 + 6 * Math.sin((2 * Math.PI * day) / 5) + (hash(this.zone, hour, 9) - 0.5) - (rain ? 4 : 0);
    // bagnatura: pioggia, asciugatura nelle due ore successive, rugiada con umidità molto alta
    const wet = recentRain || hum >= 93;
    return { temp_c: temp, hum_pct: hum, press_hpa: press, wet };
  }
}

export { hash };
