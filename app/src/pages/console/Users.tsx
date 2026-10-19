import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  Button,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  SkeletonRows,
  Table,
  Tag,
} from "../../components/ui";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { useMe } from "../../lib/session";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "user" | "tecnico" | "admin";
  banned: boolean;
  created_at: string;
  passkeys: number;
  memberships: { organizationId: string; name: string; role: string }[];
}

const ROLE_LABEL = { user: "Utente", tecnico: "Tecnico", admin: "Amministratore" } as const;

export function Users() {
  const me = useMe();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<UserRow[]>("/console/users") });
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "tecnico" });
  const [busy, setBusy] = useState(false);

  const patch = async (id: string, body: object) => {
    setError(null);
    try {
      await api(`/console/users/${id}`, { method: "PATCH", body });
      await qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      setError(e);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/console/users", { body: form });
      setForm({ name: "", email: "", role: "tecnico" });
      await qc.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title="Utenti"
        description="Chi usa le centraline entra con l'invito della sua azienda. Qui crei tecnici e amministratori e sospendi gli accessi."
      />
      <Panel className="mb-6 p-5">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <Field label="Nome">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-48"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-64"
            />
          </Field>
          <Field label="Ruolo">
            <Select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-44"
            >
              <option value="tecnico">Tecnico</option>
              <option value="admin">Amministratore</option>
            </Select>
          </Field>
          <Button type="submit" variant="primary" icon={Plus} busy={busy}>
            Crea account
          </Button>
        </form>
      </Panel>
      <ErrorBox error={error ?? users.error} />
      {users.isPending ? (
        <SkeletonRows />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>Aziende</th>
              <th>Ruolo</th>
              <th>Passkey</th>
              <th>Dal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className={u.banned ? "opacity-60" : undefined}>
                <td>
                  <span className="block font-medium">{u.name}</span>
                  <span className="text-xs text-ink-3">{u.email}</span>
                </td>
                <td className="text-ink-2">
                  {u.memberships.map((m) => `${m.name} (${m.role})`).join(", ") || "—"}
                </td>
                <td>
                  <Select
                    value={u.role}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    disabled={u.id === me.data?.user?.id}
                    aria-label={`Ruolo di ${u.name}`}
                    className="w-44"
                  >
                    {Object.entries(ROLE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="num">{u.passkeys}</td>
                <td className="whitespace-nowrap text-ink-2">{dateTime(u.created_at)}</td>
                <td className="text-right">
                  {u.id === me.data?.user?.id ? (
                    <Tag>sei tu</Tag>
                  ) : (
                    <Button
                      variant={u.banned ? "secondary" : "danger"}
                      onClick={() => patch(u.id, { banned: !u.banned })}
                    >
                      {u.banned ? "Riattiva" : "Sospendi"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
