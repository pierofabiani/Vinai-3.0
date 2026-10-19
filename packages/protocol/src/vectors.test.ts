// Il codec TypeScript deve riprodurre byte per byte i vettori generati dal firmware C
// (make -C firmware vectors). Se questo test fallisce, server e firmware non si capiscono.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coapBuildPost, coapParse } from "./coap.js";
import { applyConfigTlv, configDefaults, encodeConfigDiff, type StationConfig } from "./config.js";
import {
  decodeDownlink,
  decodeUplink,
  encodeDownlink,
  encodeUplink,
  peekUplinkImei,
  uplinkTag,
} from "./packet.js";

const vectors = JSON.parse(readFileSync(new URL("../vectors/firmware.json", import.meta.url), "utf8"));
const hex = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

describe("uplink", () => {
  for (const vec of vectors.uplinks) {
    it(`decodifica e ricodifica: ${vec.name}`, () => {
      const key = hex(vec.key);
      const payload = hex(vec.payload);
      expect(peekUplinkImei(payload)).toBe(BigInt(vec.imei));
      const res = decodeUplink(payload, key);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const u = res.value;
      expect(u.imei).toBe(BigInt(vec.imei));
      expect(u.fw_ver).toBe(vec.fw_ver);
      expect(u.cfg_ver).toBe(vec.cfg_ver);
      expect(u.health).toEqual(vec.health);
      expect(u.first_seq).toBe(vec.first_seq);
      expect(u.records).toEqual(vec.records);
      expect(toHex(encodeUplink(u, key))).toBe(vec.payload);
      expect(toHex(uplinkTag(payload))).toBe(vec.tag);
    });

    it(`datagramma CoAP identico al firmware: ${vec.name}`, () => {
      expect(toHex(coapBuildPost(vec.coap.msg_id, hex(vec.coap.token), hex(vec.payload)))).toBe(
        vec.coap.datagram,
      );
    });
  }

  it("rifiuta una firma sbagliata, un byte alterato e una lunghezza errata", () => {
    const vec = vectors.uplinks[0];
    const payload = hex(vec.payload);
    const wrongKey = hex(vec.key).map((b) => b ^ 1);
    expect(decodeUplink(payload, wrongKey)).toEqual({ ok: false, error: "hmac" });
    const tampered = payload.slice();
    tampered[40] = (tampered[40] as number) ^ 0x01;
    expect(decodeUplink(tampered, hex(vec.key))).toEqual({ ok: false, error: "hmac" });
    expect(decodeUplink(payload.subarray(0, payload.length - 1), hex(vec.key))).toEqual({
      ok: false,
      error: "len",
    });
    const notData = payload.slice();
    notData[1] = 0x81;
    expect(decodeUplink(notData, hex(vec.key))).toEqual({ ok: false, error: "type" });
    expect(peekUplinkImei(notData)).toBeNull();
  });
});

describe("downlink", () => {
  for (const vec of vectors.downlinks) {
    it(`codifica identica al firmware: ${vec.name}`, () => {
      const d = {
        req_tag: hex(vec.req_tag),
        acked_seq: vec.acked_seq,
        server_time: vec.server_time,
        flags: vec.flags,
        cfg_ver: vec.cfg_ver,
        cfg: hex(vec.cfg),
      };
      expect(toHex(encodeDownlink(d, hex(vec.key)))).toBe(vec.payload);
      const back = decodeDownlink(hex(vec.payload), hex(vec.key), hex(vec.req_tag));
      expect(back).toEqual({ ok: true, value: d });
    });
  }

  it("rifiuta un tag di richiesta diverso", () => {
    const vec = vectors.downlinks[0];
    expect(decodeDownlink(hex(vec.payload), hex(vec.key), hex("00000000"))).toEqual({
      ok: false,
      error: "tag",
    });
  });
});

describe("configurazione", () => {
  const fromVector = (c: Record<string, unknown>): StationConfig => {
    const { version: _v, ...rest } = c;
    return rest as unknown as StationConfig;
  };
  const base = fromVector(vectors.config_defaults);

  it("i valori di fabbrica coincidono con config_defaults()", () => {
    expect(configDefaults("10.0.0.1")).toEqual(base);
  });

  for (const vec of vectors.configs) {
    it(`applica il TLV come il firmware: ${vec.name}`, () => {
      const res = applyConfigTlv(base, hex(vec.tlv));
      if (vec.result === "ok") {
        expect(res).toEqual({ ok: true, config: fromVector(vec.config) });
      } else {
        expect(res).toEqual({ ok: false, error: vec.result });
      }
    });
  }

  it("la differenza tra due configurazioni, applicata dal firmware, dà la configurazione voluta", () => {
    for (const vec of vectors.configs.filter((c: { result: string }) => c.result === "ok")) {
      const target = fromVector(vec.config);
      const tlv = encodeConfigDiff(base, target);
      expect(applyConfigTlv(base, tlv)).toEqual({ ok: true, config: target });
    }
  });

  it("nessuna differenza, nessun byte", () => {
    expect(encodeConfigDiff(base, base).length).toBe(0);
  });

  it("rifiuta una configurazione non valida e una che non sta in 64 byte", () => {
    expect(() => encodeConfigDiff(base, { ...base, interval_min: 0 })).toThrow(/intervallo/);
    const all: StationConfig = {
      interval_min: 5,
      send_every: 3,
      wet_sample_s: 30,
      wet_threshold: 1200,
      wet_hyst: 50,
      wet_polarity: 1,
      server_ip: "46.101.7.9",
      server_port: 5684,
      quiet_start_h: 22,
      quiet_end_h: 5,
      alert_frost_dC: 0,
      low_batt_mv: 3200,
      apn: "internet.provider.example",
      bands: [20],
      plmn: 22210,
    };
    expect(() => encodeConfigDiff(base, all)).toThrow(/64/);
  });
});

describe("CoAP lato centralina", () => {
  const token = hex("a1b20101");
  it("riconosce risposta allegata, ACK vuoto, errore e messaggi estranei", () => {
    const resp = Uint8Array.from([0x64, 0x44, 0x01, 0x01, ...token, 0xff, 1, 2, 3]);
    expect(coapParse(resp, 0x0101, token)).toEqual({ kind: "response", code: 0x44, payload: hex("010203") });
    expect(coapParse(Uint8Array.from([0x60, 0, 0x01, 0x01]), 0x0101, token)).toEqual({ kind: "empty-ack" });
    const err = Uint8Array.from([0x64, 0xa3, 0x01, 0x01, ...token]);
    expect(coapParse(err, 0x0101, token)).toEqual({ kind: "error", code: 0xa3 });
    expect(coapParse(resp, 0x0102, token)).toEqual({ kind: "other" });
  });
});
