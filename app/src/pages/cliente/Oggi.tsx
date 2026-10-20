// Oggi: "devo trattare, e dove?". Una frase che risponde, poi i vigneti dal più urgente, ciascuno con la
// sua protezione contro il rischio; a destra quando si può trattare e la pioggia dei prossimi giorni.
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronRight, Radio } from "lucide-react";
import { Legend, ProtectionLine } from "../../components/ProtectionLine";
import { Empty, ErrorBox, Skeleton } from "../../components/ui";
import {
  byWhen,
  capital,
  coverText,
  DISEASE,
  fmtDay,
  fmtNum,
  fmtTime,
  fmtWindow,
  type OrgToday,
  type VineyardView,
} from "../../lib/agro";
import { api } from "../../lib/api";
import { AdviceLabel, ClienteShell, SourcesNote } from "./Shell";

export function Oggi() {
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const q = useQuery({
    queryKey: ["oggi", orgId],
    queryFn: () => api<OrgToday>(`/orgs/${orgId}/today`),
    refetchInterval: 5 * 60_000,
  });
  const d = q.data;
  return (
    <ClienteShell orgId={orgId} orgName={d?.organization.name}>
      {q.isPending ? (
        <div className="mt-8 grid gap-3">
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !d ? (
        <div className="mt-8">
          <ErrorBox error={q.error} />
        </div>
      ) : (
        <Today d={d} />
      )}
    </ClienteShell>
  );
}

function Today({ d }: { d: OrgToday }) {
  const now = new Date(d.generatedAt).getTime();
  const vs = d.vineyards;
  const treat = vs.filter((v) => v.advice.action === "tratta");
  const check = vs.filter((v) => v.advice.action === "controlla");
  const ok = vs.filter((v) => v.advice.action === "ok");
  const lead = treat[0] ?? check[0] ?? null;
  const firstBy = treat
    .map((v) => v.advice.by)
    .filter((b): b is string => Boolean(b))
    .sort()[0];
  const names = (l: VineyardView[]) =>
    l.length <= 2 ? l.map((v) => v.name).join(" e ") : `${l.length} vigneti`;
  const headline = treat.length
    ? `${capital(firstBy ? byWhen(firstBy, now) : "appena puoi")}: tratta ${names(treat)}.`
    : check.length
      ? `Nessun trattamento urgente. Tieni d'occhio ${names(check)}.`
      : "Oggi non serve trattare.";
  const problems = d.stations.filter((s) =>
    ["muta", "sensore_guasto", "batteria_bassa", "in_ritardo"].includes(s.status),
  );
  const collapse = vs.length > 6;

  if (vs.length === 0)
    return (
      <div className="mt-8">
        <Empty title="Nessun vigneto ancora">
          I vigneti li aggiunge chi gestisce Vinai: compariranno qui con le loro centraline.
        </Empty>
      </div>
    );

  return (
    <>
      <section className="mt-7">
        <p className="text-sm text-ink-3">
          {capital(fmtDay(d.generatedAt))}, aggiornato alle {fmtTime(d.generatedAt)}
        </p>
        <h1 className="mt-1 max-w-[24ch] text-[clamp(1.7rem,1.25rem+2vw,2.5rem)] leading-[1.1] font-bold tracking-tight text-balance">
          {headline}
        </h1>
        {lead ? (
          <p className="mt-3 max-w-[62ch] text-[17px] text-ink-2">
            {lead.name}: {DISEASE[lead.advice.disease]?.toLowerCase()} a rischio{" "}
            {lead.risk[lead.advice.disease].level}
            {lead.protection && lead.protection.remainingDays <= 0 ? ", e la protezione è finita" : ""}.{" "}
            {lead.risk[lead.advice.disease].why}
          </p>
        ) : (
          <p className="mt-3 max-w-[62ch] text-[17px] text-ink-2">
            Nessun vigneto ha avuto né avrà condizioni da infezione nei prossimi 3 giorni.
          </p>
        )}
        {problems.length ? (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-(--warn-row) px-3 py-1.5 text-sm">
            <Radio className="size-4 text-warn" aria-hidden />
            {problems.length === 1
              ? "Una centralina non sta inviando bene"
              : `${problems.length} centraline non stanno inviando bene`}
            : i dati di quei vigneti possono essere incompleti.
          </p>
        ) : null}
      </section>

      <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0">
          <h2 className="mb-2 text-[15px] font-bold">Protezione e rischio, vigneto per vigneto</h2>
          <Legend />
          <div className="grid gap-2">
            {[...treat, ...check, ...(collapse ? [] : ok)].map((v) => (
              <Row key={v.id} v={v} now={now} />
            ))}
            {collapse && ok.length ? (
              <details className="group rounded-xl bg-panel px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    className="size-[18px] text-ink-3 transition-transform duration-150 group-open:rotate-90"
                    aria-hidden
                  />
                  <AdviceLabel a="ok">Coperti e senza rischio · {ok.length} vigneti</AdviceLabel>
                </summary>
                <div className="mt-2 grid gap-2">
                  {ok.map((v) => (
                    <Row key={v.id} v={v} now={now} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>
        <aside className="lg:sticky lg:top-4">
          <Window lead={lead ?? vs[0]} />
        </aside>
      </div>
      <SourcesNote model={d.model} sources={d.sources} />
    </>
  );
}

function Row({ v, now }: { v: VineyardView; now: number }) {
  const r = v.risk[v.advice.disease];
  return (
    <Link
      to="/a/$orgId/vigneto/$id"
      params={{ orgId: v.organizationId, id: v.id }}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1.5 rounded-xl bg-panel px-3.5 pt-3.5 pb-3 transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--panel)_86%,var(--accent))]"
    >
      <span className="min-w-0">
        <span className="text-[17px] font-bold">{v.name}</span>{" "}
        <span className="text-sm text-ink-3">{v.variety}</span>
      </span>
      <AdviceLabel a={v.advice.action} />
      <span className="col-span-2">
        <ProtectionLine v={v} now={now} />
      </span>
      <span className="col-span-2 text-[14.5px] text-ink-2">
        {v.advice.action === "ok"
          ? "Nessuna condizione da infezione"
          : `${DISEASE[v.advice.disease]}, rischio ${r.level}`}{" "}
        · {coverText(v.protection, now)}
        {!v.hasData ? " · senza centralina: rischio solo dalla previsione" : ""}
      </span>
    </Link>
  );
}

function Window({ lead }: { lead: VineyardView | undefined }) {
  if (!lead) return null;
  return (
    <div className="rounded-xl bg-panel p-4">
      <h2 className="text-[15px] font-bold">Quando trattare {lead.name}</h2>
      <p className="mt-2 text-[22px] font-bold tracking-tight num">
        {lead.window ? capital(fmtWindow(lead.window)) : "Nessuna finestra asciutta"}
      </p>
      <p className="mb-3.5 text-[14.5px] text-ink-2">
        {lead.window
          ? "Prima finestra di almeno 4 ore senza pioggia."
          : "Nelle prossime 36 ore non c'è una finestra di 4 ore senza pioggia."}
      </p>
      {lead.days.map((d) => (
        <div
          key={d.t}
          className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line-soft py-2.5 text-[14.5px]"
        >
          <b className="capitalize">{fmtDay(d.t)}</b>
          <span
            className="flex h-[18px] items-end gap-[3px]"
            role="img"
            aria-label={`${fmtNum(d.rain)} mm di pioggia`}
          >
            {Array.from({ length: Math.min(14, Math.ceil(d.rain / 2)) }, (_, i) => (
              <i
                key={`${d.t}-${i}`}
                className="w-1 rounded-sm bg-water"
                style={{ height: `${8 + ((i * 7) % 10)}px` }}
              />
            ))}
          </span>
          <span className="text-ink-2 num">
            {d.rain > 0 ? `${fmtNum(d.rain)} mm` : "asciutto"} · {fmtNum(d.tmin)}–{fmtNum(d.tmax)} °C
          </span>
        </div>
      ))}
    </div>
  );
}
