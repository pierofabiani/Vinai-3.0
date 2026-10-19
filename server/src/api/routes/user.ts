// Rotte per chi usa le centraline: profilo, inviti, la propria azienda, installazione da QR.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { listFleet } from "../../console/fleet.js";
import { acceptInvitation, createInvitation, findInvitation } from "../../orgs/invitations.js";
import type { ApiDeps, AppEnv } from "../context.js";
import { audit, body, requireGlobal, requireOrgRole, requireUser, uuidParam } from "../guards.js";

const MAX_PHOTO = 8 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export function userRoutes(d: ApiDeps) {
  const { sql } = d;
  const r = new Hono<AppEnv>();

  r.get("/me", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ user: null, memberships: [] });
    const memberships = await sql`
      SELECT o.id AS "organizationId", o.name, m.role FROM membership m JOIN organization o ON o.id = m.organization_id
      WHERE m.user_id = ${user.id} AND o.suspended_at IS NULL ORDER BY o.name`;
    const [pk] = await sql<
      { n: number }[]
    >`SELECT count(*)::int AS n FROM passkey WHERE "userId" = ${user.id}`;
    return c.json({ user: { ...user, passkeys: pk?.n ?? 0 }, memberships });
  });

  r.patch("/me", async (c) => {
    const user = requireUser(c);
    const b = await body(c, z.object({ name: z.string().trim().min(1).max(80) }));
    await sql`UPDATE "user" SET name = ${b.name}, "updatedAt" = now() WHERE id = ${user.id}`;
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- inviti
  r.get("/invitations/:token", async (c) => {
    const inv = await findInvitation(sql, c.req.param("token"));
    if (!inv) throw new HTTPException(404, { message: "Invito inesistente" });
    return c.json({
      organizationName: inv.organizationName,
      role: inv.role,
      email: inv.email,
      state: inv.state,
    });
  });

  r.post("/invitations/:token/accept", async (c) => {
    const user = requireUser(c);
    const res = await acceptInvitation(sql, c.req.param("token"), user);
    if (!res.ok) throw new HTTPException(409, { message: res.error });
    return c.json(res);
  });

  // ---------------------------------------------------------------- la mia azienda
  r.get("/orgs/:id", async (c) => {
    const id = uuidParam(c, "id");
    const { role } = await requireOrgRole(sql, c, id);
    const [org] = await sql`SELECT id, name, region, province FROM organization WHERE id = ${id}`;
    const vineyards =
      await sql`SELECT id, name, variety FROM vineyard WHERE organization_id = ${id} ORDER BY name`;
    const members =
      role === "titolare"
        ? await sql`SELECT u.id, u.name, u.email, m.role FROM membership m JOIN "user" u ON u.id = m.user_id
                    WHERE m.organization_id = ${id} ORDER BY m.role, u.name`
        : [];
    const stations = (await listFleet(sql, d.now(), { organizationId: id })).map((s) => ({
      id: s.id,
      label: s.label,
      status: s.status,
      vineyard: s.vineyard,
      lastSeenAt: s.lastSeenAt,
      last: s.last,
    }));
    return c.json({ ...org, role, vineyards, members, stations });
  });

  r.post("/orgs/:id/invitations", async (c) => {
    const id = uuidParam(c, "id");
    const { user } = await requireOrgRole(sql, c, id, "titolare");
    // il titolare invita collaboratori; un altro titolare lo nomina l'amministratore
    const b = await body(
      c,
      z.object({ email: z.string().trim().email(), role: z.enum(["agronomo", "collaboratore", "ospite"]) }),
    );
    const inv = await createInvitation(sql, d.mailer, d.appUrl, {
      organizationId: id,
      ...b,
      createdBy: user.id,
    });
    await audit(sql, c, "invito.creato", `organization:${id}`, b);
    return c.json({ id: inv.id, expiresAt: inv.expiresAt }, 201);
  });

  // ---------------------------------------------------------------- installazione da QR
  r.get("/install/:imei", async (c) => {
    requireGlobal(c, "admin", "tecnico");
    const [st] = await sql`
      SELECT s.id, s.imei::text, s.label, s.status, s.organization_id AS "organizationId", s.vineyard_id AS "vineyardId",
             s.installed_at AS "installedAt", s.last_seen_at AS "lastSeenAt"
      FROM station s WHERE s.imei::text = ${c.req.param("imei")}`;
    if (!st) throw new HTTPException(404, { message: "Nessuna centralina con questo codice" });
    const orgs = await sql`
      SELECT o.id, o.name, coalesce(json_agg(json_build_object('id', v.id, 'name', v.name) ORDER BY v.name)
                                     FILTER (WHERE v.id IS NOT NULL), '[]') AS vineyards
      FROM organization o LEFT JOIN vineyard v ON v.organization_id = o.id
      WHERE o.suspended_at IS NULL GROUP BY o.id ORDER BY o.name`;
    return c.json({ station: st, organizations: orgs });
  });

  r.post("/install/:imei", async (c) => {
    const user = requireGlobal(c, "admin", "tecnico");
    const form = await c.req.parseBody();
    const vineyardId = String(form.vineyardId ?? "");
    const lat = Number(form.lat);
    const lon = Number(form.lon);
    const note = typeof form.note === "string" ? form.note.trim().slice(0, 500) : null;
    if (!/^[0-9a-f-]{36}$/i.test(vineyardId)) throw new HTTPException(400, { message: "Scegli il vigneto" });
    if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) || (lat === 0 && lon === 0))
      throw new HTTPException(400, { message: "Posizione GPS mancante o non valida" });
    const [v] = await sql<
      { organization_id: string }[]
    >`SELECT organization_id FROM vineyard WHERE id = ${vineyardId}`;
    if (!v) throw new HTTPException(400, { message: "Vigneto inesistente" });
    const [st] = await sql<
      { id: string }[]
    >`SELECT id FROM station WHERE imei::text = ${c.req.param("imei")}`;
    if (!st) throw new HTTPException(404, { message: "Nessuna centralina con questo codice" });
    const id = Number(st.id);

    let photo: string | null = null;
    const file = form.photo;
    if (file instanceof File && file.size > 0) {
      const ext = PHOTO_TYPES[file.type];
      if (!ext) throw new HTTPException(400, { message: "Foto: JPEG, PNG, WebP o HEIC" });
      if (file.size > MAX_PHOTO)
        throw new HTTPException(413, { message: "Foto troppo grande (massimo 8 MB)" });
      const dir = join(d.uploadDir, "stations");
      await mkdir(dir, { recursive: true });
      photo = `stations/${id}-${Date.now()}.${ext}`;
      await writeFile(join(d.uploadDir, photo), Buffer.from(await file.arrayBuffer()));
    }

    await sql`
      UPDATE station SET organization_id = ${v.organization_id}, vineyard_id = ${vineyardId},
             location = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
             installed_at = now(), installed_by = ${user.id}, install_note = ${note},
             install_photo = coalesce(${photo}, install_photo),
             status = CASE WHEN status IN ('lab', 'pronta') THEN 'installata' ELSE status END
      WHERE id = ${id}`;
    await sql`INSERT INTO lab_event (station_id, kind, user_id, detail)
              VALUES (${id}, 'installata', ${user.id}, ${note})`;
    await audit(sql, c, "centralina.installata", `station:${id}`, { vineyardId, lat, lon });
    return c.json({ ok: true, stationId: id });
  });

  r.get("/stations/:id/photo", async (c) => {
    requireGlobal(c, "admin", "tecnico");
    const [st] = await sql<{ install_photo: string | null }[]>`
      SELECT install_photo FROM station WHERE id = ${Number(c.req.param("id")) || 0}`;
    if (!st?.install_photo) throw new HTTPException(404, { message: "Nessuna foto" });
    const ext = st.install_photo.split(".").pop() ?? "jpg";
    const type = Object.entries(PHOTO_TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    return c.body(await readFile(join(d.uploadDir, st.install_photo)), 200, { "content-type": type });
  });

  return r;
}
