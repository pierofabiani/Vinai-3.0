// Testata dell'area clienti: azienda (con scelta se se ne hanno più d'una), modalità campo, profilo.
// L'amministratore che apre l'area di un cliente lo vede scritto, con il ritorno alla console.
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Eye, SprayCan, User } from "lucide-react";
import type { ReactNode } from "react";
import { CampoToggle } from "../../components/CampoToggle";
import { ACTION, type Action } from "../../lib/agro";
import { isStaff, useMe } from "../../lib/session";

export function ClienteShell({
  orgId,
  orgName,
  children,
}: {
  orgId: string;
  orgName?: string;
  children: ReactNode;
}) {
  const me = useMe();
  const navigate = useNavigate();
  const memberships = me.data?.memberships ?? [];
  const staff = isStaff(me.data);
  const member = memberships.some((m) => m.organizationId === orgId);
  return (
    <div className="min-h-dvh pb-16">
      <header className="bg-shell text-shell-ink">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <span className="text-[17px] font-bold tracking-tight">Vinai</span>
          {memberships.length > 1 ? (
            <select
              aria-label="Azienda"
              value={member ? orgId : ""}
              onChange={(e) => navigate({ to: "/a/$orgId", params: { orgId: e.target.value } })}
              className="h-8 max-w-[60vw] rounded-md bg-shell-ink/10 px-2 text-sm text-shell-ink"
            >
              {!member ? <option value="">{orgName ?? "Azienda"}</option> : null}
              {memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId} className="text-ink">
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-sm opacity-85">{orgName}</span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <CampoToggle />
            <Link
              to="/profilo"
              className="inline-flex items-center gap-1.5 text-sm opacity-90 hover:opacity-100"
            >
              <User className="size-4" aria-hidden />
              <span className="hidden max-w-[16ch] truncate sm:inline">{me.data?.user?.name}</span>
            </Link>
          </div>
        </div>
      </header>
      {staff && !member ? (
        <div className="bg-panel-2 text-sm">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-4 py-2">
            <span>
              Stai vedendo l'area di <strong>{orgName ?? "questa azienda"}</strong> come la vede il cliente.
            </span>
            <Link to="/console" className="font-semibold text-accent underline">
              Torna alla console
            </Link>
          </div>
        </div>
      ) : null}
      <main className="mx-auto max-w-[1240px] px-4">{children}</main>
    </div>
  );
}

const ICON = { tratta: SprayCan, controlla: Eye, ok: Check };
const TONE = { tratta: "text-bad", controlla: "text-warn", ok: "text-ok" };

/** Consiglio con icona ed etichetta: mai il colore da solo. */
export function AdviceLabel({ a, children }: { a: Action; children?: ReactNode }) {
  const I = ICON[a];
  return (
    <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold whitespace-nowrap">
      <I className={`size-[18px] ${TONE[a]}`} aria-hidden />
      {children ?? ACTION[a]}
    </span>
  );
}

export function SourcesNote({
  model,
  sources,
}: {
  model: { note: string };
  sources: { rain: string; forecast: string };
}) {
  return (
    <p className="mt-10 max-w-[80ch] text-[13.5px] text-ink-3">
      Misure dalle centraline. Pioggia {sources.rain}, {sources.forecast}. Rischio malattie: {model.note}{" "}
      Vinai consiglia: la decisione di trattare resta tua.
    </p>
  );
}
