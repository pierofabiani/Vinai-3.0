// Prova dell'api su database vero: accesso, inviti, permessi, laboratorio, installazione da QR,
// fino al primo pacchetto della centralina che la rende attiva nell'app dell'azienda.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeUplink, toStationTime } from "@vinai/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleUplink } from "../ingest/uplink.js";
import { loadEnv } from "../lib/env.js";
import { TEST_MASTER, testSql } from "../test/db.js";
import { createApp } from "./app.js";
import { buildServices } from "./services.js";

const APP = "http://localhost:5173";
const ADMIN = "admin@prova.it";
const sql = testSql();
let app: ReturnType<typeof createApp>;
let close: () => Promise<void>;

beforeAll(async () => {
  const env = loadEnv({
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    STATION_KEY_SECRET: TEST_MASTER.toString("hex"),
    APP_URL: APP,
    BETTER_AUTH_SECRET: "prova-segreto-di-almeno-trentadue-caratteri-0123",
    MAILER: "dev",
    BOOTSTRAP_ADMIN_EMAIL: ADMIN,
    UPLOAD_DIR: await mkdtemp(join(tmpdir(), "vinai-upload-")),
    STATION_SERVER_IP: "10.0.0.1",
  });
  const s = buildServices(env, { sql });
  close = s.close;
  app = createApp(s.deps);
});

afterAll(async () => {
  await close();
  await sql.end();
});

type Init = { method?: string; body?: unknown; cookie?: string; form?: FormData };
async function call(path: string, init: Init = {}) {
  const headers: Record<string, string> = { origin: APP };
  if (init.cookie) headers.cookie = init.cookie;
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await app.request(path, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, res };
}

async function lastMail(to: string) {
  const [m] = await sql<{ link: string | null; subject: string }[]>`
    SELECT link, subject FROM dev_outbox WHERE recipient = ${to} ORDER BY id DESC LIMIT 1`;
  return m ?? null;
}

/** Accesso con il collegamento via email, come farebbe la persona. Ritorna il cookie di sessione. */
async function login(email: string): Promise<string> {
  const before = await lastMail(email);
  const r = await call("/api/auth/sign-in/magic-link", { body: { email, callbackURL: "/" } });
  expect(r.status).toBe(200);
  const mail = await lastMail(email);
  if (!mail?.link || mail.link === before?.link) throw new Error(`nessun collegamento per ${email}`);
  const url = new URL(mail.link);
  const res = await app.request(url.pathname + url.search, { headers: { origin: APP } });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token");
  return cookie;
}

/** IMEI valido (controllo di Luhn) a partire da 14 cifre. */
function imei(prefix14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let dgt = Number(prefix14[13 - i]);
    if (i % 2 === 0) {
      dgt *= 2;
      if (dgt > 9) dgt -= 9;
    }
    sum += dgt;
  }
  return prefix14 + ((10 - (sum % 10)) % 10);
}

let admin = "";
let owner = "";
let tech = "";
let orgId = "";
let vineyardId = "";
const IMEI = imei("86123450000777");
let stationKey = new Uint8Array();
let stationId = 0;

describe("accesso", () => {
  it("risponde alla salute del sistema", async () => {
    const r = await call("/api/health");
    expect(r.status).toBe(200);
    expect(r.json.db.timescaledb).toBeTruthy();
  });

  it("registrazione chiusa: un'email sconosciuta non riceve nulla, e la risposta non lo rivela", async () => {
    const r = await call("/api/auth/sign-in/magic-link", {
      body: { email: "sconosciuto@prova.it", callbackURL: "/" },
    });
    expect(r.status).toBe(200);
    expect(await lastMail("sconosciuto@prova.it")).toBeNull();
  });

  it("il primo amministratore entra con il collegamento e diventa admin", async () => {
    admin = await login(ADMIN);
    const me = await call("/api/me", { cookie: admin });
    expect(me.json.user).toMatchObject({ email: ADMIN, role: "admin" });
  });

  it("senza sessione la console risponde 401", async () => {
    expect((await call("/api/console/fleet")).status).toBe(401);
  });
});

describe("aziende e inviti", () => {
  it("l'amministratore crea l'azienda e invita il titolare", async () => {
    const r = await call("/api/console/organizations", {
      cookie: admin,
      body: { name: "Cantina Prova", region: "Toscana", ownerEmail: "Titolare@Prova.it" },
    });
    expect(r.status).toBe(201);
    orgId = r.json.id;
    const mail = await lastMail("titolare@prova.it");
    expect(mail?.subject).toContain("Cantina Prova");
    const token = mail?.link?.split("/invito/")[1] ?? "";
    const inv = await call(`/api/invitations/${token}`);
    expect(inv.json).toMatchObject({ organizationName: "Cantina Prova", role: "titolare", state: "valido" });
  });

  it("il titolare entra dall'invito e diventa membro dell'azienda", async () => {
    owner = await login("titolare@prova.it");
    const me = await call("/api/me", { cookie: owner });
    expect(me.json.user.role).toBe("user");
    expect(me.json.memberships).toEqual([{ organizationId: orgId, name: "Cantina Prova", role: "titolare" }]);
  });

  it("il titolare non vede la console e non può nominare altri titolari", async () => {
    expect((await call("/api/console/fleet", { cookie: owner })).status).toBe(403);
    const bad = await call(`/api/orgs/${orgId}/invitations`, {
      cookie: owner,
      body: { email: "altro@prova.it", role: "titolare" },
    });
    expect(bad.status).toBe(400);
    const ok = await call(`/api/orgs/${orgId}/invitations`, {
      cookie: owner,
      body: { email: "agronomo@prova.it", role: "agronomo" },
    });
    expect(ok.status).toBe(201);
  });

  it("un utente fuori dall'azienda non la vede", async () => {
    const agr = await login("agronomo@prova.it");
    expect((await call(`/api/orgs/${orgId}`, { cookie: agr })).json.role).toBe("agronomo");
    const r = await call("/api/console/organizations", { cookie: admin, body: { name: "Altra Azienda" } });
    expect((await call(`/api/orgs/${r.json.id}`, { cookie: agr })).status).toBe(403);
  });

  it("l'amministratore aggiunge un vigneto e crea un tecnico", async () => {
    const v = await call(`/api/console/organizations/${orgId}/vineyards`, {
      cookie: admin,
      body: { name: "Vigna Alta", variety: "Sangiovese", plantingYear: 2012 },
    });
    expect(v.status).toBe(201);
    vineyardId = v.json.id;
    const t = await call("/api/console/users", {
      cookie: admin,
      body: { email: "tecnico@prova.it", name: "Tecnico Prova", role: "tecnico" },
    });
    expect(t.status).toBe(201);
    tech = await login("tecnico@prova.it");
    expect((await call("/api/me", { cookie: tech })).json.user.role).toBe("tecnico");
  });
});

describe("laboratorio e installazione", () => {
  it("rifiuta un IMEI sbagliato e crea la centralina con la sua chiave", async () => {
    const bad = await call("/api/console/stations", { cookie: tech, body: { imei: "861234500007770" } });
    expect(bad.status).toBe(400);
    const r = await call("/api/console/stations", { cookie: tech, body: { imei: IMEI, label: "Hive 7" } });
    expect(r.status).toBe(201);
    expect(r.json.provisioning).toMatchObject({ imei: IMEI, server_ip: "10.0.0.1", apn: "iot.1nce.net" });
    expect(r.json.provisioning.key_hex).toMatch(/^[0-9a-f]{32}$/);
    stationKey = Uint8Array.from(Buffer.from(r.json.provisioning.key_hex, "hex"));
    stationId = r.json.id;
    expect((await call("/api/console/stations", { cookie: tech, body: { imei: IMEI } })).status).toBe(409);
  });

  it("il collaudo la rende pronta; solo l'amministratore rigenera la chiave", async () => {
    await call(`/api/console/stations/${stationId}/lab-events`, {
      cookie: tech,
      body: { kind: "programmata" },
    });
    await call(`/api/console/stations/${stationId}/lab-events`, { cookie: tech, body: { kind: "test_ok" } });
    const d = await call(`/api/console/stations/${stationId}`, { cookie: tech });
    expect(d.json.station.lifecycle).toBe("pronta");
    expect(d.json.station.status).toBe("mai_collegata");
    expect(d.json.lab.map((l: { kind: string }) => l.kind)).toEqual([
      "test_ok",
      "programmata",
      "chiave_scaricata",
      "creata",
    ]);
    expect(
      (await call(`/api/console/stations/${stationId}/key`, { cookie: tech, method: "POST" })).status,
    ).toBe(403);
  });

  it("il tecnico inquadra il QR e installa la centralina nel vigneto", async () => {
    const info = await call(`/api/install/${IMEI}`, { cookie: tech });
    expect(info.json.station.label).toBe("Hive 7");
    expect(info.json.organizations.find((o: { id: string }) => o.id === orgId).vineyards).toEqual([
      { id: vineyardId, name: "Vigna Alta" },
    ]);
    expect((await call(`/api/install/${IMEI}`, { cookie: owner })).status).toBe(403);

    const form = new FormData();
    form.set("vineyardId", vineyardId);
    form.set("lat", "43.4691");
    form.set("lon", "11.2405");
    form.set("note", "palo a capofila, lato nord");
    form.set("photo", new File([Uint8Array.from([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" }));
    const r = await call(`/api/install/${IMEI}`, { cookie: tech, form, method: "POST" });
    expect(r.status).toBe(200);
    const d = await call(`/api/console/stations/${stationId}`, { cookie: admin });
    expect(d.json.station).toMatchObject({
      lifecycle: "installata",
      vineyard: { id: vineyardId, name: "Vigna Alta" },
    });
    expect(d.json.station.location.lat).toBeCloseTo(43.4691, 4);
    expect(d.json.install.hasPhoto).toBe(true);
  });

  it("al primo pacchetto la centralina è attiva e compare nell'app dell'azienda", async () => {
    const now = toStationTime(new Date());
    const payload = encodeUplink(
      {
        imei: BigInt(IMEI),
        fw_ver: 0x0300,
        cfg_ver: 0,
        health: {
          batt_mv: 4400,
          rsrp_dbm: -95,
          snr_db: 4,
          csq: 17,
          last_reset: 0,
          reset_count: 0,
          modem_fails: 0,
          lost_records: 0,
          cfg_rejected: 0,
        },
        first_seq: 1,
        records: [
          {
            seq: 1,
            time: now - 30,
            temp_dC: 184,
            hum_dPct: 655,
            press_dhPa: 10121,
            wet_raw: 1720,
            wet_min: 0,
            flags: 0,
          },
        ],
      },
      stationKey,
    );
    const out = await handleUplink(
      { sql, master: TEST_MASTER, now: () => new Date(), log: () => {} },
      payload,
      { address: "10.1.2.3", port: 5683 },
    );
    expect(out.reply.code).toBe("2.04");
    const mine = await call(`/api/orgs/${orgId}`, { cookie: owner });
    expect(mine.json.stations).toHaveLength(1);
    expect(mine.json.stations[0]).toMatchObject({ label: "Hive 7", status: "attiva" });
    expect(mine.json.stations[0].last.tempC).toBeCloseTo(18.4, 3);
    const fleet = await call("/api/console/fleet", { cookie: tech });
    expect(fleet.json.find((s: { id: number }) => s.id === stationId)).toMatchObject({
      lifecycle: "attiva",
      status: "attiva",
    });
  });

  it("solo l'amministratore cambia la configurazione, e il server la valida", async () => {
    expect(
      (await call(`/api/console/stations/${stationId}/config`, { cookie: tech, body: { interval_min: 15 } }))
        .status,
    ).toBe(403);
    const bad = await call(`/api/console/stations/${stationId}/config`, {
      cookie: admin,
      body: { interval_min: 0 },
    });
    expect(bad.status).toBe(400);
    const ok = await call(`/api/console/stations/${stationId}/config`, {
      cookie: admin,
      body: { interval_min: 15 },
    });
    expect(ok.json).toEqual({ version: 1 });
  });
});

describe("utenti e registro", () => {
  it("un utente sospeso perde subito l'accesso", async () => {
    const users = await call("/api/console/users", { cookie: admin });
    const t = users.json.find((u: { email: string }) => u.email === "tecnico@prova.it");
    await call(`/api/console/users/${t.id}`, { cookie: admin, method: "PATCH", body: { banned: true } });
    expect((await call("/api/console/fleet", { cookie: tech })).status).toBe(401);
  });

  it("l'amministratore non può togliersi il ruolo", async () => {
    const me = await call("/api/me", { cookie: admin });
    const r = await call(`/api/console/users/${me.json.user.id}`, {
      cookie: admin,
      method: "PATCH",
      body: { role: "user" },
    });
    expect(r.status).toBe(400);
  });

  it("le azioni finiscono nel registro", async () => {
    const log = await call("/api/console/audit", { cookie: admin });
    const actions = log.json.map((a: { action: string }) => a.action);
    for (const a of [
      "azienda.creata",
      "invito.creato",
      "invito.accettato",
      "centralina.creata",
      "centralina.installata",
      "utente.modificato",
    ]) {
      expect(actions).toContain(a);
    }
  });
});
