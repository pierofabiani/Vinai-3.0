// Laboratorio: registrazione delle schede, chiave da programmare (mostrata una sola volta),
// collaudo, etichette con il QR per l'installazione.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Copy, Download, Printer, ShieldAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Qr, stationUrl } from "../../components/Qr";
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Panel,
  Section,
  SkeletonRows,
  StatusLabel,
  Table,
  Tag,
} from "../../components/ui";
import { api } from "../../lib/api";
import { ago } from "../../lib/format";
import type { FleetRow, Provisioning } from "../../lib/types";

export function Lab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fleet = useQuery({ queryKey: ["fleet"], queryFn: () => api<FleetRow[]>("/console/fleet") });
  const [imei, setImei] = useState("");
  const [label, setLabel] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<Provisioning | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const bench = (fleet.data ?? []).filter((r) => r.lifecycle === "lab" || r.lifecycle === "pronta");

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: number; provisioning: Provisioning }>("/console/stations", {
        body: { imei: imei.replace(/\s/g, ""), label: label || undefined, serverIp: serverIp || undefined },
      });
      setCreated(r.provisioning);
      setImei("");
      setLabel("");
      await qc.invalidateQueries({ queryKey: ["fleet"] });
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  const mark = async (id: number, kind: "programmata" | "test_ok" | "test_ko") => {
    await api(`/console/stations/${id}/lab-events`, { body: { kind } });
    await qc.invalidateQueries({ queryKey: ["fleet"] });
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        title="Laboratorio"
        description="Registra una scheda, scrivi la chiave nella sua memoria, collaudala e stampa l'etichetta con il QR."
      />
      {created ? <ProvisioningReveal p={created} onClose={() => setCreated(null)} /> : null}
      <Panel className="p-5">
        <h2 className="mb-4 font-semibold">Nuova centralina</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-start">
          <Field label="IMEI del modem" hint="15 cifre, sull'etichetta del SIM7020E">
            <Input
              required
              inputMode="numeric"
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              placeholder="869951031234567"
              className="font-mono"
            />
          </Field>
          <Field label="Nome" hint="come la chiamerete, es. Hive 12">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          </Field>
          <Field label="IP del server" hint="vuoto = quello predefinito">
            <Input value={serverIp} onChange={(e) => setServerIp(e.target.value)} className="font-mono" />
          </Field>
          <Button type="submit" variant="primary" busy={busy} className="sm:mt-6.5">
            Registra
          </Button>
        </form>
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      </Panel>

      <Section
        title="Al banco"
        actions={
          <Button
            icon={Printer}
            disabled={selected.size === 0}
            onClick={() => navigate({ to: "/console/etichette", search: { ids: [...selected].join(",") } })}
          >
            Stampa etichette{selected.size ? ` (${selected.size})` : ""}
          </Button>
        }
      >
        {fleet.isPending ? (
          <SkeletonRows rows={3} />
        ) : bench.length === 0 ? (
          <Empty title="Nessuna scheda al banco">
            Le schede registrate restano qui finché non vengono installate.
          </Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="w-8">
                  <span className="sr-only">Seleziona</span>
                </th>
                <th>QR</th>
                <th>Centralina</th>
                <th>Fase</th>
                <th>Contatto col server</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {bench.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Seleziona ${r.label ?? r.imei}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td>
                    <Qr value={stationUrl(r.imei)} size={48} label={`QR di ${r.imei}`} />
                  </td>
                  <td>
                    <Link
                      to="/console/centraline/$id"
                      params={{ id: String(r.id) }}
                      className="font-medium hover:underline"
                    >
                      {r.label ?? "Senza nome"}
                    </Link>
                    <span className="block font-mono text-xs text-ink-3">{r.imei}</span>
                  </td>
                  <td>
                    {r.lifecycle === "pronta" ? <Tag tone="ok">collaudata</Tag> : <Tag>in laboratorio</Tag>}
                  </td>
                  <td>
                    {r.lastSeenAt ? (
                      <span className="text-sm">
                        <StatusLabel status={r.status} />{" "}
                        <span className="text-ink-3">{ago(r.lastSeenAt)}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-ink-3">nessun pacchetto ancora</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="ghost" onClick={() => mark(r.id, "programmata")}>
                        Programmata
                      </Button>
                      <Button variant="ghost" icon={Check} onClick={() => mark(r.id, "test_ok")}>
                        Collaudo ok
                      </Button>
                      <Button variant="ghost" onClick={() => mark(r.id, "test_ko")}>
                        Collaudo ko
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-sm text-ink-3">
          Collaudo superato: la scheda ha inviato almeno un pacchetto al server di prova e le misure sono
          plausibili. Diventa "collaudata", pronta per l'installazione.
        </p>
      </Section>
    </>
  );
}

/** La chiave in chiaro si vede solo qui, subito dopo la registrazione o la rigenerazione. */
export function ProvisioningReveal({ p, onClose }: { p: Provisioning; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const file = JSON.stringify(p, null, 2);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file], { type: "application/json" }));
    a.download = `vinai-${p.imei}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(p.key_hex);
    setCopied(true);
  };
  return (
    <Panel className="mb-6 bg-[color-mix(in_oklch,var(--panel)_84%,var(--warn))] p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Chiave della centralina {p.imei}</h2>
          <p className="mt-1 text-sm text-ink-2">
            Scaricala ora e scrivila nella scheda: non sarà più visibile. Se la perdi, l'amministratore può
            solo rigenerarla, e la scheda va riprogrammata.
          </p>
          <code className="mt-3 block overflow-x-auto rounded border border-line bg-bg px-3 py-2 font-mono text-sm break-all">
            {p.key_hex}
          </code>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" icon={Download} onClick={download}>
              Scarica il file di programmazione
            </Button>
            <Button icon={copied ? Check : Copy} onClick={copy}>
              {copied ? "Copiata" : "Copia la chiave"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Fatto, l'ho salvata
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
