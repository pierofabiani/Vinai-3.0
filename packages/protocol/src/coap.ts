// Il CoAP minimo della centralina (firmware/src/core/coap.c), per il simulatore di flotta:
// costruisce gli stessi byte che manda il firmware e legge la risposta come la legge lui.
// Il server usa invece una libreria CoAP completa.

export const COAP_TYPE_CON = 0;
export const COAP_TYPE_ACK = 2;
export const COAP_TYPE_RST = 3;

export function coapBuildPost(msgId: number, token: Uint8Array, payload: Uint8Array): Uint8Array {
  const head = [
    0x40 | (COAP_TYPE_CON << 4) | 4,
    0x02, // POST
    (msgId >> 8) & 0xff,
    msgId & 0xff,
    ...token,
    (11 << 4) | 1, // Uri-Path
    0x6d, // "m"
    (1 << 4) | 1, // Content-Format (12 = 11 + 1)
    42, // application/octet-stream
    0xff,
  ];
  const out = new Uint8Array(head.length + payload.length);
  out.set(head, 0);
  out.set(payload, head.length);
  return out;
}

export type CoapRx =
  | { kind: "response"; code: number; payload: Uint8Array }
  | { kind: "empty-ack" }
  | { kind: "separate"; code: number; payload: Uint8Array; msgId: number }
  | { kind: "error"; code: number }
  | { kind: "reset" }
  | { kind: "other" }
  | { kind: "invalid" };

function findPayload(b: Uint8Array, start: number): Uint8Array | null {
  let pos = start;
  while (pos < b.length) {
    const x = b[pos++] as number;
    if (x === 0xff) return pos < b.length ? b.subarray(pos) : null;
    const delta = x >> 4;
    let olen = x & 0x0f;
    if (delta === 15 || olen === 15) return null;
    if (delta === 13) pos += 1;
    else if (delta === 14) pos += 2;
    if (olen === 13) olen = (b[pos++] as number) + 13;
    else if (olen === 14) {
      olen = (((b[pos] as number) << 8) | (b[pos + 1] as number)) + 269;
      pos += 2;
    }
    if (pos + olen > b.length) return null;
    pos += olen;
  }
  return new Uint8Array(0);
}

export function coapParse(b: Uint8Array, msgId: number, token: Uint8Array): CoapRx {
  if (b.length < 4 || (b[0] as number) >> 6 !== 1) return { kind: "invalid" };
  const type = ((b[0] as number) >> 4) & 3;
  const tkl = (b[0] as number) & 0x0f;
  const code = b[1] as number;
  const mid = ((b[2] as number) << 8) | (b[3] as number);
  if (tkl > 8 || b.length < 4 + tkl) return { kind: "invalid" };
  if (type === COAP_TYPE_RST) return mid === msgId ? { kind: "reset" } : { kind: "other" };
  if (type === COAP_TYPE_ACK && code === 0) return mid === msgId ? { kind: "empty-ack" } : { kind: "other" };
  if (tkl !== 4 || !token.every((t, i) => b[4 + i] === t)) return { kind: "other" };
  if (type === COAP_TYPE_ACK && mid !== msgId) return { kind: "other" };
  const payload = findPayload(b, 4 + tkl);
  if (payload === null) return { kind: "invalid" };
  const cls = code >> 5;
  if (cls === 4 || cls === 5) return { kind: "error", code };
  if (cls !== 2) return { kind: "invalid" };
  if (type === COAP_TYPE_ACK) return { kind: "response", code, payload };
  return { kind: "separate", code, payload, msgId: mid };
}

export function coapBuildAck(msgId: number): Uint8Array {
  return Uint8Array.from([0x40 | (COAP_TYPE_ACK << 4), 0, (msgId >> 8) & 0xff, msgId & 0xff]);
}
