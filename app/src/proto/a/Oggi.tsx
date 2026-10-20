// Direzione A · Carta IGM · Oggi: "devo trattare, e dove?" come su un foglio della carta.
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ACTION,
  coverText,
  DISEASE,
  fmtDay,
  fmtDayShort,
  fmtNum,
  fmtTime,
  fmtWindow,
  LEVEL,
  nextDays,
  pick,
  project,
  summarize,
  useProtoData,
  useScale,
  type Vineyard,
} from "../data";
import { ProtoBar } from "../ProtoBar";
import { IgmBand, IgmDefs, IgmState, Parcel } from "./parts";

export function OggiA() {
  const { data } = useProtoData();
  const n = useScale();
  const now = data ? new Date(data.generatedAt).getTime() : Date.now();
  const vs = useMemo(() => (data ? pick(data, n) : []), [data, n]);
  if (!data) return <div className="igm" />;
  const s = summarize(vs, now);
  const lead = s.lead;
  return (
    <div className="igm">
      <IgmDefs />
      <IgmBand
        org={`${data.organization.name} · ${data.organization.province}`}
        right={
          <small className="num">
            {fmtDay(data.generatedAt)}, aggiornato alle {fmtTime(data.generatedAt)}
          </small>
        }
      />
      <main className="igm-wrap">
        <section className="igm-answer" aria-live="polite">
          <h1>
            {s.treat.length ? (
              <>
                <em>Tratta</em> {s.headline.slice(6)}.
              </>
            ) : (
              `${s.headline}.`
            )}
          </h1>
          {lead ? (
            <p>
              {lead.name}: {DISEASE[lead.advice.disease].toLowerCase()} a rischio{" "}
              {LEVEL[lead.risk[lead.advice.disease].level]}. {lead.risk[lead.advice.disease].why}
            </p>
          ) : (
            <p>Nessun vigneto ha avuto né avrà condizioni da infezione nei prossimi 3 giorni.</p>
          )}
          {s.window ? (
            <span className="igm-window">
              <span
                aria-hidden
                style={{ width: 18, height: 6, background: "var(--idro-light)", borderRadius: 3 }}
              />
              Finestra asciutta: {fmtWindow(s.window)}
            </span>
          ) : null}
        </section>

        <div className="igm-grid">
          <div>
            <h2 className="igm-h2">I vigneti, prima dove intervenire</h2>
            <div className="igm-rows">
              {[...s.treat, ...s.check, ...(vs.length > 6 ? [] : s.ok)].map((v) => (
                <Row key={v.id} v={v} now={now} />
              ))}
              {vs.length > 6 && s.ok.length ? (
                <details className="igm-okgroup">
                  <summary>
                    <IgmState a="ok">Tutto bene · {s.ok.length} vigneti</IgmState>
                  </summary>
                  <p style={{ marginTop: 6 }}>{s.ok.map((v) => v.name).join(", ")}.</p>
                </details>
              ) : null}
            </div>

            <h2 className="igm-h2" style={{ marginTop: 32 }}>
              Prossimi 3 giorni{lead ? ` a ${lead.name}` : ""}
            </h2>
            <Days v={lead ?? vs[0]} />
          </div>

          <aside className="igm-aside">
            <h2 className="igm-h2">Foglio dell'azienda</h2>
            <Sheet vs={vs} stations={data.fleet} />
          </aside>
        </div>

        <p className="igm-note">
          Prototipo. Le misure vengono dal simulatore; pioggia, previsioni, rischio e trattamenti sono
          d'esempio (regole semplificate, non i modelli validati con l'agronomo). Vinai consiglia: la
          decisione di trattare resta tua.
        </p>
      </main>
      <ProtoBar dir="a" />
    </div>
  );
}

function Row({ v, now }: { v: Vineyard; now: number }) {
  const navigate = useNavigate();
  const r = v.risk[v.advice.disease];
  return (
    <a
      className="igm-row"
      href={`/prototipi/a/vigneto/${v.id}`}
      onClick={(e) => {
        e.preventDefault();
        navigate({ to: "/prototipi/a/vigneto/$id", params: { id: v.id }, search: (p) => ({ n: p.n }) });
      }}
    >
      <Parcel v={v} />
      <span>
        <span className="igm-row-name">{v.name}</span> <span className="igm-row-sub">{v.variety}</span>
      </span>
      <IgmState a={v.advice.action} />
      <span className="igm-row-detail">
        {v.advice.action === "ok"
          ? "Nessuna condizione da infezione"
          : `${DISEASE[v.advice.disease]}, rischio ${LEVEL[r.level]}`}{" "}
        · {coverText(v, now)}
      </span>
    </a>
  );
}

function Days({ v }: { v: Vineyard | undefined }) {
  if (!v) return null;
  return (
    <div className="igm-days">
      {nextDays(v).map((d) => (
        <div key={d.t} className="igm-day">
          <b>{fmtDay(d.t)}</b>
          <span
            className="igm-water"
            style={{ width: `${Math.max(4, (d.wetH / 24) * 100)}%` }}
            role="img"
            aria-label={`${fmtNum(d.wetH)} ore di foglia bagnata`}
          />
          <span className="num" style={{ fontSize: 14, color: "var(--ink-2)" }}>
            {fmtNum(d.wetH)} h bagnate · {d.rain > 0 ? `${fmtNum(d.rain)} mm` : "niente pioggia"}
            <br />
            {fmtNum(d.tmin)}–{fmtNum(d.tmax)} °C
          </span>
        </div>
      ))}
    </div>
  );
}

/** Il foglio: gli appezzamenti al loro posto, tutti alla stessa scala, col segno del vigneto. */
function Sheet({
  vs,
  stations,
}: {
  vs: Vineyard[];
  stations: { lat: number | null; lon: number | null; vineyard: string | null; status: string }[];
}) {
  const navigate = useNavigate();
  const W = 460;
  const H = 360;
  const centers = vs.map((v) => [v.center[1], v.center[0]] as [number, number]);
  const pos = project(
    [
      centers.length > 1
        ? centers
        : [centers[0] ?? [0, 0], [(centers[0]?.[0] ?? 0) + 0.01, (centers[0]?.[1] ?? 0) + 0.01]],
    ],
    W,
    H,
    70,
  );
  // scala comune per tutti gli appezzamenti: quella della carta, ingrandita se troppo piccoli da leggere
  const kTrue = Math.abs(pos([0.001, 0])[0] - pos([0, 0])[0]) * 1000;
  const radius = 0.0024 * kTrue;
  // ingrandimento per la leggibilità, mai oltre la metà della distanza tra i due vigneti più vicini
  const pts = vs.map((v) => pos([v.center[1], v.center[0]]));
  let minDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      minDist = Math.min(
        minDist,
        Math.hypot((pts[i]?.[0] ?? 0) - (pts[j]?.[0] ?? 0), (pts[i]?.[1] ?? 0) - (pts[j]?.[1] ?? 0)),
      );
  const wanted = radius < 22 ? 22 / radius : 1;
  const zoom = Math.max(1, Math.min(wanted, (minDist * 0.42) / radius));
  const names = new Set(vs.map((v) => v.name));
  // con molti vigneti si scrivono solo i nomi di quelli da trattare; gli altri sono nella lista
  const labeled = (v: Vineyard) => vs.length <= 6 || v.advice.action === "tratta";
  return (
    <div className="igm-sheet">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Foglio dell'azienda con ${vs.length} vigneti`}>
        {vs.map((v) => {
          const [cx, cy] = pos([v.center[1], v.center[0]]);
          const d = `${v.parcel
            .map((p, i) => {
              const x = cx + (p[0] - v.center[1]) * kTrue * zoom;
              const y = cy - (p[1] - v.center[0]) * kTrue * zoom;
              return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join("")}Z`;
          return (
            <g
              key={v.id}
              style={{ cursor: "pointer" }}
              onClick={() =>
                navigate({
                  to: "/prototipi/a/vigneto/$id",
                  params: { id: v.id },
                  search: (p) => ({ n: p.n }),
                })
              }
            >
              <path d={d} fill={`url(#igm-${v.advice.action})`} stroke="var(--bistro)" strokeWidth={1.3} />
              <title>{`${v.name}: ${ACTION[v.advice.action].toLowerCase()}`}</title>
              {labeled(v) ? (
                <text
                  x={cx}
                  y={cy + radius * zoom + 16}
                  textAnchor="middle"
                  fontSize={vs.length > 6 ? 11.5 : 13.5}
                  fontWeight={700}
                  fill="var(--ink)"
                  stroke="var(--panel)"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {v.name}
                </text>
              ) : null}
            </g>
          );
        })}
        {zoom === 1 && vs.length <= 6
          ? stations
              .filter((s) => s.lat !== null && s.lon !== null && s.vineyard && names.has(s.vineyard))
              .map((s, i) => {
                const [x, y] = pos([s.lon as number, s.lat as number]);
                return (
                  <path
                    key={i}
                    d={`M${x},${y - 6}L${x + 5.5},${y + 4}L${x - 5.5},${y + 4}Z`}
                    fill={s.status === "attiva" ? "var(--ink)" : "var(--carminio)"}
                    stroke="var(--panel)"
                    strokeWidth={1.5}
                  />
                );
              })
          : null}
      </svg>
      <div className="igm-sheet-foot">
        <span className="igm-key">
          <Swatch a="tratta" /> da trattare
        </span>
        <span className="igm-key">
          <Swatch a="controlla" /> da controllare
        </span>
        <span className="igm-key">
          <Swatch a="ok" /> tutto bene
        </span>
        {zoom === 1 && vs.length <= 6 ? (
          <span className="igm-key">
            <svg width="12" height="12" aria-hidden>
              <path d="M6,1L11,10L1,10Z" fill="var(--ink)" />
            </svg>
            centralina
          </span>
        ) : (
          <span>
            appezzamenti ingranditi ×{fmtNum(zoom, 1)}, tutti alla stessa scala
            {vs.length > 6 ? "; nomi solo per i vigneti da trattare" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function Swatch({ a }: { a: "tratta" | "controlla" | "ok" }) {
  return (
    <svg width="18" height="14" aria-hidden>
      <rect width="18" height="14" fill={`url(#igm-${a})`} stroke="var(--bistro)" />
    </svg>
  );
}
