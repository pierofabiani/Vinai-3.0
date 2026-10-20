// Etichette da stampare e incollare sulla scatola della centralina: il tecnico inquadra il QR in vigna.
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Qr, stationUrl } from "../../components/Qr";
import { Button, PageHeader } from "../../components/ui";
import { api } from "../../lib/api";
import type { FleetRow } from "../../lib/types";

export function Labels() {
  const { ids } = useSearch({ strict: false }) as { ids?: string };
  const wanted = new Set(
    String(ids ?? "")
      .split(",")
      .map(Number)
      .filter(Boolean),
  );
  const fleet = useQuery({ queryKey: ["fleet"], queryFn: () => api<FleetRow[]>("/console/fleet") });
  const rows = (fleet.data ?? []).filter((r) => wanted.has(r.id));

  useEffect(() => {
    if (!fleet.data) return;
    for (const r of rows)
      void api(`/console/stations/${r.id}/lab-events`, { body: { kind: "etichetta" } }).catch(() => {});
    // una sola registrazione per apertura della pagina
  }, [fleet.data]);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Etichette"
          description={`${rows.length} etichette da 50 × 70 mm. Stampa su carta adesiva, al 100%.`}
          actions={
            <Button variant="primary" icon={Printer} onClick={() => window.print()}>
              Stampa
            </Button>
          }
        />
      </div>
      <div className="flex flex-wrap gap-4 print:gap-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex h-[70mm] w-[50mm] flex-col items-center justify-between rounded border border-line bg-white p-[4mm] text-black print:border-black"
          >
            <span className="text-[11pt] font-semibold">Vinai</span>
            <Qr value={stationUrl(r.imei)} size={150} label={`QR di ${r.imei}`} />
            <span className="text-center">
              <span className="block text-[10pt] font-medium">{r.label ?? "Centralina"}</span>
              <span className="block font-mono text-[8pt]">{r.imei}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
