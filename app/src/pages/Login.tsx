import { useNavigate, useSearch } from "@tanstack/react-router";
import { Fingerprint, Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Brand } from "../components/Brand";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { authClient } from "../lib/auth";

export function Login() {
  const { next } = useSearch({ strict: false }) as { next?: string };
  const target = next?.startsWith("/") ? next : "/";
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"mail" | "passkey" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy("mail");
    setError(null);
    const r = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: target });
    setBusy(null);
    if (r.error) setError(r.error.message ?? "Invio non riuscito, riprova");
    else setSent(true);
  }

  async function passkey() {
    setBusy("passkey");
    setError(null);
    const r = await authClient.signIn.passkey();
    setBusy(null);
    if (r?.error) setError("Accesso con passkey non riuscito. Usa il collegamento via email.");
    else navigate({ to: target });
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Brand />
        {sent ? (
          <div className="mt-8" role="status">
            <h1 className="text-xl font-semibold">Controlla la posta</h1>
            <p className="mt-2 text-ink-2">
              Se <strong className="text-ink">{email}</strong> ha accesso a Vinai, riceverai un collegamento
              per entrare. Vale 15 minuti.
            </p>
            <Button variant="ghost" className="mt-6 -ml-3" onClick={() => setSent(false)}>
              Usa un'altra email
            </Button>
          </div>
        ) : (
          <>
            <h1 className="mt-8 text-xl font-semibold">Entra in Vinai</h1>
            <p className="mt-1 text-ink-2">
              Niente password: ti mandiamo un collegamento, oppure usa l'impronta o il volto.
            </p>
            <form onSubmit={sendLink} className="mt-6 grid gap-4">
              <Field label="Email">
                <Input
                  type="email"
                  required
                  autoComplete="username webauthn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@azienda.it"
                />
              </Field>
              <ErrorBox error={error} />
              <Button type="submit" variant="primary" icon={Mail} busy={busy === "mail"}>
                Mandami il collegamento
              </Button>
            </form>
            <div className="my-5 flex items-center gap-3 text-xs text-ink-3">
              <span className="h-px flex-1 bg-line" /> oppure <span className="h-px flex-1 bg-line" />
            </div>
            <Button className="w-full" icon={Fingerprint} busy={busy === "passkey"} onClick={passkey}>
              Entra con passkey
            </Button>
            <p className="mt-6 text-sm text-ink-3">
              Vinai è su invito. Se non hai ricevuto un invito, chiedilo a chi gestisce la tua azienda.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
