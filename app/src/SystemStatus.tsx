// Fase P0: pagina tecnica che verifica la catena web app → api → database.
// Verrà sostituita dalle schermate vere dopo la scelta del design (P3).
import { useQuery } from "@tanstack/react-query";

interface Health {
  ok: boolean;
  db: { postgres: string; timescaledb: string | null; postgis: string | null } | null;
}

async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  return (await res.json()) as Health;
}

export function SystemStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });

  const rows: [string, string][] = [
    ["API", isPending ? "…" : isError ? "non raggiungibile" : "attiva"],
    ["PostgreSQL", data?.db?.postgres ?? "—"],
    ["TimescaleDB", data?.db?.timescaledb ?? "—"],
    ["PostGIS", data?.db?.postgis ?? "—"],
  ];

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Vinai 3.0</h1>
      <p className="mt-1 text-sm opacity-70">Stato del sistema di sviluppo</p>
      <dl className="mt-8 divide-y divide-white/10">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-3">
            <dt className="opacity-70">{label}</dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
