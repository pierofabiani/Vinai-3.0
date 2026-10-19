import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useState } from "react";
import { Brand } from "../components/Brand";
import { Button, ErrorBox, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { authClient } from "../lib/auth";
import { useMe } from "../lib/session";

interface InvitationInfo {
  organizationName: string;
  role: string;
  email: string;
  state: "valido" | "scaduto" | "accettato" | "revocato";
}

export function Invite() {
  const { token } = useParams({ strict: false }) as { token: string };
  const inv = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<InvitationInfo>(`/invitations/${token}`),
    retry: false,
  });
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/invitations/${token}/accept`, { method: "POST" });
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate({ to: "/" });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!inv.data) return;
    setBusy(true);
    const r = await authClient.signIn.magicLink({ email: inv.data.email, callbackURL: `/invito/${token}` });
    setBusy(false);
    if (r.error) setError(new Error(r.error.message ?? "Invio non riuscito"));
    else setSent(true);
  };

  const user = me.data?.user;
  const i = inv.data;
  // entrati dal collegamento dell'invito: l'invito si è già accettato al primo accesso
  if (i?.state === "accettato" && user?.email === i.email) return <Navigate to="/" />;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Brand />
        {inv.isPending ? (
          <Skeleton className="mt-8 h-32" />
        ) : !i ? (
          <p className="mt-8 text-ink-2">
            Questo invito non esiste. Controlla di aver aperto il collegamento completo.
          </p>
        ) : (
          <div className="mt-8">
            <h1 className="text-xl font-semibold text-balance">Invito in {i.organizationName}</h1>
            <p className="mt-2 text-ink-2">
              Ruolo: <strong className="text-ink">{i.role}</strong> · per{" "}
              <strong className="text-ink">{i.email}</strong>
            </p>
            {i.state !== "valido" ? (
              <p className="mt-6 text-ink-2">
                L'invito è {i.state}.{" "}
                {i.state === "accettato" ? (
                  <Link to="/accesso" search={{ next: undefined }} className="text-accent underline">
                    Entra in Vinai
                  </Link>
                ) : (
                  "Chiedine uno nuovo a chi ti ha invitato."
                )}
              </p>
            ) : user && user.email === i.email ? (
              <Button variant="primary" className="mt-6" busy={busy} onClick={accept}>
                Accetta e entra
              </Button>
            ) : user ? (
              <p className="mt-6 text-ink-2">
                Sei entrato come {user.email}. Per accettare esci ed entra con {i.email}.
              </p>
            ) : sent ? (
              <p className="mt-6 text-ink-2" role="status">
                Ti abbiamo mandato un collegamento a {i.email}: aprilo da questo dispositivo per completare
                l'accesso.
              </p>
            ) : (
              <Button variant="primary" className="mt-6" icon={Mail} busy={busy} onClick={sendLink}>
                Ricevi il collegamento per entrare
              </Button>
            )}
            <div className="mt-4">
              <ErrorBox error={error} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
