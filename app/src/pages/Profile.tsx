import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint, LogOut, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Empty, ErrorBox, Field, Input, PageHeader, Section, Table } from "../components/ui";
import { api } from "../lib/api";
import { authClient } from "../lib/auth";
import { dateTime } from "../lib/format";
import { useMe, useSignOut } from "../lib/session";

export function Profile() {
  const me = useMe();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const keys = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const r = await authClient.passkey.listUserPasskeys();
      if (r.error) throw new Error(r.error.message);
      return r.data ?? [];
    },
  });
  const user = me.data?.user;
  if (!user) return null;

  const saveName = async () => {
    setBusy("name");
    try {
      await api("/me", { method: "PATCH", body: { name: name ?? user.name } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      setName(null);
    } catch (e) {
      setError(e);
    }
    setBusy(null);
  };

  const addPasskey = async () => {
    setBusy("passkey");
    setError(null);
    const r = await authClient.passkey.addPasskey({
      name: navigator.userAgent.includes("Mobile") ? "Telefono" : "Computer",
    });
    if (r?.error)
      setError(new Error("Passkey non registrata. Il dispositivo deve avere impronta, volto o PIN."));
    await keys.refetch();
    await qc.invalidateQueries({ queryKey: ["me"] });
    setBusy(null);
  };

  const remove = async (id: string) => {
    await authClient.passkey.deletePasskey({ id });
    await keys.refetch();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader
        title="Profilo"
        description={user.email}
        actions={
          <Button icon={LogOut} onClick={signOut}>
            Esci
          </Button>
        }
      />
      <ErrorBox error={error} />
      <Section title="Nome">
        <div className="flex items-end gap-2">
          <Field label="Come ti vedono gli altri">
            <Input value={name ?? user.name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button onClick={saveName} busy={busy === "name"} disabled={name === null || name.trim() === ""}>
            Salva
          </Button>
        </div>
      </Section>
      <Section
        title="Passkey"
        actions={
          <Button variant="primary" icon={Fingerprint} busy={busy === "passkey"} onClick={addPasskey}>
            Aggiungi questo dispositivo
          </Button>
        }
      >
        <p className="mb-3 text-sm text-ink-2">
          Con una passkey entri con l'impronta o il volto, senza aspettare l'email.
        </p>
        {keys.data?.length ? (
          <Table>
            <thead>
              <tr>
                <th>Dispositivo</th>
                <th>Aggiunta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.id}>
                  <td>{k.name ?? "Passkey"}</td>
                  <td className="num text-ink-2">
                    {dateTime(k.createdAt ? new Date(k.createdAt).toISOString() : null)}
                  </td>
                  <td className="text-right">
                    <Button
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => remove(k.id)}
                      aria-label="Rimuovi passkey"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty title="Nessuna passkey">Aggiungine una su ogni telefono o computer che usi.</Empty>
        )}
      </Section>
    </div>
  );
}
