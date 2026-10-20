// Area clienti: "Oggi" dell'azienda, scheda del vigneto, trattamenti e osservazioni di campo.
// Permessi: tutti i membri vedono; titolare, agronomo e collaboratore registrano; l'ospite solo legge;
// le osservazioni le valida l'agronomo (o il titolare, o l'amministratore).
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { PRODUCTS } from "../../agro/model.js";
import { orgToday, vineyardDetail } from "../../agro/view.js";
import type { ApiDeps, AppEnv } from "../context.js";
import { audit, body, requireOrgRole, requireUser, uuidParam } from "../guards.js";

const DISEASES = ["peronospora", "oidio", "botrite", "black_rot", "altro"] as const;

export function agroRoutes(d: ApiDeps) {
  const { sql } = d;
  const r = new Hono<AppEnv>();

  const vineyardOrg = async (id: string) => {
    const [v] = await sql<
      { organization_id: string }[]
    >`SELECT organization_id FROM vineyard WHERE id = ${id}`;
    if (!v) throw new HTTPException(404, { message: "Vigneto inesistente" });
    return v.organization_id;
  };

  r.get("/products", (c) => {
    requireUser(c);
    return c.json(PRODUCTS);
  });

  r.get("/orgs/:id/today", async (c) => {
    const id = uuidParam(c, "id");
    const { role } = await requireOrgRole(sql, c, id);
    const [org] = await sql<{ name: string; region: string | null; province: string | null }[]>`
      SELECT name, region, province FROM organization WHERE id = ${id}`;
    if (!org) throw new HTTPException(404, { message: "Azienda inesistente" });
    return c.json({
      organization: { id, ...org },
      role,
      ...(await orgToday(sql, d.forecast, id, d.now().getTime())),
    });
  });

  r.get("/vineyards/:id", async (c) => {
    const id = uuidParam(c, "id");
    const orgId = await vineyardOrg(id);
    const { role } = await requireOrgRole(sql, c, orgId);
    const detail = await vineyardDetail(sql, d.forecast, id, d.now().getTime());
    if (!detail) throw new HTTPException(404, { message: "Vigneto inesistente" });
    return c.json({ role, ...detail });
  });

  r.post("/vineyards/:id/treatments", async (c) => {
    const id = uuidParam(c, "id");
    const orgId = await vineyardOrg(id);
    const { user } = await requireOrgRole(sql, c, orgId, "titolare", "agronomo", "collaboratore");
    const b = await body(
      c,
      z.object({
        appliedAt: z.string().datetime({ offset: true }),
        product: z.string().trim().min(1).max(80),
        target: z.enum(DISEASES),
        coverDays: z.number().positive().max(30),
        dose: z.string().trim().max(60).optional(),
        note: z.string().trim().max(500).optional(),
      }),
    );
    const at = new Date(b.appliedAt);
    if (at.getTime() > d.now().getTime() + 3_600_000)
      throw new HTTPException(400, { message: "Il trattamento non può essere nel futuro" });
    const [t] = await sql<{ id: string }[]>`
      INSERT INTO treatment (vineyard_id, applied_at, product, target, cover_days, dose, note, created_by)
      VALUES (${id}, ${at}, ${b.product}, ${b.target}, ${b.coverDays}, ${b.dose ?? null}, ${b.note ?? null}, ${user.id})
      RETURNING id`;
    await audit(sql, c, "trattamento.registrato", `vineyard:${id}`, {
      product: b.product,
      appliedAt: b.appliedAt,
    });
    return c.json({ id: t?.id }, 201);
  });

  r.delete("/treatments/:id", async (c) => {
    const id = uuidParam(c, "id");
    const [t] = await sql<{ organization_id: string }[]>`
      SELECT v.organization_id FROM treatment t JOIN vineyard v ON v.id = t.vineyard_id WHERE t.id = ${id}`;
    if (!t) throw new HTTPException(404, { message: "Trattamento inesistente" });
    await requireOrgRole(sql, c, t.organization_id, "titolare", "agronomo");
    await sql`DELETE FROM treatment WHERE id = ${id}`;
    await audit(sql, c, "trattamento.cancellato", `treatment:${id}`);
    return c.json({ ok: true });
  });

  r.post("/vineyards/:id/observations", async (c) => {
    const id = uuidParam(c, "id");
    const orgId = await vineyardOrg(id);
    const { user } = await requireOrgRole(sql, c, orgId, "titolare", "agronomo", "collaboratore");
    const b = await body(
      c,
      z.object({
        observedAt: z.string().datetime({ offset: true }),
        disease: z.enum([...DISEASES, "nessuna"]),
        severity: z.number().int().min(0).max(3),
        phenology: z.string().trim().max(40).optional(),
        note: z.string().trim().max(500).optional(),
      }),
    );
    const [o] = await sql<{ id: string }[]>`
      INSERT INTO observation (vineyard_id, observed_at, disease, severity, phenology, note, created_by)
      VALUES (${id}, ${new Date(b.observedAt)}, ${b.disease}, ${b.severity}, ${b.phenology ?? null}, ${b.note ?? null}, ${user.id})
      RETURNING id`;
    await audit(sql, c, "osservazione.registrata", `vineyard:${id}`, {
      disease: b.disease,
      severity: b.severity,
    });
    return c.json({ id: o?.id }, 201);
  });

  r.post("/observations/:id/validate", async (c) => {
    const id = uuidParam(c, "id");
    const [o] = await sql<{ organization_id: string }[]>`
      SELECT v.organization_id FROM observation o JOIN vineyard v ON v.id = o.vineyard_id WHERE o.id = ${id}`;
    if (!o) throw new HTTPException(404, { message: "Osservazione inesistente" });
    const { user } = await requireOrgRole(sql, c, o.organization_id, "agronomo", "titolare");
    await sql`UPDATE observation SET validated_by = ${user.id}, validated_at = now() WHERE id = ${id}`;
    await audit(sql, c, "osservazione.validata", `observation:${id}`);
    return c.json({ ok: true });
  });

  return r;
}
