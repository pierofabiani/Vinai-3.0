// Console di gestione: flotta, scheda centralina, laboratorio, aziende, utenti, posta di sviluppo.
// Amministratore: tutto. Tecnico: flotta, laboratorio e installazioni (sola lettura su aziende).
import { randomUUID } from "node:crypto";
import { configDefaults } from "@vinai/protocol";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { listFleet, stationDetail } from "../../console/fleet.js";
import { encryptDeviceKey, newDeviceKey } from "../../lib/keys.js";
import { createInvitation, ORG_ROLES } from "../../orgs/invitations.js";
import { imeiValid } from "../../stations/imei.js";
import { appliedConfig, provisionStation, setDesiredConfig } from "../../stations/repo.js";
import type { ApiDeps, AppEnv } from "../context.js";
import { audit, body, requireGlobal, uuidParam } from "../guards.js";

const LAB_KINDS = ["programmata", "test_ok", "test_ko", "etichetta", "nota"] as const;

function stationId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new HTTPException(404, { message: "Centralina inesistente" });
  return id;
}

/** File da scrivere nella centralina al banco: identità, chiave e server. */
function provisioningFile(imei: string, key: Uint8Array, serverIp: string) {
  const c = configDefaults(serverIp);
  return {
    imei,
    key_hex: Buffer.from(key).toString("hex"),
    server_ip: c.server_ip,
    server_port: c.server_port,
    apn: c.apn,
    bands: c.bands,
  };
}

export function consoleRoutes(d: ApiDeps) {
  const { sql } = d;
  const r = new Hono<AppEnv>();

  // ---------------------------------------------------------------- flotta
  r.get("/fleet", async (c) => {
    requireGlobal(c, "admin", "tecnico");
    const org = c.req.query("organizationId");
    return c.json(await listFleet(sql, d.now(), org ? { organizationId: org } : {}));
  });

  r.get("/stations/:id", async (c) => {
    requireGlobal(c, "admin", "tecnico");
    const detail = await stationDetail(sql, stationId(c.req.param("id")), d.now());
    if (!detail) throw new HTTPException(404, { message: "Centralina inesistente" });
    return c.json(detail);
  });

  // ---------------------------------------------------------------- laboratorio
  r.post("/stations", async (c) => {
    const user = requireGlobal(c, "admin", "tecnico");
    const b = await body(
      c,
      z.object({
        imei: z.string().trim(),
        label: z.string().trim().max(60).optional(),
        serverIp: z.string().trim().optional(),
      }),
    );
    if (!imeiValid(b.imei))
      throw new HTTPException(400, { message: "IMEI non valido: 15 cifre, controllo finale errato" });
    const [exists] = await sql`SELECT 1 FROM station WHERE imei = ${b.imei}`;
    if (exists) throw new HTTPException(409, { message: "Questo IMEI è già registrato" });
    const serverIp = b.serverIp || d.defaultServerIp;
    const p = await provisionStation(sql, d.master, {
      imei: BigInt(b.imei),
      serverIp,
      ...(b.label ? { label: b.label } : {}),
    }).catch((e: Error) => {
      throw new HTTPException(400, { message: e.message });
    });
    // due istruzioni: nella stessa istruzione i due eventi avrebbero lo stesso orario e un ordine incerto
    await sql`INSERT INTO lab_event (station_id, kind, user_id) VALUES (${p.id}, 'creata', ${user.id})`;
    await sql`INSERT INTO lab_event (station_id, kind, user_id) VALUES (${p.id}, 'chiave_scaricata', ${user.id})`;
    await audit(sql, c, "centralina.creata", `station:${p.id}`, { imei: b.imei });
    // la chiave in chiaro esce solo qui: non si potrà più rileggere, solo rigenerare
    return c.json({ id: p.id, provisioning: provisioningFile(b.imei, p.key, serverIp) }, 201);
  });

  r.post("/stations/:id/key", async (c) => {
    const user = requireGlobal(c, "admin");
    const id = stationId(c.req.param("id"));
    const [st] = await sql<{ imei: string; factory_config: { server_ip: string } }[]>`
      SELECT imei::text, factory_config FROM station WHERE id = ${id}`;
    if (!st) throw new HTTPException(404, { message: "Centralina inesistente" });
    const key = newDeviceKey();
    await sql`UPDATE station SET key_enc = ${encryptDeviceKey(d.master, BigInt(st.imei), key)} WHERE id = ${id}`;
    await sql`INSERT INTO lab_event (station_id, kind, user_id, detail)
              VALUES (${id}, 'chiave_rigenerata', ${user.id}, 'la centralina va riprogrammata')`;
    await audit(sql, c, "centralina.chiave_rigenerata", `station:${id}`);
    return c.json({ provisioning: provisioningFile(st.imei, key, st.factory_config.server_ip) });
  });

  r.post("/stations/:id/lab-events", async (c) => {
    const user = requireGlobal(c, "admin", "tecnico");
    const id = stationId(c.req.param("id"));
    const b = await body(
      c,
      z.object({ kind: z.enum(LAB_KINDS), detail: z.string().trim().max(500).optional() }),
    );
    const res = await sql`INSERT INTO lab_event (station_id, kind, user_id, detail)
                          SELECT ${id}, ${b.kind}, ${user.id}, ${b.detail ?? null} WHERE EXISTS (SELECT 1 FROM station WHERE id = ${id})`;
    if (res.count === 0) throw new HTTPException(404, { message: "Centralina inesistente" });
    // una scheda collaudata è pronta per l'installazione
    if (b.kind === "test_ok")
      await sql`UPDATE station SET status = 'pronta' WHERE id = ${id} AND status = 'lab'`;
    return c.json({ ok: true }, 201);
  });

  r.patch("/stations/:id", async (c) => {
    requireGlobal(c, "admin");
    const id = stationId(c.req.param("id"));
    const b = await body(
      c,
      z.object({
        label: z.string().trim().max(60).nullable().optional(),
        status: z.enum(["lab", "pronta", "installata", "attiva", "dismessa"]).optional(),
      }),
    );
    await sql`UPDATE station SET label = coalesce(${b.label ?? null}, label), status = coalesce(${b.status ?? null}, status)
              WHERE id = ${id}`;
    await audit(sql, c, "centralina.modificata", `station:${id}`, b);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- configurazione remota
  r.post("/stations/:id/config", async (c) => {
    const user = requireGlobal(c, "admin");
    const id = stationId(c.req.param("id"));
    const changes = await body(c, z.record(z.string(), z.unknown()));
    const current = (await appliedConfig(sql, id)).params;
    const allowed = Object.keys(configDefaults());
    const unknown = Object.keys(changes).filter((k) => !allowed.includes(k));
    if (unknown.length)
      throw new HTTPException(400, { message: `Parametri sconosciuti: ${unknown.join(", ")}` });
    try {
      const version = await setDesiredConfig(
        sql,
        id,
        { ...current, ...changes } as typeof current,
        user.email,
      );
      await audit(sql, c, "centralina.configurazione", `station:${id}`, { version, changes });
      return c.json({ version });
    } catch (e) {
      throw new HTTPException(400, { message: (e as Error).message });
    }
  });

  // ---------------------------------------------------------------- aziende
  r.get("/organizations", async (c) => {
    requireGlobal(c, "admin", "tecnico");
    return c.json(
      await sql`
        SELECT o.id, o.name, o.region, o.province, o.created_at, o.suspended_at,
               (SELECT count(*)::int FROM membership m WHERE m.organization_id = o.id) AS members,
               (SELECT count(*)::int FROM station s WHERE s.organization_id = o.id) AS stations,
               (SELECT count(*)::int FROM vineyard v WHERE v.organization_id = o.id) AS vineyards
        FROM organization o ORDER BY o.name`,
    );
  });

  r.post("/organizations", async (c) => {
    const user = requireGlobal(c, "admin");
    const b = await body(
      c,
      z.object({
        name: z.string().trim().min(1).max(120),
        vatNumber: z.string().trim().max(20).optional(),
        address: z.string().trim().max(200).optional(),
        region: z.string().trim().max(60).optional(),
        province: z.string().trim().max(60).optional(),
        ownerEmail: z.string().trim().email().optional(),
      }),
    );
    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organization (name, vat_number, address, region, province, created_by)
      VALUES (${b.name}, ${b.vatNumber ?? null}, ${b.address ?? null}, ${b.region ?? null}, ${b.province ?? null}, ${user.id})
      RETURNING id`;
    const orgId = org?.id as string;
    await audit(sql, c, "azienda.creata", `organization:${orgId}`, { name: b.name });
    if (b.ownerEmail) {
      await createInvitation(sql, d.mailer, d.appUrl, {
        organizationId: orgId,
        email: b.ownerEmail,
        role: "titolare",
        createdBy: user.id,
      });
      await audit(sql, c, "invito.creato", `organization:${orgId}`, {
        email: b.ownerEmail,
        role: "titolare",
      });
    }
    return c.json({ id: orgId }, 201);
  });

  r.get("/organizations/:id", async (c) => {
    requireGlobal(c, "admin", "tecnico");
    const id = uuidParam(c, "id");
    const [org] = await sql`SELECT id, name, vat_number, address, region, province, created_at, suspended_at
                            FROM organization WHERE id = ${id}`;
    if (!org) throw new HTTPException(404, { message: "Azienda inesistente" });
    const [members, invitations, vineyards] = await Promise.all([
      sql`SELECT u.id, u.name, u.email, m.role, m.created_at FROM membership m JOIN "user" u ON u.id = m.user_id
          WHERE m.organization_id = ${id} ORDER BY m.role, u.name`,
      sql`SELECT id, email, role, created_at, expires_at FROM invitation
          WHERE organization_id = ${id} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
          ORDER BY created_at DESC`,
      sql`SELECT id, name, variety, planting_year, row_spacing_m, vine_spacing_m,
                 (SELECT count(*)::int FROM station s WHERE s.vineyard_id = v.id) AS stations
          FROM vineyard v WHERE organization_id = ${id} ORDER BY name`,
    ]);
    return c.json({
      ...org,
      members,
      invitations,
      vineyards,
      stations: await listFleet(sql, d.now(), { organizationId: id }),
    });
  });

  r.post("/organizations/:id/invitations", async (c) => {
    const user = requireGlobal(c, "admin");
    const id = uuidParam(c, "id");
    const b = await body(c, z.object({ email: z.string().trim().email(), role: z.enum(ORG_ROLES) }));
    const inv = await createInvitation(sql, d.mailer, d.appUrl, {
      organizationId: id,
      ...b,
      createdBy: user.id,
    }).catch((e: Error) => {
      throw new HTTPException(404, { message: e.message });
    });
    await audit(sql, c, "invito.creato", `organization:${id}`, b);
    return c.json({ id: inv.id, expiresAt: inv.expiresAt }, 201);
  });

  r.delete("/invitations/:id", async (c) => {
    requireGlobal(c, "admin");
    const id = uuidParam(c, "id");
    await sql`UPDATE invitation SET revoked_at = now() WHERE id = ${id} AND accepted_at IS NULL`;
    await audit(sql, c, "invito.revocato", `invitation:${id}`);
    return c.json({ ok: true });
  });

  r.patch("/organizations/:id/members/:userId", async (c) => {
    requireGlobal(c, "admin");
    const id = uuidParam(c, "id");
    const b = await body(c, z.object({ role: z.enum(ORG_ROLES) }));
    await sql`UPDATE membership SET role = ${b.role} WHERE organization_id = ${id} AND user_id = ${c.req.param("userId")}`;
    await audit(sql, c, "membro.ruolo", `organization:${id}`, { user: c.req.param("userId"), role: b.role });
    return c.json({ ok: true });
  });

  r.delete("/organizations/:id/members/:userId", async (c) => {
    requireGlobal(c, "admin");
    const id = uuidParam(c, "id");
    await sql`DELETE FROM membership WHERE organization_id = ${id} AND user_id = ${c.req.param("userId")}`;
    await audit(sql, c, "membro.rimosso", `organization:${id}`, { user: c.req.param("userId") });
    return c.json({ ok: true });
  });

  r.post("/organizations/:id/vineyards", async (c) => {
    requireGlobal(c, "admin");
    const id = uuidParam(c, "id");
    const b = await body(
      c,
      z.object({
        name: z.string().trim().min(1).max(80),
        variety: z.string().trim().max(80).optional(),
        plantingYear: z.number().int().min(1900).max(2100).optional(),
        rowSpacingM: z.number().positive().max(10).optional(),
        vineSpacingM: z.number().positive().max(10).optional(),
      }),
    );
    const [v] = await sql<{ id: string }[]>`
      INSERT INTO vineyard (organization_id, name, variety, planting_year, row_spacing_m, vine_spacing_m)
      VALUES (${id}, ${b.name}, ${b.variety ?? null}, ${b.plantingYear ?? null}, ${b.rowSpacingM ?? null}, ${b.vineSpacingM ?? null})
      RETURNING id`;
    await audit(sql, c, "vigneto.creato", `organization:${id}`, { name: b.name });
    return c.json({ id: v?.id }, 201);
  });

  // ---------------------------------------------------------------- utenti
  r.get("/users", async (c) => {
    requireGlobal(c, "admin");
    return c.json(
      await sql`
        SELECT u.id, u.name, u.email, coalesce(u.role, 'user') AS role, coalesce(u.banned, false) AS banned, u."createdAt" AS created_at,
               (SELECT count(*)::int FROM passkey p WHERE p."userId" = u.id) AS passkeys,
               coalesce((SELECT json_agg(json_build_object('organizationId', o.id, 'name', o.name, 'role', m.role) ORDER BY o.name)
                         FROM membership m JOIN organization o ON o.id = m.organization_id WHERE m.user_id = u.id), '[]') AS memberships
        FROM "user" u ORDER BY u."createdAt" DESC`,
    );
  });

  // Tecnici e amministratori non appartengono a un'azienda: l'account lo crea l'amministratore.
  r.post("/users", async (c) => {
    requireGlobal(c, "admin");
    const b = await body(
      c,
      z.object({
        email: z.string().trim().email(),
        name: z.string().trim().min(1).max(80),
        role: z.enum(["tecnico", "admin"]),
      }),
    );
    const email = b.email.toLowerCase();
    const [exists] = await sql`SELECT 1 FROM "user" WHERE email = ${email}`;
    if (exists) throw new HTTPException(409, { message: "Esiste già un utente con questa email" });
    const id = randomUUID();
    await sql`INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
              VALUES (${id}, ${b.name}, ${email}, false, ${b.role}, now(), now())`;
    await d.mailer.send({
      to: email,
      subject: "Il tuo account Vinai",
      text: `Ciao ${b.name}, ti è stato creato un account Vinai come ${b.role}.\n\nPer entrare apri ${d.appUrl}/accesso e inserisci questa email: riceverai un collegamento.`,
      link: `${d.appUrl}/accesso`,
    });
    await audit(sql, c, "utente.creato", `user:${id}`, { email, role: b.role });
    return c.json({ id }, 201);
  });

  r.patch("/users/:id", async (c) => {
    const me = requireGlobal(c, "admin");
    const b = await body(
      c,
      z.object({ role: z.enum(["user", "tecnico", "admin"]).optional(), banned: z.boolean().optional() }),
    );
    if (c.req.param("id") === me.id && ((b.role !== undefined && b.role !== "admin") || b.banned))
      throw new HTTPException(400, { message: "Non puoi togliere a te stesso il ruolo di amministratore" });
    await sql`UPDATE "user" SET role = coalesce(${b.role ?? null}, role), banned = coalesce(${b.banned ?? null}, banned)
              WHERE id = ${c.req.param("id")}`;
    if (b.banned) await sql`DELETE FROM session WHERE "userId" = ${c.req.param("id")}`;
    await audit(sql, c, "utente.modificato", `user:${c.req.param("id")}`, b);
    return c.json({ ok: true });
  });

  r.get("/audit", async (c) => {
    requireGlobal(c, "admin");
    return c.json(
      await sql`SELECT a.time, a.action, a.target, a.detail, u.email FROM audit_log a
                LEFT JOIN "user" u ON u.id = a.user_id ORDER BY a.time DESC LIMIT 200`,
    );
  });

  // ---------------------------------------------------------------- posta di sviluppo
  r.get("/dev/outbox", async (c) => {
    requireGlobal(c, "admin");
    if (d.mailerKind !== "dev") throw new HTTPException(404, { message: "Posta di sviluppo non attiva" });
    return c.json(
      await sql`SELECT id, created_at, recipient, subject, body, link FROM dev_outbox ORDER BY id DESC LIMIT 50`,
    );
  });

  return r;
}
