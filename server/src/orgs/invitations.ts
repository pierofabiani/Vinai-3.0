// Inviti alle aziende. Il collegamento contiene un token casuale; nel database c'è solo la sua impronta.
// Registrazione chiusa: un'email senza account entra solo con un invito valido (nota 0009).
import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "../lib/db.js";
import type { Mailer } from "../mail/mailer.js";

export const ORG_ROLES = ["titolare", "agronomo", "collaboratore", "ospite"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  titolare: "titolare",
  agronomo: "agronomo",
  collaboratore: "collaboratore",
  ospite: "ospite (sola lettura)",
};

const INVITE_DAYS = 7;
const hashToken = (token: string) => createHash("sha256").update(token).digest();

export interface InvitationInput {
  organizationId: string;
  email: string;
  role: OrgRole;
  createdBy: string;
}

export async function createInvitation(sql: Sql, mailer: Mailer, appUrl: string, input: InvitationInput) {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(24).toString("base64url");
  const [org] = await sql<
    { name: string }[]
  >`SELECT name FROM organization WHERE id = ${input.organizationId}`;
  if (!org) throw new Error("azienda inesistente");
  // un nuovo invito alla stessa persona per la stessa azienda sostituisce quello vecchio
  await sql`UPDATE invitation SET revoked_at = now()
            WHERE organization_id = ${input.organizationId} AND email = ${email}
              AND accepted_at IS NULL AND revoked_at IS NULL`;
  const [inv] = await sql<{ id: string; expires_at: Date }[]>`
    INSERT INTO invitation (organization_id, email, role, token_hash, expires_at, created_by)
    VALUES (${input.organizationId}, ${email}, ${input.role}, ${hashToken(token)},
            now() + make_interval(days => ${INVITE_DAYS}), ${input.createdBy})
    RETURNING id, expires_at`;
  const link = `${appUrl}/invito/${token}`;
  await mailer.send({
    to: email,
    subject: `Invito a ${org.name} su Vinai`,
    text:
      `Sei stato invitato in ${org.name} su Vinai come ${ORG_ROLE_LABEL[input.role]}.\n\n` +
      `Per accettare apri questo collegamento entro ${INVITE_DAYS} giorni:\n\n${link}\n\n` +
      "Non serve una password: entrerai con un collegamento via email o con l'impronta del telefono.",
    link,
  });
  return { id: inv?.id as string, token, expiresAt: inv?.expires_at as Date };
}

export interface InvitationView {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  role: OrgRole;
  state: "valido" | "scaduto" | "accettato" | "revocato";
}

export async function findInvitation(sql: Sql, token: string): Promise<InvitationView | null> {
  const [r] = await sql<
    {
      id: string;
      organization_id: string;
      name: string;
      email: string;
      role: OrgRole;
      expires_at: Date;
      accepted_at: Date | null;
      revoked_at: Date | null;
    }[]
  >`
    SELECT i.id, i.organization_id, o.name, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at
    FROM invitation i JOIN organization o ON o.id = i.organization_id
    WHERE i.token_hash = ${hashToken(token)}`;
  if (!r) return null;
  const state = r.accepted_at
    ? "accettato"
    : r.revoked_at
      ? "revocato"
      : r.expires_at.getTime() < Date.now()
        ? "scaduto"
        : "valido";
  return {
    id: r.id,
    organizationId: r.organization_id,
    organizationName: r.name,
    email: r.email,
    role: r.role,
    state,
  };
}

/** Accetta l'invito per l'utente indicato. L'email dell'utente deve essere quella invitata. */
export async function acceptInvitation(sql: Sql, token: string, user: { id: string; email: string }) {
  const inv = await findInvitation(sql, token);
  if (!inv) return { ok: false as const, error: "Invito inesistente" };
  if (inv.state !== "valido") return { ok: false as const, error: `Invito ${inv.state}` };
  if (inv.email !== user.email.toLowerCase())
    return { ok: false as const, error: `Questo invito è per ${inv.email}: entra con quell'indirizzo` };
  await acceptRow(sql, inv.id, inv.organizationId, inv.role, user.id);
  return { ok: true as const, organizationId: inv.organizationId };
}

async function acceptRow(sql: Sql, id: string, orgId: string, role: OrgRole, userId: string) {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO membership (organization_id, user_id, role) VALUES (${orgId}, ${userId}, ${role})
             ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`;
    await tx`UPDATE invitation SET accepted_at = now(), accepted_by = ${userId} WHERE id = ${id}`;
    // nel registro sia quando si accetta dalla pagina dell'invito, sia al primo accesso
    await tx`INSERT INTO audit_log (user_id, action, target, detail)
             VALUES (${userId}, 'invito.accettato', ${`organization:${orgId}`}, ${tx.json({ role } as never)})`;
  });
}

/** Al primo accesso si accettano da soli gli inviti validi per quell'email. */
export async function acceptOpenInvitations(sql: Sql, user: { id: string; email: string }) {
  const open = await sql<{ id: string; organization_id: string; role: OrgRole }[]>`
    SELECT id, organization_id, role FROM invitation
    WHERE email = ${user.email.toLowerCase()} AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`;
  for (const i of open) await acceptRow(sql, i.id, i.organization_id, i.role, user.id);
  return open.length;
}

export async function hasOpenInvitation(sql: Sql, email: string) {
  const [r] = await sql`
    SELECT 1 FROM invitation WHERE email = ${email.toLowerCase()}
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() LIMIT 1`;
  return Boolean(r);
}

export async function userExists(sql: Sql, email: string) {
  const [r] =
    await sql`SELECT 1 FROM "user" WHERE email = ${email.toLowerCase()} AND coalesce(banned, false) = false`;
  return Boolean(r);
}
