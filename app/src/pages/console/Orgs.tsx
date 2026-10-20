import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Panel,
  SkeletonRows,
  Table,
} from "../../components/ui";
import { api } from "../../lib/api";
import { isAdmin, useMe } from "../../lib/session";

interface OrgRow {
  id: string;
  name: string;
  region: string | null;
  province: string | null;
  members: number;
  stations: number;
  vineyards: number;
}

export function Orgs() {
  const me = useMe();
  const qc = useQueryClient();
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => api<OrgRow[]>("/console/organizations") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", vatNumber: "", region: "", province: "", ownerEmail: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
      await api("/console/organizations", { body });
      setDone(
        form.ownerEmail
          ? `${form.name} creata. Invito mandato a ${form.ownerEmail}.`
          : `${form.name} creata.`,
      );
      setForm({ name: "", vatNumber: "", region: "", province: "", ownerEmail: "" });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["orgs"] });
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title="Aziende"
        description="Le aziende agricole che usano Vinai, con i loro vigneti e le persone."
        actions={
          isAdmin(me.data) && !open ? (
            <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
              Nuova azienda
            </Button>
          ) : undefined
        }
      />
      {done ? (
        <p className="mb-4 text-sm text-ink-2" role="status">
          {done}
        </p>
      ) : null}
      {open ? (
        <Panel className="mb-6 p-5">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome dell'azienda">
              <Input required value={form.name} onChange={set("name")} />
            </Field>
            <Field label="Partita IVA">
              <Input value={form.vatNumber} onChange={set("vatNumber")} />
            </Field>
            <Field label="Regione" hint="serve per i bollettini fitosanitari">
              <Input value={form.region} onChange={set("region")} />
            </Field>
            <Field label="Provincia">
              <Input value={form.province} onChange={set("province")} />
            </Field>
            <Field label="Email del titolare" hint="riceverà l'invito; puoi anche invitarlo dopo">
              <Input type="email" value={form.ownerEmail} onChange={set("ownerEmail")} />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" variant="primary" busy={busy}>
                Crea azienda
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
            </div>
            <div className="sm:col-span-2">
              <ErrorBox error={error} />
            </div>
          </form>
        </Panel>
      ) : null}
      <ErrorBox error={orgs.error} />
      {orgs.isPending ? (
        <SkeletonRows rows={3} />
      ) : orgs.data?.length ? (
        <Table>
          <thead>
            <tr>
              <th>Azienda</th>
              <th>Zona</th>
              <th className="text-right!">Vigneti</th>
              <th className="text-right!">Centraline</th>
              <th className="text-right!">Persone</th>
            </tr>
          </thead>
          <tbody>
            {orgs.data.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link
                    to="/console/aziende/$id"
                    params={{ id: o.id }}
                    className="font-medium hover:underline"
                  >
                    {o.name}
                  </Link>
                </td>
                <td className="text-ink-2">{[o.province, o.region].filter(Boolean).join(", ") || "—"}</td>
                <td className="text-right num">{o.vineyards}</td>
                <td className="text-right num">{o.stations}</td>
                <td className="text-right num">{o.members}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty title="Nessuna azienda">
          Crea la prima azienda e invita il titolare: entrerà senza password, con il collegamento nell'email.
        </Empty>
      )}
    </>
  );
}
