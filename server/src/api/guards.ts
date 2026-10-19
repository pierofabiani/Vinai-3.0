// Controlli di accesso. Ruoli globali: admin, tecnico, user. Ruoli per azienda in membership.
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import type { GlobalRole } from "../auth/auth.js";
import type { Sql } from "../lib/db.js";
import type { OrgRole } from "../orgs/invitations.js";
import type { AppEnv, SessionUser } from "./context.js";

export function requireUser(c: Context<AppEnv>): SessionUser {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "Accesso richiesto" });
  return user;
}

export function requireGlobal(c: Context<AppEnv>, ...roles: GlobalRole[]): SessionUser {
  const user = requireUser(c);
  if (!roles.includes(user.role)) throw new HTTPException(403, { message: "Permesso insufficiente" });
  return user;
}

/** Ruolo dell'utente nell'azienda; gli amministratori vedono tutto come titolari. */
export async function orgRole(sql: Sql, user: SessionUser, orgId: string): Promise<OrgRole | null> {
  if (user.role === "admin") return "titolare";
  const [m] = await sql<{ role: OrgRole }[]>`
    SELECT role FROM membership WHERE organization_id = ${orgId} AND user_id = ${user.id}`;
  return m?.role ?? null;
}

export async function requireOrgRole(sql: Sql, c: Context<AppEnv>, orgId: string, ...roles: OrgRole[]) {
  const user = requireUser(c);
  const role = await orgRole(sql, user, orgId);
  if (!role || (roles.length && !roles.includes(role)))
    throw new HTTPException(403, { message: "Permesso insufficiente per questa azienda" });
  return { user, role };
}

export async function body<T extends z.ZodType>(c: Context<AppEnv>, schema: T): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Corpo della richiesta non valido" });
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "valore"}: ${i.message}`).join("; ");
    throw new HTTPException(400, { message: msg });
  }
  return parsed.data;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidParam(c: Context<AppEnv>, name: string): string {
  const v = c.req.param(name) ?? "";
  if (!UUID.test(v)) throw new HTTPException(404, { message: "Non trovato" });
  return v;
}

export async function audit(
  sql: Sql,
  c: Context<AppEnv>,
  action: string,
  target: string | null,
  detail: Record<string, unknown> = {},
) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await sql`INSERT INTO audit_log (user_id, action, target, detail, ip)
            VALUES (${c.get("user")?.id ?? null}, ${action}, ${target}, ${sql.json(detail as never)}, ${ip})`;
}
