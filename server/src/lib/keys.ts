// Le chiavi HMAC delle centraline si salvano cifrate (AES-256-GCM) con una chiave master
// che sta solo nelle variabili d'ambiente. L'IMEI è legato alla cifratura come dato autenticato:
// una chiave copiata sulla riga di un'altra centralina non si decifra.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DEVICE_KEY_LEN } from "@vinai/protocol";

const IV_LEN = 12;
const TAG_LEN = 16;

export function parseMasterKey(hex: string): Buffer {
  const k = Buffer.from(hex, "hex");
  if (k.length !== 32 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("STATION_KEY_SECRET deve essere di 64 caratteri esadecimali (32 byte)");
  }
  return k;
}

const aad = (imei: bigint) => Buffer.from(`vinai-station-key:${imei}`);

export function newDeviceKey(): Uint8Array {
  return new Uint8Array(randomBytes(DEVICE_KEY_LEN));
}

export function encryptDeviceKey(master: Buffer, imei: bigint, key: Uint8Array): Buffer {
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv("aes-256-gcm", master, iv);
  c.setAAD(aad(imei));
  const data = Buffer.concat([c.update(key), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]);
}

export function decryptDeviceKey(master: Buffer, imei: bigint, blob: Uint8Array): Uint8Array {
  const b = Buffer.from(blob);
  const d = createDecipheriv("aes-256-gcm", master, b.subarray(0, IV_LEN));
  d.setAAD(aad(imei));
  d.setAuthTag(b.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return new Uint8Array(Buffer.concat([d.update(b.subarray(IV_LEN + TAG_LEN)), d.final()]));
}
