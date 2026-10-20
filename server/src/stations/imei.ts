// L'IMEI ha 15 cifre e l'ultima è un controllo di Luhn: un errore di battitura in laboratorio
// si scopre subito, non quando la centralina non riesce a farsi riconoscere.
export function imeiValid(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[14 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
