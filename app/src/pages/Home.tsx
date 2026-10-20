// Ingresso dell'area clienti: con una sola azienda si va dritti al suo "Oggi"; con più aziende
// (per esempio un agronomo) si sceglie; tecnici e amministratori vanno alla console.
import { Link, Navigate } from "@tanstack/react-router";
import { ChevronRight, User } from "lucide-react";
import { CampoToggle } from "../components/CampoToggle";
import { Empty, Skeleton } from "../components/ui";
import { isStaff, useMe } from "../lib/session";

export function Home() {
  const me = useMe();
  if (me.isPending) return <Skeleton className="m-6 h-40" />;
  if (me.data && isStaff(me.data)) return <Navigate to="/console" />;
  const ms = me.data?.memberships ?? [];
  if (ms.length === 1 && ms[0]) return <Navigate to="/a/$orgId" params={{ orgId: ms[0].organizationId }} />;
  return (
    <div>
      <header className="bg-shell text-shell-ink">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-[17px] font-bold tracking-tight">Vinai</span>
          <div className="flex items-center gap-3">
            <CampoToggle />
            <Link to="/profilo" className="flex items-center gap-1.5 text-sm opacity-90 hover:opacity-100">
              <User className="size-4" aria-hidden />
              <span className="hidden sm:inline">{me.data?.user?.name}</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-7">
        {ms.length === 0 ? (
          <Empty title="Non fai ancora parte di un'azienda">
            Quando qualcuno ti invita, l'azienda compare qui.
          </Empty>
        ) : (
          <>
            <h1 className="mb-4 text-[1.75rem] font-bold tracking-tight">Le tue aziende</h1>
            <ul className="grid gap-2">
              {ms.map((m) => (
                <li key={m.organizationId}>
                  <Link
                    to="/a/$orgId"
                    params={{ orgId: m.organizationId }}
                    className="flex items-center justify-between gap-3 rounded-xl bg-panel px-4 py-3.5 hover:bg-panel-2"
                  >
                    <span>
                      <span className="block text-[17px] font-bold">{m.name}</span>
                      <span className="text-sm text-ink-3">sei {m.role}</span>
                    </span>
                    <ChevronRight className="size-5 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
