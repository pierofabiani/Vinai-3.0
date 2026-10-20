// Flotta nel mondo Verderame: il titolo dice quante centraline controllare, le righe sono ordinate
// per urgenza e cambiano tinta con lo stato senza spostare le colonne; a destra la mappa.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cx,
  Empty,
  ErrorBox,
  Input,
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
const PROBLEMS: FleetStatus[] = ["muta", "sensore_guasto", "batteria_bassa", "in_ritardo"];

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
  const active = rows.filter((r) => r.status !== "dismessa");
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
    return rows
      .filter((r) => (status === "tutte" ? r.status !== "dismessa" : r.status === status))
      .filter((r) => org === "tutte" || (org === "nessuna" ? !r.organization : r.organization?.id === org))
      .filter(
        (r) =>
          !needle ||
          [r.label, r.imei, r.organization?.name, r.vineyard?.name].some((s) =>
            s?.toLowerCase().includes(needle),
          ),
      )
      .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  }, [rows, status, org, q]);
  const problems = active.filter((r) => PROBLEMS.includes(r.status)).length;
  const changed = useChangedStatus(rows);
  const tone = (r: FleetRow) =>
    STATUS[r.status].tone === "neutral" || STATUS[r.status].tone === "ok" ? undefined : STATUS[r.status].tone;

  return (
    <>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-tight">
          {!fleet.data
            ? "Flotta"
            : problems
              ? `${problems} ${problems === 1 ? "centralina" : "centraline"} da controllare`
              : "Tutte le centraline stanno bene"}
        </h1>
        {fleet.data ? (
          <span className="text-ink-3">{active.length} in servizio · aggiornato ogni 30 secondi</span>
        ) : null}
      </header>
      <ErrorBox error={fleet.error} />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtra per stato">
        <Chip active={status === "tutte"} onClick={() => setStatus("tutte")}>
          In servizio <span className="num opacity-75">{active.length}</span>
        </Chip>
        {ORDER.filter((s) => counts.get(s)).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
            <StatusLabel status={s} /> <span className="num opacity-75">{counts.get(s)}</span>
          </Chip>
        ))}
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0">
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
            <>
              {/* sul telefono: un pannello per centralina, tre righe, niente scorrimento orizzontale */}
              <ul className="grid gap-1.5 md:hidden">
                {shown.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => open(r.id)}
                      data-tone={tone(r)}
                      data-changed={changed.has(r.id) || undefined}
                      className="grid w-full gap-1 rounded-lg bg-panel px-3 py-2.5 text-left text-sm transition-colors duration-200 data-[tone=bad]:bg-(--bad-row) data-[tone=warn]:bg-(--warn-row)"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{r.label ?? "Senza nome"}</span>
                        <StatusLabel status={r.status} />
                      </span>
                      <span className="text-ink-2">
                        {r.vineyard?.name ?? r.organization?.name ?? "Non assegnata"} · {ago(r.lastSeenAt)}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-2 num">
                        <Wet24 values={r.wet24} />
                        <span>{num(r.last?.tempC, 1, "°C")}</span>
                        <span>{volts(r.battMv)}</span>
                        <span>{r.rsrpDbm === null ? "—" : `${r.rsrpDbm} dBm`}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <th>Stato</th>
                      <th>Centralina</th>
                      <th>Vigneto</th>
                      <th>Ultimo invio</th>
                      <th>Bagnatura 24 h</th>
                      <th className="text-right!">Temp.</th>
                      <th className="text-right!">UR</th>
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
                        className="cursor-pointer"
                        data-tone={tone(r)}
                        data-changed={changed.has(r.id) || undefined}
                      >
                        <td>
                          <StatusLabel status={r.status} />
                          {r.issues.length > 1 ? (
                            <span className="sr-only">
                              , anche{" "}
                              {r.issues
                                .slice(1)
                                .map((i) => STATUS[i].label.toLowerCase())
                                .join(", ")}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => open(r.id)}
                            className="text-left font-semibold hover:underline"
                          >
                            {r.label ?? "Senza nome"}
                          </button>{" "}
                          <span className="font-mono text-xs text-ink-3">{r.imei.slice(-6)}</span>
                        </td>
                        <td title={r.organization?.name ?? undefined}>
                          {r.vineyard?.name ?? (
                            <span className="text-ink-3">{r.organization?.name ?? "Non assegnata"}</span>
                          )}
                        </td>
                        <td className="text-ink-2 num">{ago(r.lastSeenAt)}</td>
                        <td>
                          <Wet24 values={r.wet24} />
                        </td>
                        <td className="text-right num">{num(r.last?.tempC, 1, "°C")}</td>
                        <td className="text-right num">
                          {r.last && r.last.humPct === null ? "guasto" : num(r.last?.humPct, 0, "%")}
                        </td>
                        <td className="text-right num">{volts(r.battMv)}</td>
                        <td className="text-right num">{r.rsrpDbm === null ? "—" : `${r.rsrpDbm} dBm`}</td>
                        <td className="text-ink-2 num">{fw(r.fwVer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </div>
        <div className="xl:sticky xl:top-4">
          <Suspense fallback={<Skeleton className="h-[460px]" />}>
            <FleetMap rows={shown} onOpen={open} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function Chip({
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
        "inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm transition-colors duration-150",
        active
          ? "bg-accent font-semibold text-accent-ink [&_svg]:text-current [&_span]:text-current"
          : "bg-panel text-ink-2 hover:bg-panel-2",
      )}
    >
      {children}
    </button>
  );
}

/** Ultime 24 ore di foglia bagnata: una barra per ora, alta quanto i minuti bagnati. */
function Wet24({ values }: { values: number[] }) {
  if (!values.length) return <span className="text-ink-3">—</span>;
  const w = 96;
  const step = w / 24;
  const wet = values.filter((v) => v >= 30).length;
  return (
    <svg width={w} height={18} role="img" aria-label={`${wet} ore bagnate nelle ultime 24`}>
      <title>{`${wet} ore bagnate nelle ultime 24`}</title>
      <line x1={0} x2={w} y1={17.5} y2={17.5} stroke="var(--line)" />
      {values.slice(-24).map((v, i) => (
        <rect
          key={`${i}-${v}`}
          x={i * step + 0.5}
          y={17 - (v / 60) * 15}
          width={Math.max(1, step - 1.5)}
          height={(v / 60) * 15}
          rx={1}
          fill="var(--series)"
        />
      ))}
    </svg>
  );
}

/** Centraline il cui stato è cambiato all'ultimo aggiornamento: la riga si accende un istante. */
function useChangedStatus(rows: FleetRow[]): Set<number> {
  const prev = useRef<Map<number, FleetStatus> | null>(null);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  useEffect(() => {
    const before = prev.current;
    const now = new Map(rows.map((r) => [r.id, r.status]));
    prev.current = now;
    if (!before) return;
    const ids = rows.filter((r) => before.has(r.id) && before.get(r.id) !== r.status).map((r) => r.id);
    if (!ids.length) return;
    setChanged(new Set(ids));
    const t = setTimeout(() => setChanged(new Set()), 1700);
    return () => clearTimeout(t);
  }, [rows]);
  return changed;
}
