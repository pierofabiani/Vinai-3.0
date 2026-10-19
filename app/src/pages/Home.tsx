// Pagina iniziale provvisoria per chi usa le centraline: elenco delle proprie centraline.
// La schermata vera ("Oggi": devo trattare, e dove?) arriva in P4, dopo il design.
import { useQueries } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { User } from "lucide-react";
import { Brand } from "../components/Brand";
import { Empty, Panel, SkeletonRows, StatusLabel } from "../components/ui";
import { api } from "../lib/api";
import { ago, num } from "../lib/format";
import { isStaff, useMe } from "../lib/session";
import type { FleetStatus } from "../lib/types";

interface OrgView {
  id: string;
  name: string;
  role: string;
  stations: {
    id: number;
    label: string | null;
    status: FleetStatus;
    vineyard: { name: string } | null;
    lastSeenAt: string | null;
    last: { tempC: number | null; humPct: number | null; wetMin: number } | null;
  }[];
}

export function Home() {
  const me = useMe();
  const orgs = useQueries({
    queries: (me.data?.memberships ?? []).map((m) => ({
      queryKey: ["org", m.organizationId],
      queryFn: () => api<OrgView>(`/orgs/${m.organizationId}`),
      refetchInterval: 60_000,
    })),
  });
  if (me.data && isStaff(me.data)) return <Navigate to="/console" />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-8 flex items-center justify-between">
        <Brand />
        <Link to="/profilo" className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <User className="size-4" aria-hidden /> {me.data?.user?.name}
        </Link>
      </header>
      {me.data?.memberships.length === 0 ? (
        <Empty title="Non fai ancora parte di un'azienda">
          Quando qualcuno ti invita, l'azienda compare qui.
        </Empty>
      ) : null}
      {orgs.map((q, i) => {
        const m = me.data?.memberships[i];
        return (
          <section key={m?.organizationId} className="mb-10">
            <h1 className="text-xl font-semibold">{m?.name}</h1>
            <p className="mb-4 text-sm text-ink-3">Sei {m?.role}</p>
            {q.isPending ? (
              <SkeletonRows rows={2} />
            ) : q.data?.stations.length ? (
              <div className="grid gap-3">
                {q.data.stations.map((s) => (
                  <Panel key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">{s.label ?? `Centralina ${s.id}`}</p>
                      <p className="text-sm text-ink-3">
                        {s.vineyard?.name ?? "Vigneto non indicato"} · aggiornata {ago(s.lastSeenAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-5 text-sm num">
                      <span>{num(s.last?.tempC, 1, "°C")}</span>
                      <span>{num(s.last?.humPct, 0, "%")}</span>
                      <span title="minuti di foglia bagnata nell'ultimo intervallo">
                        {s.last ? `${s.last.wetMin} min bagnati` : "—"}
                      </span>
                      <StatusLabel status={s.status} />
                    </div>
                  </Panel>
                ))}
              </div>
            ) : (
              <Empty title="Nessuna centralina installata">
                Compariranno qui appena il tecnico le installa nei vostri vigneti.
              </Empty>
            )}
          </section>
        );
      })}
    </div>
  );
}
