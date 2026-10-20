// Scheda del vigneto: la protezione per intero, il perché del rischio, 7 giorni misurati e 3 previsti,
// trattamenti e osservazioni di campo (registrabili dal telefono), centraline.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Legend, ProtectionLine } from "../../components/ProtectionLine";
import { TimeChart } from "../../components/TimeChart";
import { Button, ErrorBox, Field, Input, Select, Skeleton, StatusLabel } from "../../components/ui";
import {
  DISEASE,
  type Disease,
  daysAgo,
  fmtDay,
  fmtNum,
  fmtWhen,
  fmtWindow,
  SEVERITY,
  type VineyardDetail,
} from "../../lib/agro";
import { api } from "../../lib/api";
import { ago } from "../../lib/format";
import type { FleetStatus } from "../../lib/types";
import { AdviceLabel, ClienteShell, SourcesNote } from "./Shell";

const METER = { alto: "var(--bad)", medio: "var(--warn)", basso: "var(--ok)" } as const;

export function Vigneto() {
  const { orgId, id } = useParams({ strict: false }) as { orgId: string; id: string };
  const q = useQuery({ queryKey: ["vigneto", id], queryFn: () => api<VineyardDetail>(`/vineyards/${id}`) });
  const d = q.data;
  return (
    <ClienteShell orgId={orgId} orgName={d?.organizationName ?? undefined}>
      <Link
        to="/a/$orgId"
        params={{ orgId }}
        className="mt-5 inline-flex items-center gap-1.5 text-[15px] text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Oggi
      </Link>
      {q.isPending ? (
        <Skeleton className="mt-4 h-96" />
      ) : !d ? (
        <div className="mt-4">
          <ErrorBox error={q.error} />
        </div>
      ) : (
        <Detail d={d} />
      )}
    </ClienteShell>
  );
}

function Detail({ d }: { d: VineyardDetail }) {
  const v = d.vineyard;
  const now = new Date(d.generatedAt).getTime();
  const p = v.protection;
  const canWrite = d.role !== "ospite";
  const canValidate = d.role === "agronomo" || d.role === "titolare";
  return (
    <>
      <h1 className="mt-3 text-[2rem] leading-tight font-bold tracking-tight">{v.name}</h1>
      <p className="text-ink-3">
        {[v.variety, v.plantingYear ? `impianto ${v.plantingYear}` : null].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-3 max-w-[70ch] text-[19px] font-semibold">
        <AdviceLabel a={v.advice.action} />
        {v.advice.action === "tratta" ? " " : ""}
        {v.advice.action === "tratta"
          ? `per ${DISEASE[v.advice.disease]?.toLowerCase()}${v.window ? `, meglio ${fmtWindow(v.window)}` : ""}.`
          : v.advice.action === "controlla"
            ? `: ${DISEASE[v.advice.disease]?.toLowerCase()} da tenere d'occhio.`
            : ": coperto e senza condizioni da infezione."}
      </p>
      {!v.hasData ? (
        <p className="mt-2 text-ink-2">
          Questo vigneto non ha ancora una centralina: il rischio viene solo dalla previsione.
        </p>
      ) : null}

      <section className="mt-5 rounded-xl bg-panel p-4">
        <h2 className="mb-2 text-[15px] font-bold">
          {p ? `${p.product}, ${fmtDay(p.date)} (${daysAgo(p.date, now)})` : "Protezione"}
        </h2>
        {p ? <Legend /> : null}
        <ProtectionLine v={v} now={now} full />
        {p ? (
          <p className="mt-2.5 text-ink-2">
            Copertura di circa {fmtNum(p.coverDays)} giorni contro{" "}
            {DISEASE[p.target]?.toLowerCase() ?? p.target}.{" "}
            {p.rainSinceMm > 0
              ? `Da allora ${fmtNum(p.rainSinceMm)} mm di pioggia ne hanno lavati via ${fmtNum((p.rainSinceMm / 10) * 2, 1)} giorni.`
              : "Da allora non è piovuto."}{" "}
            {p.remainingDays <= 0
              ? "La protezione è finita."
              : p.exhaustedOn
                ? `Con i ${fmtNum(p.rainNextMm)} mm previsti finisce ${fmtWhen(p.exhaustedOn)}.`
                : "Regge anche con la pioggia prevista."}
          </p>
        ) : null}
      </section>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          {v.past.length || v.forecast.length ? (
            <TimeChart
              title={
                v.hasData
                  ? "Al vigneto, 7 giorni e 3 di previsione (media delle centraline)"
                  : "Previsione dei prossimi 3 giorni"
              }
              hours={[...v.past, ...v.forecast]}
              nowIndex={Math.max(0, v.past.length - 1)}
              rows={[
                {
                  key: "t",
                  label: "Temperatura",
                  unit: "°C",
                  kind: "line",
                  color: "--c-temp",
                  value: (h) => h.temp,
                  digits: 1,
                  minSpan: 6,
                },
                {
                  key: "w",
                  label: "Foglia bagnata",
                  unit: "min/ora",
                  kind: "bars",
                  color: "--c-wet",
                  value: (h) => h.wet,
                  height: 48,
                },
                {
                  key: "r",
                  label: "Pioggia",
                  unit: "mm",
                  kind: "bars",
                  color: "--c-rain",
                  value: (h) => h.rain,
                  digits: 1,
                  height: 40,
                },
              ]}
            />
          ) : null}
          <Treatments d={d} canWrite={canWrite} now={now} />
          <Observations d={d} canWrite={canWrite} canValidate={canValidate} />
        </div>
        <aside className="grid gap-3.5 lg:sticky lg:top-4">
          <div className="rounded-xl bg-panel p-4">
            <h2 className="text-[15px] font-bold">Perché</h2>
            {(Object.keys(v.risk) as Disease[])
              .sort((a, b) => v.risk[b].index - v.risk[a].index)
              .map((k) => (
                <div
                  key={k}
                  className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-line-soft py-3 first-of-type:mt-2"
                >
                  <div>
                    <b>{DISEASE[k]}</b>
                    <div className="text-sm text-ink-2">rischio {v.risk[k].level}</div>
                    <div
                      className="mt-1.5 h-2 overflow-hidden rounded bg-line-soft"
                      role="img"
                      aria-label={`indice ${v.risk[k].index} su 100`}
                    >
                      <span
                        className="block h-full rounded"
                        style={{
                          width: `${Math.max(3, v.risk[k].index)}%`,
                          background: METER[v.risk[k].level],
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[14.5px] text-ink-2">{v.risk[k].why}</p>
                </div>
              ))}
          </div>
          <div className="rounded-xl bg-panel p-4">
            <h2 className="text-[15px] font-bold">Centraline</h2>
            {d.stations.length ? (
              d.stations.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 text-[15px] first-of-type:mt-2"
                >
                  <span>
                    <b>{s.label ?? `Centralina ${s.id}`}</b>{" "}
                    <span className="text-sm text-ink-3">{ago(s.lastSeenAt)}</span>
                  </span>
                  <StatusLabel status={s.status as FleetStatus} />
                </div>
              ))
            ) : (
              <p className="mt-1 text-ink-3">Nessuna centralina installata in questo vigneto.</p>
            )}
          </div>
        </aside>
      </div>
      <SourcesNote model={d.model} sources={d.sources} />
    </>
  );
}

function Treatments({ d, canWrite, now }: { d: VineyardDetail; canWrite: boolean; now: number }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const canDelete = d.role === "titolare" || d.role === "agronomo";
  const remove = async (id: string) => {
    if (!window.confirm("Cancellare questo trattamento?")) return;
    await api(`/treatments/${id}`, { method: "DELETE" });
    await qc.invalidateQueries();
  };
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Trattamenti</h2>
        {canWrite && !open ? (
          <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
            Registra trattamento
          </Button>
        ) : null}
      </div>
      {open ? <TreatmentForm vineyardId={d.vineyard.id} onDone={() => setOpen(false)} /> : null}
      {d.treatments.length ? (
        <ul className="grid gap-1.5">
          {d.treatments.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-2.5 text-[15px]"
            >
              <span>
                <b>{t.product}</b> · {fmtDay(t.applied_at)} ({daysAgo(t.applied_at, now)}) · contro{" "}
                {DISEASE[t.target]?.toLowerCase() ?? t.target} · {fmtNum(t.cover_days)} giorni
                {t.note ? <span className="block text-sm text-ink-3">{t.note}</span> : null}
              </span>
              {canDelete ? (
                <Button
                  variant="ghost"
                  icon={Trash2}
                  aria-label={`Cancella ${t.product} del ${fmtDay(t.applied_at)}`}
                  onClick={() => remove(t.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3">Nessun trattamento registrato: senza, la protezione non si può stimare.</p>
      )}
    </section>
  );
}

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function TreatmentForm({ vineyardId, onDone }: { vineyardId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ name: string; target: string; coverDays: number }[]>("/products"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [f, setF] = useState({
    product: "",
    custom: "",
    target: "peronospora",
    coverDays: "8",
    when: localNow(),
    dose: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const choose = (name: string) => {
    const p = products.data?.find((x) => x.name === name);
    setF((s) => ({
      ...s,
      product: name,
      ...(p ? { target: p.target, coverDays: String(p.coverDays) } : {}),
    }));
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/vineyards/${vineyardId}/treatments`, {
        body: {
          appliedAt: new Date(f.when).toISOString(),
          product: f.product === "altro" ? f.custom : f.product,
          target: f.target,
          coverDays: Number(f.coverDays.replace(",", ".")),
          dose: f.dose || undefined,
          note: f.note || undefined,
        },
      });
      await qc.invalidateQueries();
      onDone();
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mb-4 grid gap-4 rounded-xl bg-panel p-4 sm:grid-cols-2">
      <Field label="Prodotto">
        <Select required value={f.product} onChange={(e) => choose(e.target.value)} className="h-12">
          <option value="" disabled>
            Scegli il prodotto
          </option>
          {products.data?.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
          <option value="altro">Altro…</option>
        </Select>
      </Field>
      {f.product === "altro" ? (
        <Field label="Nome del prodotto">
          <Input
            required
            value={f.custom}
            onChange={(e) => setF({ ...f, custom: e.target.value })}
            className="h-12"
          />
        </Field>
      ) : null}
      <Field label="Contro">
        <Select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className="h-12">
          {["peronospora", "oidio", "botrite", "black_rot", "altro"].map((k) => (
            <option key={k} value={k}>
              {DISEASE[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Quando">
        <Input
          type="datetime-local"
          required
          value={f.when}
          max={localNow()}
          onChange={(e) => setF({ ...f, when: e.target.value })}
          className="h-12"
        />
      </Field>
      <Field label="Copertura (giorni)" hint="dall'etichetta del prodotto; la pioggia la riduce">
        <Input
          inputMode="decimal"
          required
          value={f.coverDays}
          onChange={(e) => setF({ ...f, coverDays: e.target.value })}
          className="h-12 num"
        />
      </Field>
      <Field label="Dose (facoltativa)">
        <Input
          value={f.dose}
          onChange={(e) => setF({ ...f, dose: e.target.value })}
          placeholder="es. 2 kg/ha"
          className="h-12"
        />
      </Field>
      <Field label="Nota (facoltativa)">
        <Input
          value={f.note}
          maxLength={500}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          className="h-12"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" busy={busy} className="h-11">
          Salva trattamento
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Annulla
        </Button>
        <div className="w-full">
          <ErrorBox error={error} />
        </div>
      </div>
    </form>
  );
}

const PHENOLOGY = [
  "germogliamento",
  "foglie distese",
  "prefioritura",
  "fioritura",
  "allegagione",
  "chiusura grappolo",
  "invaiatura",
  "maturazione",
];

function Observations({
  d,
  canWrite,
  canValidate,
}: {
  d: VineyardDetail;
  canWrite: boolean;
  canValidate: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ disease: "peronospora", severity: 1, phenology: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/vineyards/${d.vineyard.id}/observations`, {
        body: {
          observedAt: new Date().toISOString(),
          disease: f.disease,
          severity: f.disease === "nessuna" ? 0 : f.severity,
          phenology: f.phenology || undefined,
          note: f.note || undefined,
        },
      });
      await qc.invalidateQueries({ queryKey: ["vigneto", d.vineyard.id] });
      setOpen(false);
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };
  const validate = async (id: string) => {
    await api(`/observations/${id}/validate`, { method: "POST" });
    await qc.invalidateQueries({ queryKey: ["vigneto", d.vineyard.id] });
  };
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Osservazioni in campo</h2>
        {canWrite && !open ? (
          <Button icon={Plus} onClick={() => setOpen(true)}>
            Segnala
          </Button>
        ) : null}
      </div>
      <p className="mb-3 max-w-[70ch] text-sm text-ink-3">
        Quello che vedi in vigna, confermato dall'agronomo, è il dato che rende i modelli più precisi negli
        anni.
      </p>
      {open ? (
        <form onSubmit={submit} className="mb-4 grid gap-4 rounded-xl bg-panel p-4 sm:grid-cols-2">
          <Field label="Cosa hai visto">
            <Select
              value={f.disease}
              onChange={(e) => setF({ ...f, disease: e.target.value })}
              className="h-12"
            >
              {["peronospora", "oidio", "botrite", "black_rot", "altro", "nessuna"].map((k) => (
                <option key={k} value={k}>
                  {DISEASE[k]}
                </option>
              ))}
            </Select>
          </Field>
          {f.disease !== "nessuna" ? (
            <fieldset className="grid gap-1.5 text-sm">
              <legend className="mb-1.5 font-medium text-ink-2">Quanto</legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((k) => (
                  <label
                    key={k}
                    className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-panel-2 px-4 has-[:checked]:bg-accent has-[:checked]:text-accent-ink"
                  >
                    <input
                      type="radio"
                      name="sev"
                      className="sr-only"
                      checked={f.severity === k}
                      onChange={() => setF({ ...f, severity: k })}
                    />
                    {SEVERITY[k]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <Field label="Fase della vite (facoltativa)">
            <Select
              value={f.phenology}
              onChange={(e) => setF({ ...f, phenology: e.target.value })}
              className="h-12"
            >
              <option value="">Non indicata</option>
              {PHENOLOGY.map((ph) => (
                <option key={ph} value={ph}>
                  {ph}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nota (facoltativa)">
            <Input
              value={f.note}
              maxLength={500}
              onChange={(e) => setF({ ...f, note: e.target.value })}
              className="h-12"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="submit" variant="primary" busy={busy} className="h-11">
              Salva osservazione
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <div className="w-full">
              <ErrorBox error={error} />
            </div>
          </div>
        </form>
      ) : null}
      {d.observations.length ? (
        <ul className="grid gap-1.5">
          {d.observations.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-3 py-2.5 text-[15px]"
            >
              <span>
                <b>{DISEASE[o.disease] ?? o.disease}</b>
                {o.disease !== "nessuna" ? `, ${SEVERITY[o.severity]}` : ""} · {fmtDay(o.observed_at)}
                {o.phenology ? ` · ${o.phenology}` : ""}
                {o.by ? <span className="text-ink-3"> · {o.by}</span> : null}
                {o.note ? <span className="block text-sm text-ink-3">{o.note}</span> : null}
              </span>
              {o.validated_at ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                  <Check className="size-4 text-ok" aria-hidden /> confermata
                  {o.validated_by ? ` da ${o.validated_by}` : ""}
                </span>
              ) : canValidate ? (
                <Button variant="secondary" icon={Check} onClick={() => validate(o.id)}>
                  Conferma
                </Button>
              ) : (
                <span className="text-sm text-ink-3">da confermare</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3">Nessuna osservazione ancora.</p>
      )}
    </section>
  );
}
