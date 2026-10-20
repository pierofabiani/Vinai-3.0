import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, Plus } from "lucide-react";
import { type ComponentProps, type FormEvent, lazy, Suspense, useMemo, useState } from "react";
import { Qr, stationUrl } from "../../components/Qr";
import {
  Button,
  Empty,
  ErrorBox,
  Facts,
  Field,
  Input,
  PageHeader,
  Panel,
  Section,
  Select,
  Skeleton,
  STATUS,
  StatusLabel,
  Table,
  Tag,
} from "../../components/ui";
import { api } from "../../lib/api";
import { ago, dateTime, fw, num, volts } from "../../lib/format";
import { isAdmin, useMe } from "../../lib/session";
import type { Provisioning, StationConfig, StationDetail } from "../../lib/types";
import { ProvisioningReveal } from "./Lab";

const LazyChart = lazy(() => import("../../components/Chart").then((m) => ({ default: m.Chart })));
function Chart(props: ComponentProps<typeof LazyChart>) {
  return (
    <Suspense fallback={<Skeleton className="h-[220px]" />}>
      <LazyChart {...props} />
    </Suspense>
  );
}

const LAB_LABEL: Record<string, string> = {
  creata: "Registrata",
  chiave_scaricata: "Chiave scaricata",
  chiave_rigenerata: "Chiave rigenerata",
  programmata: "Programmata",
  test_ok: "Collaudo superato",
  test_ko: "Collaudo fallito",
  etichetta: "Etichetta stampata",
  installata: "Installata",
  nota: "Nota",
};

const CFG_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = {
  applicata: "ok",
  da_inviare: "warn",
  rifiutata: "bad",
  superata: "neutral",
};

const RESULT_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = {
  ok: "ok",
  duplicato: "neutral",
  firma: "bad",
  formato: "bad",
  errore: "bad",
  sconosciuta: "warn",
};

const fmtTemp = (v: number | null) => num(v, 1, "°C");
const fmtHum = (v: number | null) => num(v, 0, "%");
const fmtWet = (v: number | null) => (v === null ? "—" : `${Math.round(v)} min`);
const fmtVolt = (v: number | null) => num(v, 2, "V");
const fmtDbm = (v: number | null) => num(v, 0, "dBm");

export function Station() {
  const { id } = useParams({ strict: false }) as { id: string };
  const me = useMe();
  const admin = isAdmin(me.data);
  const d = useQuery({
    queryKey: ["station", id],
    queryFn: () => api<StationDetail>(`/console/stations/${id}`),
    refetchInterval: 30_000,
  });
  const [newKey, setNewKey] = useState<Provisioning | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<unknown>(null);

  const series = useMemo(() => {
    const h = d.data?.hourly ?? [];
    const hl = d.data?.health ?? [];
    return {
      times: h.map((x) => x.time),
      temp: h.map((x) => x.temp_avg),
      band: { min: h.map((x) => x.temp_min), max: h.map((x) => x.temp_max) },
      hum: h.map((x) => x.hum_avg),
      wet: h.map((x) => x.wet_min),
      hTimes: hl.map((x) => x.time),
      batt: hl.map((x) => x.batt_mv / 1000),
      rsrp: hl.map((x) => x.rsrp_dbm),
    };
  }, [d.data]);

  if (d.isPending) return <Skeleton className="h-96" />;
  if (!d.data) return <ErrorBox error={d.error} />;
  const { station: s, install, config } = d.data;

  const regenerate = async () => {
    if (
      !window.confirm(
        "Rigenerare la chiave? La centralina smetterà di essere riconosciuta finché non la riprogrammi.",
      )
    )
      return;
    setKeyBusy(true);
    try {
      setNewKey(
        (await api<{ provisioning: Provisioning }>(`/console/stations/${s.id}/key`, { method: "POST" }))
          .provisioning,
      );
    } catch (e) {
      setKeyError(e);
    }
    setKeyBusy(false);
  };

  return (
    <>
      <Link
        to="/console/flotta"
        className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Flotta
      </Link>
      <PageHeader
        title={s.label ?? "Centralina senza nome"}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusLabel status={s.status} />
            {s.issues.slice(1).map((i) => (
              <StatusLabel key={i} status={i} />
            ))}
            <span>Ultimo invio {ago(s.lastSeenAt)}</span>
          </span>
        }
        actions={
          admin ? (
            <Button icon={KeyRound} busy={keyBusy} onClick={regenerate}>
              Rigenera chiave
            </Button>
          ) : undefined
        }
      />
      <ErrorBox error={keyError} />
      {newKey ? <ProvisioningReveal p={newKey} onClose={() => setNewKey(null)} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <Facts
          items={[
            [
              "IMEI",
              <span key="i" className="font-mono">
                {s.imei}
              </span>,
            ],
            [
              "Azienda",
              s.organization ? (
                <Link
                  key="o"
                  to="/console/aziende/$id"
                  params={{ id: s.organization.id }}
                  className="underline"
                >
                  {s.organization.name}
                </Link>
              ) : (
                "Non assegnata"
              ),
            ],
            ["Vigneto", s.vineyard?.name ?? "—"],
            [
              "Posizione",
              s.location ? (
                <span key="p" className="num">
                  {s.location.lat.toFixed(5)}, {s.location.lon.toFixed(5)}
                </span>
              ) : (
                "—"
              ),
            ],
            [
              "Installata",
              install.at ? `${dateTime(install.at)}${install.note ? ` · ${install.note}` : ""}` : "—",
            ],
            ["Ciclo di vita", s.lifecycle],
            ["Firmware", fw(s.fwVer)],
            ["Configurazione", `versione ${s.cfgVer}`],
            ["Batteria", volts(s.battMv)],
            ["Segnale", s.rsrpDbm === null ? "—" : `${s.rsrpDbm} dBm`],
          ]}
        />
        <div className="flex gap-4">
          {install.hasPhoto ? (
            <img
              src={`/api/stations/${s.id}/photo`}
              alt="Foto dell'installazione"
              className="h-32 w-32 rounded-lg border border-line-soft object-cover"
            />
          ) : null}
          <Qr value={stationUrl(s.imei)} label={`QR della centralina ${s.imei}`} />
        </div>
      </div>

      <Section title="Ultimi 7 giorni">
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel className="p-4">
            <Chart
              title="Temperatura, media oraria con minimo e massimo"
              unit="°C"
              times={series.times}
              values={series.temp}
              band={series.band}
              format={fmtTemp}
              minSpan={4}
            />
          </Panel>
          <Panel className="p-4">
            <Chart
              title="Umidità relativa, media oraria"
              unit="%"
              times={series.times}
              values={series.hum}
              format={fmtHum}
              minSpan={10}
            />
          </Panel>
          <Panel className="p-4">
            <Chart
              title="Bagnatura fogliare, minuti bagnati per ora"
              unit="min"
              kind="bars"
              times={series.times}
              values={series.wet}
              format={fmtWet}
            />
          </Panel>
          <Panel className="p-4">
            <Chart
              title="Batteria, a ogni invio"
              unit="V"
              times={series.hTimes}
              values={series.batt}
              format={fmtVolt}
              minSpan={0.2}
            />
          </Panel>
          <Panel className="p-4">
            <Chart
              title="Segnale radio RSRP, a ogni invio"
              unit="dBm"
              times={series.hTimes}
              values={series.rsrp}
              format={fmtDbm}
              minSpan={10}
            />
          </Panel>
        </div>
      </Section>

      <Section title="Configurazione remota">
        <ConfigEditor stationId={s.id} config={config} editable={admin} />
        {d.data.configs.length ? (
          <div className="mt-4">
            <Table>
              <thead>
                <tr>
                  <th>Versione</th>
                  <th>Stato</th>
                  <th>Creata</th>
                  <th>Inviata</th>
                  <th>Esito</th>
                </tr>
              </thead>
              <tbody>
                {d.data.configs.map((c) => (
                  <tr key={c.version}>
                    <td className="num">{c.version}</td>
                    <td>
                      <Tag tone={CFG_TONE[c.status] ?? "neutral"}>{c.status.replace("_", " ")}</Tag>
                    </td>
                    <td className="text-ink-2">
                      {dateTime(c.created_at)} · {c.created_by ?? "—"}
                    </td>
                    <td className="text-ink-2">{dateTime(c.sent_at)}</td>
                    <td className="text-ink-2">
                      {c.applied_at
                        ? `applicata ${dateTime(c.applied_at)}`
                        : c.rejected_at
                          ? `rifiutata ${dateTime(c.rejected_at)}: non verrà più inviata`
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : null}
      </Section>

      <div className="grid gap-x-8 xl:grid-cols-2">
        <Section title="Pacchetti ricevuti">
          {d.data.packets.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Ricevuto</th>
                  <th>Esito</th>
                  <th className="text-right!">Byte</th>
                  <th>Da</th>
                </tr>
              </thead>
              <tbody>
                {d.data.packets.map((p) => (
                  <tr key={p.received_at}>
                    <td className="whitespace-nowrap text-ink-2">{dateTime(p.received_at)}</td>
                    <td>
                      <Tag tone={RESULT_TONE[p.result] ?? "neutral"}>{p.result}</Tag>
                    </td>
                    <td className="text-right num">{p.bytes}</td>
                    <td className="font-mono text-xs text-ink-3">{p.src_addr ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Empty title="Nessun pacchetto">La centralina non ha ancora parlato con il server.</Empty>
          )}
        </Section>
        <Section title="Registro di laboratorio">
          <LabLog stationId={s.id} events={d.data.lab} />
        </Section>
      </div>
      <p className="mt-8 text-xs text-ink-3">
        {STATUS.muta.label}: nessun invio da più di 3 ore. In ritardo: oltre due invii mancati.
      </p>
    </>
  );
}

function ConfigEditor({
  stationId,
  config,
  editable,
}: {
  stationId: number;
  config: StationConfig;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const fields: {
    key: keyof StationConfig;
    label: string;
    hint: string;
    read: (c: StationConfig) => string;
    write: (v: string) => unknown;
  }[] = [
    {
      key: "interval_min",
      label: "Intervallo di misura",
      hint: "minuti, 1-60",
      read: (c) => String(c.interval_min),
      write: Number,
    },
    {
      key: "send_every",
      label: "Misure per invio",
      hint: "1-30; 6 × 10 min = un invio all'ora",
      read: (c) => String(c.send_every),
      write: Number,
    },
    {
      key: "wet_threshold",
      label: "Soglia bagnatura",
      hint: "valore grezzo 0-4095",
      read: (c) => String(c.wet_threshold),
      write: Number,
    },
    {
      key: "wet_hyst",
      label: "Isteresi bagnatura",
      hint: "0-1000",
      read: (c) => String(c.wet_hyst),
      write: Number,
    },
    {
      key: "alert_frost_dC",
      label: "Allarme gelo",
      hint: "°C: sotto questa soglia invio immediato",
      read: (c) => String(c.alert_frost_dC / 10),
      write: (v) => Math.round(Number(v.replace(",", ".")) * 10),
    },
    {
      key: "low_batt_mv",
      label: "Batteria bassa",
      hint: "mV, 2000-5000",
      read: (c) => String(c.low_batt_mv),
      write: Number,
    },
    { key: "apn", label: "APN", hint: "cambia solo con la SIM", read: (c) => c.apn, write: (v) => v.trim() },
    {
      key: "bands",
      label: "Bande NB-IoT",
      hint: "separate da virgola, es. 8, 20",
      read: (c) => c.bands.join(", "),
      write: (v) =>
        v
          .split(",")
          .map((x) => Number(x.trim()))
          .filter(Boolean),
    },
  ];

  const changes = Object.fromEntries(
    fields
      .filter((f) => draft[f.key] !== undefined && draft[f.key] !== f.read(config))
      .map((f) => [f.key, f.write(draft[f.key] ?? "")]),
  );
  const dirty = Object.keys(changes).length > 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ version: number }>(`/console/stations/${stationId}/config`, { body: changes });
      setSaved(r.version);
      setDraft({});
      await qc.invalidateQueries({ queryKey: ["station", String(stationId)] });
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <Input
              value={draft[f.key] ?? f.read(config)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              disabled={!editable}
              className="num"
            />
          </Field>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {editable ? (
          <>
            <Button type="submit" variant="primary" busy={busy} disabled={!dirty}>
              Invia alla centralina
            </Button>
            {dirty ? (
              <Button variant="ghost" onClick={() => setDraft({})}>
                Annulla
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-3">Solo l'amministratore modifica la configurazione.</p>
        )}
        {saved !== null ? (
          <p className="text-sm text-ink-2" role="status">
            Versione {saved} pronta: arriva alla centralina con il prossimo invio.
          </p>
        ) : null}
      </div>
      <div className="mt-3">
        <ErrorBox error={error} />
      </div>
    </form>
  );
}

function LabLog({ stationId, events }: { stationId: number; events: StationDetail["lab"] }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState("nota");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/console/stations/${stationId}/lab-events`, { body: { kind, detail: detail || undefined } });
      setDetail("");
      await qc.invalidateQueries({ queryKey: ["station", String(stationId)] });
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };

  return (
    <>
      <form onSubmit={add} className="mb-3 flex flex-wrap items-end gap-2">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Tipo di evento"
          className="w-44"
        >
          <option value="programmata">Programmata</option>
          <option value="test_ok">Collaudo superato</option>
          <option value="test_ko">Collaudo fallito</option>
          <option value="etichetta">Etichetta stampata</option>
          <option value="nota">Nota</option>
        </Select>
        <Input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Dettagli (facoltativi)"
          aria-label="Dettagli"
          className="min-w-40 flex-1"
        />
        <Button type="submit" icon={Plus} busy={busy}>
          Aggiungi
        </Button>
      </form>
      <ErrorBox error={error} />
      <ol className="grid gap-2 text-sm">
        {events.map((ev) => (
          <li key={`${ev.time}-${ev.kind}`} className="flex flex-wrap gap-x-3 border-b border-line-soft pb-2">
            <span className="w-32 shrink-0 text-ink-3 num">{dateTime(ev.time)}</span>
            <span className="font-medium">{LAB_LABEL[ev.kind] ?? ev.kind}</span>
            <span className="text-ink-2">{[ev.detail, ev.user_name].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
