// Grafico del tempo condiviso dai prototipi: righe sovrapposte sullo stesso asse dei tempi
// (una misura per riga, mai due scale nella stessa riga), passato e previsione separati da "adesso",
// mirino con tooltip al passaggio o al tocco, tabella dei valori. I colori arrivano dalle variabili
// CSS della direzione: --tc-ink, --tc-muted, --tc-grid, --tc-now, --tc-forecast, e il colore di ogni riga.
import { useMemo, useRef, useState } from "react";
import { fmtNum, fmtWhen, type Hour } from "./data";

export interface ChartRow {
  key: string;
  label: string;
  unit: string;
  kind: "line" | "bars";
  /** variabile CSS del colore della serie, es. "--c-temp" */
  color: string;
  value: (h: Hour) => number | null;
  digits?: number;
  height?: number;
  /** minimo dell'asse per le barre (0) o ampiezza minima per le linee */
  minSpan?: number;
}

const W = 720;
const LEFT = 44;
const RIGHT = 8;

export function TimeChart({
  hours,
  nowIndex,
  rows,
  title,
}: {
  hours: Hour[];
  nowIndex: number;
  rows: ChartRow[];
  title: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const n = hours.length;
  const x = (i: number) => LEFT + (i / Math.max(1, n - 1)) * (W - LEFT - RIGHT);
  const step = (W - LEFT - RIGHT) / Math.max(1, n - 1);

  const layout = useMemo(() => {
    let y = 4;
    return rows.map((r) => {
      const h = r.height ?? 72;
      const vals = hours.map(r.value);
      const nums = vals.filter((v): v is number => v !== null);
      let lo = r.kind === "bars" ? 0 : Math.min(...nums);
      let hi = Math.max(...nums, r.kind === "bars" ? 1 : Number.NEGATIVE_INFINITY);
      const span = r.minSpan ?? 0;
      if (r.kind === "line" && hi - lo < span) {
        const mid = (hi + lo) / 2;
        lo = mid - span / 2;
        hi = mid + span / 2;
      }
      const pad = r.kind === "line" ? (hi - lo) * 0.1 : 0;
      lo -= pad;
      hi += pad;
      const top = y + 24;
      const yOf = (v: number) => top + h - ((v - lo) / (hi - lo || 1)) * h;
      y = top + h + 14;
      return { r, vals, lo, hi, top, h, yOf };
    });
  }, [hours, rows]);
  const H = (layout.at(-1)?.top ?? 0) + (layout.at(-1)?.h ?? 0) + 22;

  const onMove = (e: React.PointerEvent) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round((px - LEFT) / step);
    setHover(i >= 0 && i < n ? i : null);
  };

  // tacche dei giorni: mezzanotte di Roma
  const ticks = hours
    .map((h, i) => ({ i, d: new Date(h.t) }))
    .filter(
      ({ d }) =>
        new Intl.DateTimeFormat("it", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Rome" }).format(
          d,
        ) === "0",
    );

  const hv = hover !== null ? hours[hover] : null;
  return (
    <figure className="tc">
      <figcaption className="tc-head">
        <span className="tc-title">{title}</span>
        <button type="button" className="tc-toggle" onClick={() => setTable((t) => !t)}>
          {table ? "Nascondi tabella" : "Tabella"}
        </button>
      </figcaption>
      <div className="tc-plot">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}: ${rows.map((r) => r.label).join(", ")}, ultimi 7 giorni e prossimi 3`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: "pan-y" }}
        >
          <rect
            x={x(nowIndex)}
            y={0}
            width={W - RIGHT - x(nowIndex)}
            height={H - 18}
            fill="var(--tc-forecast)"
          />
          {ticks.map(({ i, d }) => (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={4} y2={H - 18} stroke="var(--tc-grid)" strokeWidth={1} />
              <text x={x(i) + 3} y={H - 6} fontSize={11} fill="var(--tc-muted)">
                {new Intl.DateTimeFormat("it", {
                  weekday: "short",
                  day: "numeric",
                  timeZone: "Europe/Rome",
                }).format(d)}
              </text>
            </g>
          ))}
          {layout.map(({ r, vals, lo, hi, top, h, yOf }) => (
            <g key={r.key}>
              <text x={0} y={top - 9} fontSize={12} fill="var(--tc-ink)" fontWeight={600}>
                {r.label}{" "}
                <tspan fill="var(--tc-muted)" fontWeight={400}>
                  ({r.unit})
                </tspan>
              </text>
              <line x1={LEFT} x2={W - RIGHT} y1={top + h} y2={top + h} stroke="var(--tc-grid)" />
              <text x={LEFT - 6} y={top + 8} fontSize={10} fill="var(--tc-muted)" textAnchor="end">
                {fmtNum(hi, r.kind === "bars" ? 0 : 0)}
              </text>
              <text x={LEFT - 6} y={top + h} fontSize={10} fill="var(--tc-muted)" textAnchor="end">
                {fmtNum(lo, 0)}
              </text>
              {r.kind === "line" ? (
                <path
                  d={vals
                    .map((v, i) =>
                      v === null
                        ? ""
                        : `${i === 0 || vals[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${yOf(v).toFixed(1)}`,
                    )
                    .join("")}
                  fill="none"
                  stroke={`var(${r.color})`}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : (
                vals.map((v, i) =>
                  v && v > 0 ? (
                    <rect
                      key={i}
                      x={x(i) - Math.max(1, step - 1) / 2}
                      y={yOf(v)}
                      width={Math.max(1, step - 1)}
                      height={top + h - yOf(v)}
                      fill={`var(${r.color})`}
                      opacity={i > nowIndex ? 0.55 : 1}
                    />
                  ) : null,
                )
              )}
            </g>
          ))}
          <line
            x1={x(nowIndex)}
            x2={x(nowIndex)}
            y1={0}
            y2={H - 18}
            stroke="var(--tc-now)"
            strokeWidth={1.5}
          />
          <text x={x(nowIndex) + 4} y={11} fontSize={11} fill="var(--tc-now)" fontWeight={600}>
            adesso · previsione →
          </text>
          {hover !== null ? (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={0}
                y2={H - 18}
                stroke="var(--tc-ink)"
                strokeOpacity={0.5}
              />
              {layout.map(({ r, vals, yOf }) => {
                const v = vals[hover];
                return v === null || v === undefined || (r.kind === "bars" && v === 0) ? null : (
                  <circle
                    key={r.key}
                    cx={x(hover)}
                    cy={yOf(v)}
                    r={4}
                    fill={`var(${r.color})`}
                    stroke="var(--tc-bg)"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>
        {hv ? (
          <div className="tc-tip" style={{ left: `${(x(hover ?? 0) / W) * 100}%` }}>
            <strong>{fmtWhen(hv.t)}</strong>
            {(hover ?? 0) > nowIndex ? <em> · previsione</em> : null}
            {rows.map((r) => (
              <span key={r.key}>
                {r.label}: {fmtNum(r.value(hv), r.digits ?? 0)} {r.unit}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {table ? (
        <div className="tc-table">
          <table>
            <thead>
              <tr>
                <th>Ora</th>
                {rows.map((r) => (
                  <th key={r.key}>
                    {r.label} ({r.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((h, i) => (
                <tr key={h.t} className={i > nowIndex ? "tc-fc" : undefined}>
                  <td>
                    {fmtWhen(h.t)}
                    {i > nowIndex ? " (prev.)" : ""}
                  </td>
                  {rows.map((r) => (
                    <td key={r.key}>{fmtNum(r.value(h), r.digits ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
