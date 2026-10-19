import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  cx,
  Empty,
  ErrorBox,
  Input,
  PageHeader,
  Select,
  Skeleton,
  SkeletonRows,
  STATUS,
  StatusLabel,
  Table,
} from "../../components/ui";
import { api } from "../../lib/api";
import { ago, fw, num, volts } from "../../lib/format";
import type { FleetRow, FleetStatus } from "../../lib/types";

// la mappa (MapLibre) è pesante: si carica solo qui
const FleetMap = lazy(() => import("../../components/FleetMap").then((m) => ({ default: m.FleetMap })));

const ORDER: FleetStatus[] = [
  "muta",
  "sensore_guasto",
  "batteria_bassa",
  "in_ritardo",
  "mai_collegata",
  "attiva",
  "dismessa",
];

export function Fleet() {
  const navigate = useNavigate();
  const fleet = useQuery({
    queryKey: ["fleet"],
    queryFn: () => api<FleetRow[]>("/console/fleet"),
    refetchInterval: 30_000,
  });
  const [status, setStatus] = useState<FleetStatus | "tutte">("tutte");
  const [org, setOrg] = useState("tutte");
  const [q, setQ] = useState("");
  const open = useCallback(
    (id: number) => navigate({ to: "/console/centraline/$id", params: { id: String(id) } }),
    [navigate],
  );

  const rows = fleet.data ?? [];
  const counts = useMemo(() => {
    const c = new Map<FleetStatus, number>();
    for (const r of rows) c.set(r.status, (c.get(r.status) ?? 0) + 1);
    return c;
  }, [rows]);
  const orgs = useMemo(
    () => [
      ...new Map(
        rows.filter((r) => r.organization).map((r) => [r.organization?.id, r.organization?.name]),
      ).entries(),
    ],
    [rows],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (
      rows
        // le dismesse si vedono solo chiedendole
        .filter((r) => (status === "tutte" ? r.status !== "dismessa" : r.status === status))
        .filter((r) => org === "tutte" || (org === "nessuna" ? !r.organization : r.organization?.id === org))
        .filter(
          (r) =>
            !needle ||
            [r.label, r.imei, r.organization?.name, r.vineyard?.name].some((s) =>
              s?.toLowerCase().includes(needle),
            ),
        )
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
    );
  }, [rows, status, org, q]);

  const active = rows.filter((r) => r.status !== "dismessa").length;
  const problems = rows.filter((r) =>
    ["muta", "sensore_guasto", "batteria_bassa", "in_ritardo"].includes(r.status),
  ).length;

  return (
    <>
      <PageHeader
        title="Flotta"
        description={
          fleet.data
            ? problems
              ? `${active} centraline in servizio, ${problems} da controllare.`
              : `${active} centraline in servizio, nessun problema.`
            : "Stato di tutte le centraline, aggiornato ogni 30 secondi."
        }
      />
      <ErrorBox error={fleet.error} />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtra per stato">
        <FilterChip active={status === "tutte"} onClick={() => setStatus("tutte")}>
          In servizio <span className="text-ink-3 num">{active}</span>
        </FilterChip>
        {ORDER.filter((s) => counts.get(s)).map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            <StatusLabel status={s} /> <span className="text-ink-3 num">{counts.get(s)}</span>
          </FilterChip>
        ))}
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <Select
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            aria-label="Azienda"
            className="sm:w-48"
          >
            <option value="tutte">Tutte le aziende</option>
            <option value="nessuna">Non assegnate</option>
            {orgs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca nome, IMEI, vigneto"
            aria-label="Cerca"
            className="sm:w-56"
          />
        </div>
      </div>
      <Suspense fallback={<Skeleton className="h-[340px]" />}>
        <FleetMap rows={shown} onOpen={open} />
      </Suspense>
      <div className="mt-6">
        {fleet.isPending ? (
          <SkeletonRows />
        ) : shown.length === 0 ? (
          <Empty
            title={rows.length ? "Nessuna centralina con questi filtri" : "Nessuna centralina registrata"}
          >
            {rows.length
              ? "Togli un filtro per vederne di più."
              : "Le centraline nuove si registrano dal Laboratorio."}
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Centralina</th>
                <th>Azienda e vigneto</th>
                <th>Stato</th>
                <th>Ultimo invio</th>
                <th className="text-right!">Temp.</th>
                <th className="text-right!">Umidità</th>
                <th className="text-right!">Bagnatura</th>
                <th className="text-right!">Batteria</th>
                <th className="text-right!">Segnale</th>
                <th>FW</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => open(r.id)}
                  className="cursor-pointer transition-colors duration-100 hover:bg-panel-2"
                >
                  <td>
                    <button
                      type="button"
                      onClick={() => open(r.id)}
                      className="text-left font-medium hover:underline"
                    >
                      {r.label ?? "Senza nome"}
                    </button>
                    <span className="block font-mono text-xs text-ink-3">{r.imei}</span>
                  </td>
                  <td>
                    {r.organization?.name ?? <span className="text-ink-3">Non assegnata</span>}
                    {r.vineyard ? <span className="block text-xs text-ink-3">{r.vineyard.name}</span> : null}
                  </td>
                  <td>
                    <StatusLabel status={r.status} />
                    {r.issues.length > 1 ? (
                      <span className="block text-xs text-ink-3">
                        +{" "}
                        {r.issues
                          .slice(1)
                          .map((i) => STATUS[i].label.toLowerCase())
                          .join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{ago(r.lastSeenAt)}</td>
                  <td className="text-right num">{num(r.last?.tempC, 1, "°C")}</td>
                  <td className="text-right num">{num(r.last?.humPct, 0, "%")}</td>
                  <td className="text-right num">{r.last ? `${r.last.wetMin} min` : "—"}</td>
                  <td className="text-right num">{volts(r.battMv)}</td>
                  <td className="text-right num">{r.rsrpDbm === null ? "—" : `${r.rsrpDbm} dBm`}</td>
                  <td className="num text-ink-2">{fw(r.fwVer)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors duration-150",
        active ? "border-ink-3 bg-panel-2 text-ink" : "border-line-soft text-ink-2 hover:border-line",
      )}
    >
      {children}
    </button>
  );
}
