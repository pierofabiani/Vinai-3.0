// Grafico di una sola serie nel tempo (uPlot): linea da 2px o barre, banda min-max facoltativa,
// griglia recessiva, mirino con tooltip, tabella dei valori per chi non legge il grafico.
// Una serie per grafico: il titolo dice cosa c'è, niente legenda e niente secondo asse.
import { useEffect, useRef, useState } from "react";
import uPlot, { type AlignedData, type Options } from "uplot";
import { dateTime } from "../lib/format";

export interface ChartProps {
  title: string;
  /** unità mostrata nel titolo e nel tooltip */
  unit: string;
  times: string[];
  values: (number | null)[];
  kind?: "line" | "bars";
  band?: { min: (number | null)[]; max: (number | null)[] };
  format: (v: number | null) => string;
  height?: number;
  /** ampiezza minima dell'asse y, nelle unità della serie (es. 0,2 V per la batteria) */
  minSpan?: number;
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function roundedBars(): uPlot.Series.PathBuilder {
  // barre al massimo 12px, angoli arrotondati di 4px in cima e base dritta
  return (u, seriesIdx, idx0, idx1) => {
    const path = new Path2D();
    const xs = u.data[0];
    const ys = u.data[seriesIdx] as (number | null)[];
    const step =
      xs.length > 1 ? u.valToPos(xs[1] as number, "x", true) - u.valToPos(xs[0] as number, "x", true) : 12;
    const w = Math.max(1, Math.min(12 * devicePixelRatio, step - 2 * devicePixelRatio));
    const base = u.valToPos(0, "y", true);
    for (let i = idx0; i <= idx1; i++) {
      const y = ys[i];
      if (y === null || y === undefined || y <= 0) continue;
      const x = u.valToPos(xs[i] as number, "x", true) - w / 2;
      const top = u.valToPos(y, "y", true);
      const r = Math.min(4 * devicePixelRatio, w / 2, base - top);
      path.moveTo(x, base);
      path.lineTo(x, top + r);
      path.quadraticCurveTo(x, top, x + r, top);
      path.lineTo(x + w - r, top);
      path.quadraticCurveTo(x + w, top, x + w, top + r);
      path.lineTo(x + w, base);
      path.closePath();
    }
    return { stroke: path, fill: path };
  };
}

export function Chart({
  title,
  unit,
  times,
  values,
  kind = "line",
  band,
  format,
  height = 180,
  minSpan = 0,
}: ChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || times.length === 0) return;
    const series = cssVar("--series");
    const wash = cssVar("--series-wash");
    const grid = cssVar("--grid");
    const ink3 = cssVar("--ink-3");
    const xs = times.map((t) => new Date(t).getTime() / 1000);
    const data: AlignedData = band ? [xs, values, band.min, band.max] : [xs, values];
    const axis = {
      stroke: ink3,
      grid: { stroke: grid, width: 1 },
      ticks: { show: false },
      font: "12px IBM Plex Sans",
    };
    const opts: Options = {
      width: el.clientWidth,
      height,
      legend: { show: false },
      cursor: { y: false, points: { size: 8, width: 2 }, drag: { x: false, y: false } },
      scales: {
        x: { time: true },
        y:
          kind === "bars"
            ? { range: (_u, _min, max) => [0, Math.max(1, max * 1.1)] }
            : {
                // piccole variazioni (batteria, segnale) non diventano etichette tutte uguali
                range: (_u, min, max) => {
                  const pad = Math.max((minSpan - (max - min)) / 2, (max - min) * 0.08);
                  return [min - pad, max + pad];
                },
              },
      },
      axes: [
        {
          ...axis,
          values: (_u, ticks) =>
            ticks.map((t) =>
              new Intl.DateTimeFormat("it", { day: "numeric", month: "short" }).format(t * 1000),
            ),
        },
        { ...axis, size: 48, values: (_u, ticks) => ticks.map((t) => format(t).replace(` ${unit}`, "")) },
      ],
      series: [
        {},
        kind === "bars"
          ? { stroke: series, fill: series, paths: roundedBars(), points: { show: false } }
          : { stroke: series, width: 2, points: { show: false }, spanGaps: false },
        ...(band
          ? [
              { stroke: "transparent", points: { show: false } },
              { stroke: "transparent", points: { show: false } },
            ]
          : []),
      ],
      bands: band ? [{ series: [3, 2], fill: wash }] : [],
      hooks: {
        setCursor: [
          (u) => {
            const t = tip.current;
            const i = u.cursor.idx;
            if (!t) return;
            if (i === null || i === undefined || u.cursor.left === undefined || u.cursor.left < 0) {
              t.style.opacity = "0";
              return;
            }
            const v = values[i] ?? null;
            const range = band
              ? ` (min ${format(band.min[i] ?? null)}, max ${format(band.max[i] ?? null)})`
              : "";
            t.textContent = `${dateTime(times[i])} · ${format(v)}${range}`;
            const left = Math.min(
              Math.max(0, u.cursor.left - t.offsetWidth / 2),
              u.over.clientWidth - t.offsetWidth,
            );
            t.style.transform = `translateX(${left}px)`;
            t.style.opacity = "1";
          },
        ],
      },
    };
    const plot = new uPlot(opts, data, el);
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [times, values, band, kind, height, format, unit, minSpan]);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {title} <span className="text-ink-3">({unit})</span>
        </span>
        {times.length > 0 ? (
          <button
            type="button"
            className="text-xs text-ink-3 underline hover:text-ink"
            onClick={() => setShowTable((s) => !s)}
          >
            {showTable ? "Nascondi tabella" : "Tabella"}
          </button>
        ) : null}
      </figcaption>
      {times.length === 0 ? (
        <p className="grid h-[120px] place-items-center rounded-md border border-dashed border-line text-sm text-ink-3">
          Nessun dato negli ultimi 7 giorni
        </p>
      ) : (
        <div className="relative">
          <div
            ref={tip}
            className="pointer-events-none absolute top-0 left-0 z-10 rounded border border-line bg-panel-2 px-2 py-1 text-xs whitespace-nowrap text-ink opacity-0 shadow-[var(--shadow)] transition-opacity duration-100 num"
          />
          <div ref={box} className="pt-6" />
        </div>
      )}
      {showTable ? (
        <div className="mt-2 max-h-56 overflow-auto rounded border border-line-soft text-xs">
          <table className="w-full num">
            <tbody>
              {times.map((t, i) => (
                <tr key={t} className="border-t border-line-soft first:border-0">
                  <td className="px-2 py-1 text-ink-3">{dateTime(t)}</td>
                  <td className="px-2 py-1 text-right">{format(values[i] ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
