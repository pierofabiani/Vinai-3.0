// La mano di verderame (DESIGN.md, mossa distintiva): la protezione dell'ultimo trattamento come una barra
// che i giorni e la pioggia consumano, contro le ore con condizioni da infezione che arrivano.
import { useEffect, useRef, useState } from "react";
import { fmtDayShort, fmtNum, fmtWhen, type VineyardView } from "../lib/agro";

const DAY = 86_400_000;

/**
 * La mano di verderame: la protezione come una barra che va dal trattamento alla fine della copertura,
 * con una tacca per ogni pioggia che la lava via; sotto, i segni delle ore con condizioni da infezione.
 * Dove i segni cadono oltre la fine della barra, il vigneto è scoperto.
 */
/** Larghezza reale del contenitore: il disegno resta in pixel veri, il testo non si ingrandisce. */
function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export function ProtectionLine({ v, now, full = false }: { v: VineyardView; now: number; full?: boolean }) {
  const { ref, w: W } = useWidth(640);
  const H = full ? 150 : 40;
  // sotto i 560 px un'etichetta ogni due giorni, perché non si sovrappongano
  const labelEvery = W < 560 ? 2 : 1;
  const from = now - 7 * DAY;
  const to = now + 3 * DAY;
  const x = (t: number) => ((Math.min(Math.max(t, from), to) - from) / (to - from)) * W;
  const t = v.protection;
  if (!t) return <NoTreatment full={full} />;
  const start = new Date(t.date).getTime();
  const end =
    t.remainingDays > 0
      ? t.exhaustedOn
        ? new Date(t.exhaustedOn).getTime()
        : to
      : t.exhaustedOn
        ? Math.min(new Date(t.exhaustedOn).getTime(), now)
        : start + (t.coverDays / 2) * DAY;
  const barY = full ? 40 : 6;
  const barH = full ? 18 : 12;
  const tickY = barY + barH + (full ? 10 : 6);
  const tickH = full ? 14 : 8;
  const hours = [...v.past, ...v.forecast];

  // piogge raggruppate in eventi, tra il trattamento e la fine della barra
  const events: { t: number; mm: number }[] = [];
  let cur: { t: number; mm: number } | null = null;
  for (const h of hours) {
    const ht = new Date(h.t).getTime();
    if (h.rain >= 0.5 && ht >= start && ht <= Math.min(end, to)) {
      if (!cur) cur = { t: ht, mm: 0 };
      cur.mm += h.rain;
    } else if (cur) {
      events.push(cur);
      cur = null;
    }
  }
  if (cur) events.push(cur);

  // etichette della pioggia solo dove c'è spazio: almeno 48 px dalla precedente
  const labelled = new Set<number>();
  let lastX = Number.NEGATIVE_INFINITY;
  events.forEach((e, i) => {
    if (e.mm >= 3 && x(e.t) - lastX >= 48) {
      labelled.add(i);
      lastX = x(e.t);
    }
  });
  const infect = hours
    .filter((h) => h.wet >= 30 && h.temp !== null && h.temp >= 10 && h.temp <= 28)
    .map((h) => new Date(h.t).getTime());
  const uncovered = infect.filter((ti) => ti > end && ti > now - DAY);
  const firstUncovered = uncovered[0];
  const ticks = full ? Array.from({ length: 11 }, (_, i) => from + i * DAY).filter((d) => d <= to) : [];

  return (
    <div ref={ref}>
      <svg
        className="block h-auto w-full overflow-visible"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Protezione di ${t.product} dal ${fmtDayShort(t.date)}${
          t.remainingDays > 0
            ? ` fino a ${t.exhaustedOn ? fmtWhen(t.exhaustedOn) : "oltre 3 giorni"}`
            : ", già finita"
        }; ${events.length} piogge la consumano; ${uncovered.length} ore con condizioni da infezione senza copertura`}
      >
        {ticks.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={barY - 8} y2={tickY + tickH} stroke="var(--line-soft)" />
            {Math.round((d - from) / DAY) % labelEvery === 0 && !(labelEvery > 1 && x(d) > W - 48) ? (
              <text
                x={x(d) > W - 48 ? W - 1 : x(d) + 3}
                textAnchor={x(d) > W - 48 ? "end" : "start"}
                y={H - 26}
                fontSize={11.5}
                fill="var(--ink-3)"
              >
                {fmtDayShort(new Date(d).toISOString())}
              </text>
            ) : null}
          </g>
        ))}
        <rect x={0} y={barY + barH / 2 - 1} width={W} height={2} fill="var(--line-soft)" />
        {/* la protezione */}
        <rect
          x={x(start)}
          y={barY}
          width={Math.max(2, x(end) - x(start))}
          height={barH}
          rx={3}
          fill="var(--accent)"
        />
        {/* la pioggia che la lava: tacche nel fondo */}
        {events.map((e, i) => {
          const w = Math.min(28, Math.max(3, e.mm * 0.9));
          return (
            <g key={e.t}>
              <rect
                x={x(e.t) - w / 2}
                y={barY - 1}
                width={w}
                height={barH + 2}
                fill="var(--bg)"
                opacity={0.92}
              />
              {full && e.mm >= 3 && Math.abs(x(e.t) - x(now)) > 34 && labelled.has(i) ? (
                <text x={x(e.t)} y={barY - 6} fontSize={11.5} textAnchor="middle" fill="var(--ink-2)">
                  −{fmtNum(e.mm)} mm
                </text>
              ) : null}
            </g>
          );
        })}
        {/* ore con condizioni da infezione */}
        {infect.map((ti) => (
          <rect
            key={ti}
            x={x(ti) - 1}
            y={tickY}
            width={2.5}
            height={tickH}
            fill="var(--bad)"
            opacity={ti > end ? 1 : 0.35}
          />
        ))}
        {firstUncovered && full ? (
          <text
            x={x(firstUncovered) > W - 290 ? W - 2 : x(firstUncovered) + 4}
            textAnchor={x(firstUncovered) > W - 290 ? "end" : "start"}
            y={H - 4}
            fontSize={12.5}
            fontWeight={650}
            fill="var(--bad)"
          >
            rischio senza copertura da {fmtWhen(new Date(firstUncovered).toISOString())}
          </text>
        ) : null}
        {/* adesso */}
        <line x1={x(now)} x2={x(now)} y1={0} y2={tickY + tickH + 2} stroke="var(--ink)" strokeWidth={1.5} />
        {full ? (
          <text x={x(now) + 4} y={10} fontSize={11.5} fontWeight={650} fill="var(--ink)">
            adesso
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export function Legend() {
  return (
    <div className="mb-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink-2 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5">
      <span>
        <svg width="22" height="10" aria-hidden>
          <rect width="22" height="10" rx="2" fill="var(--accent)" />
        </svg>
        protezione rimasta
      </span>
      <span>
        <svg width="22" height="10" aria-hidden>
          <rect width="22" height="10" rx="2" fill="var(--accent)" />
          <rect x="8" width="6" height="10" fill="var(--bg)" />
        </svg>
        pioggia che la lava
      </span>
      <span>
        <svg width="10" height="12" aria-hidden>
          <rect x="4" width="2.5" height="12" fill="var(--bad)" />
        </svg>
        ore da infezione
      </span>
      <span>
        <svg width="10" height="12" aria-hidden>
          <rect x="4" width="1.5" height="12" fill="var(--ink)" />
        </svg>
        adesso
      </span>
    </div>
  );
}

function NoTreatment({ full }: { full: boolean }) {
  return (
    <p className={full ? "py-6 text-sm text-ink-3" : "py-1 text-sm text-ink-3"}>
      Nessun trattamento registrato: la protezione non si può stimare.
    </p>
  );
}
