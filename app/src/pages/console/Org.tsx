import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  Button,
  Empty,
  ErrorBox,
  Facts,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  Skeleton,
  StatusLabel,
  Table,
} from "../../components/ui";
import { api } from "../../lib/api";
import { ago, dateTime } from "../../lib/format";
import { isAdmin, useMe } from "../../lib/session";
import type { FleetRow, OrgRole } from "../../lib/types";

interface OrgDetail {
  id: string;
  name: string;
  vat_number: string | null;
  region: string | null;
  province: string | null;
  created_at: string;
  members: { id: string; name: string; email: string; role: OrgRole; created_at: string }[];
  invitations: { id: string; email: string; role: OrgRole; created_at: string; expires_at: string }[];
  vineyards: {
    id: string;
    name: string;
    variety: string | null;
    planting_year: number | null;
    stations: number;
  }[];
  stations: FleetRow[];
}

const ROLES: { value: OrgRole; label: string }[] = [
  { value: "titolare", label: "Titolare" },
  { value: "agronomo", label: "Agronomo" },
  { value: "collaboratore", label: "Collaboratore" },
  { value: "ospite", label: "Ospite (sola lettura)" },
];

export function Org() {
  const { id } = useParams({ strict: false }) as { id: string };
  const me = useMe();
  const admin = isAdmin(me.data);
  const qc = useQueryClient();
  const org = useQuery({
    queryKey: ["org-console", id],
    queryFn: () => api<OrgDetail>(`/console/organizations/${id}`),
  });
  const [error, setError] = useState<unknown>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["org-console", id] });
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e);
    }
  };

  if (org.isPending) return <Skeleton className="h-96" />;
  if (!org.data) return <ErrorBox error={org.error} />;
  const o = org.data;

  return (
    <>
      <Link
        to="/console/aziende"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Aziende
      </Link>
      <PageHeader title={o.name} />
      <Facts
        items={[
          ["Zona", [o.province, o.region].filter(Boolean).join(", ") || "—"],
          ["Partita IVA", o.vat_number ?? "—"],
          ["Creata", dateTime(o.created_at)],
        ]}
      />
      <div className="mt-4">
        <ErrorBox error={error} />
      </div>

      <Section title="Persone">
        {o.members.length ? (
          <Table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {o.members.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.name}</td>
                  <td className="text-ink-2">{m.email}</td>
                  <td>
                    {admin ? (
                      <Select
                        value={m.role}
                        aria-label={`Ruolo di ${m.name}`}
                        className="w-52"
                        onChange={(e) =>
                          run(() =>
                            api(`/console/organizations/${id}/members/${m.id}`, {
                              method: "PATCH",
                              body: { role: e.target.value },
                            }),
                          )
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      m.role
                    )}
                  </td>
                  <td className="text-right">
                    {admin ? (
                      <Button
                        variant="ghost"
                        icon={Trash2}
                        aria-label={`Togli ${m.name} dall'azienda`}
                        onClick={() =>
                          window.confirm(`Togliere ${m.name} da ${o.name}?`) &&
                          run(() => api(`/console/organizations/${id}/members/${m.id}`, { method: "DELETE" }))
                        }
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="Ancora nessuno">
            Invita il titolare: poi sarà lui a invitare agronomo e collaboratori.
          </Empty>
        )}
        {o.invitations.length ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-ink-2">Inviti in attesa</h3>
            <ul className="grid gap-1 text-sm">
              {o.invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3">
                  <span>{i.email}</span>
                  <span className="text-ink-3">
                    {i.role} · scade {ago(i.expires_at)}
                  </span>
                  {admin ? (
                    <Button
                      variant="ghost"
                      onClick={() => run(() => api(`/console/invitations/${i.id}`, { method: "DELETE" }))}
                    >
                      Revoca
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {admin ? <InviteForm orgId={id} onDone={refresh} /> : null}
      </Section>

      <Section title="Vigneti">
        {o.vineyards.length ? (
          <Table>
            <thead>
              <tr>
                <th>Vigneto</th>
                <th>Varietà</th>
                <th className="text-right!">Impianto</th>
                <th className="text-right!">Centraline</th>
              </tr>
            </thead>
            <tbody>
              {o.vineyards.map((v) => (
                <tr key={v.id}>
                  <td className="font-medium">{v.name}</td>
                  <td className="text-ink-2">{v.variety ?? "—"}</td>
                  <td className="text-right num">{v.planting_year ?? "—"}</td>
                  <td className="text-right num">{v.stations}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="Nessun vigneto">
            Servono prima di installare le centraline: il tecnico sceglie il vigneto dal QR.
          </Empty>
        )}
        {admin ? <VineyardForm orgId={id} onDone={refresh} /> : null}
      </Section>

      <Section title="Centraline">
        {o.stations.length ? (
          <Table>
            <thead>
              <tr>
                <th>Centralina</th>
                <th>Vigneto</th>
                <th>Stato</th>
                <th>Ultimo invio</th>
              </tr>
            </thead>
            <tbody>
              {o.stations.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      to="/console/centraline/$id"
                      params={{ id: String(s.id) }}
                      className="font-medium hover:underline"
                    >
                      {s.label ?? s.imei}
                    </Link>
                  </td>
                  <td className="text-ink-2">{s.vineyard?.name ?? "—"}</td>
                  <td>
                    <StatusLabel status={s.status} />
                  </td>
                  <td className="text-ink-2">{ago(s.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="Nessuna centralina installata" />
        )}
      </Section>
    </>
  );
}

function InviteForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("titolare");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/console/organizations/${orgId}/invitations`, { body: { email, role } });
      setSent(email);
      setEmail("");
      onDone();
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2">
      <Field label="Invita per email">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-64"
        />
      </Field>
      <Field label="Ruolo">
        <Select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} className="w-52">
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" icon={UserPlus} busy={busy}>
        Invita
      </Button>
      {sent ? (
        <p className="w-full text-sm text-ink-2" role="status">
          Invito mandato a {sent}, valido 7 giorni.
        </p>
      ) : null}
      <div className="w-full">
        <ErrorBox error={error} />
      </div>
    </form>
  );
}

function VineyardForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [v, setV] = useState({ name: "", variety: "", plantingYear: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/console/organizations/${orgId}/vineyards`, {
        body: {
          name: v.name,
          variety: v.variety || undefined,
          plantingYear: v.plantingYear ? Number(v.plantingYear) : undefined,
        },
      });
      setV({ name: "", variety: "", plantingYear: "" });
      onDone();
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2">
      <Field label="Nuovo vigneto">
        <Input
          required
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className="w-56"
          placeholder="es. Vigna Alta"
        />
      </Field>
      <Field label="Varietà">
        <Input value={v.variety} onChange={(e) => setV({ ...v, variety: e.target.value })} className="w-44" />
      </Field>
      <Field label="Anno d'impianto">
        <Input
          inputMode="numeric"
          value={v.plantingYear}
          onChange={(e) => setV({ ...v, plantingYear: e.target.value })}
          className="w-32 num"
        />
      </Field>
      <Button type="submit" icon={Plus} busy={busy}>
        Aggiungi
      </Button>
      <div className="w-full">
        <ErrorBox error={error} />
      </div>
    </form>
  );
}
