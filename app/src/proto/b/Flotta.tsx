// Direzione B · Verderame · Console › Flotta: righe vive ordinate per urgenza; un cambio di stato
// ritinge la riga senza spostare le colonne.

import { AlertTriangle, BatteryLow, CheckCircle2, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import { type FleetStation, fmtNum, useProtoData } from "../data";
import { ProtoBar } from "../ProtoBar";
import { ProtoMap, toRgb } from "../ProtoMap";
import { VrdShell } from "./parts";

const LABEL: Record<FleetStation["status"], string> = {
  muta: "Muta da 5 ore",
  sensore_guasto: "Umidità guasta",
  batteria_bassa: "Batteria bassa",
  attiva: "Attiva",
};
const ICON = {
  muta: WifiOff,
  sensore_guasto: AlertTriangle,
  batteria_bassa: BatteryLow,
  attiva: CheckCircle2,
};
const VAR: Record<FleetStation["status"], string> = {
  muta: "--vinaccia",
  sensore_guasto: "--vinaccia",
  batteria_bassa: "--ruggine",
  attiva: "--foglia",
};
const ORDER = ["muta", "sensore_guasto", "batteria_bassa", "attiva"];

export function FlottaB() {
  const { data } = useProtoData();
  const [filter, setFilter] = useState<string>("tutte");
  const rows = useMemo(
    () => (data?.fleet ?? []).slice().sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)),
    [data],
  );
  const points = useMemo(() => {
    if (!data) return [];
    const el = document.querySelector(".vrd") ?? document.documentElement;
    const css = getComputedStyle(el);
    return rows
      .filter((r) => r.lat !== null)
      .map((r) => ({
        id: r.id,
        lat: r.lat as number,
        lon: r.lon as number,
        color: toRgb(css.getPropertyValue(VAR[r.status]).trim()),
        label: r.label,
      }));
  }, [data, rows]);
  if (!data) return <div className="vrd" />;
  const shown = rows.filter((r) => filter === "tutte" || r.status === filter);
  const problems = rows.filter((r) => r.status !== "attiva").length;
  const now = new Date(data.generatedAt).getTime();
  return (
    <div className="vrd">
      <VrdShell console right={<span style={{ fontSize: 14, opacity: 0.85 }}>Amministratore</span>} />
      <main className="vrd-wrap" style={{ maxWidth: 1400 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 24,
          }}
        >
          <h1 style={{ fontSize: 30, fontWeight: 720, letterSpacing: "-0.02em" }}>
            {problems ? `${problems} centraline da controllare` : "Tutte le centraline stanno bene"}
          </h1>
          <span style={{ color: "var(--ink-3)" }}>{rows.length} in servizio</span>
        </div>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0 16px" }}
          role="group"
          aria-label="Filtra per stato"
        >
          {["tutte", ...ORDER].map((s) => {
            const count = s === "tutte" ? rows.length : rows.filter((r) => r.status === s).length;
            if (!count) return null;
            return (
              <button
                key={s}
                type="button"
                className="vrd-chip"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
              >
                {s === "tutte" ? "Tutte" : LABEL[s as FleetStation["status"]]}{" "}
                <span className="num">{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "grid", gap: 20 }} className="vrd-fleetgrid">
          <div style={{ overflowX: "auto" }}>
            <table className="vrd-table">
              <thead>
                <tr>
                  <th>Stato</th>
                  <th>Centralina</th>
                  <th>Vigneto</th>
                  <th>Ultimo invio</th>
                  <th>Bagnatura 24 h</th>
                  <th style={{ textAlign: "right" }}>Temp.</th>
                  <th style={{ textAlign: "right" }}>UR</th>
                  <th style={{ textAlign: "right" }}>Batteria</th>
                  <th style={{ textAlign: "right" }}>Segnale</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const I = ICON[r.status];
                  const min = r.last_seen_at
                    ? Math.round((now - new Date(r.last_seen_at).getTime()) / 60000)
                    : null;
                  return (
                    <tr key={r.id} data-s={r.status}>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontWeight: r.status === "attiva" ? 450 : 700,
                          }}
                        >
                          <I size={16} style={{ color: `var(${VAR[r.status]})` }} aria-hidden />{" "}
                          {LABEL[r.status]}
                        </span>
                      </td>
                      <td>
                        <b>{r.label}</b>{" "}
                        <span style={{ color: "var(--ink-3)", fontSize: 12.5 }}>{r.imei.slice(-6)}</span>
                      </td>
                      <td title={r.organization?.replace(" (demo)", "") ?? undefined}>{r.vineyard}</td>
                      <td className="num">
                        {min === null ? "mai" : min < 60 ? `${min} min fa` : `${fmtNum(min / 60, 1)} h fa`}
                      </td>
                      <td>
                        <Spark values={r.wet24 ?? []} />
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {fmtNum(r.temp_c, 1)} °C
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.hum_pct === null ? "guasto" : `${fmtNum(r.hum_pct)} %`}
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {fmtNum((r.batt_mv ?? 0) / 1000, 2)} V
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.rsrp_dbm} dBm
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ marginTop: 10, fontSize: 13, color: "var(--ink-3)" }}>
              Muta, umidità guasta e batteria bassa sono stati costruiti apposta per il prototipo.
            </p>
          </div>
          <ProtoMap
            points={points}
            style="https://tiles.openfreemap.org/styles/dark"
            ring="rgb(28, 38, 52)"
            height={460}
          />
        </div>
      </main>
      <style>
        {"@media (min-width: 1200px) { .vrd-fleetgrid { grid-template-columns: minmax(0, 1fr) 380px; } }"}
      </style>
      <ProtoBar dir="b" />
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const w = 96;
  const step = w / 24;
  return (
    <svg
      width={w}
      height={18}
      role="img"
      aria-label={`${values.filter((v) => v >= 30).length} ore bagnate nelle ultime 24`}
    >
      <line x1={0} x2={w} y1={17} y2={17} stroke="var(--rule)" />
      {values.slice(-24).map((v, i) => (
        <rect
          key={i}
          x={i * step + 0.5}
          y={17 - (v / 60) * 15}
          width={Math.max(1, step - 1.5)}
          height={(v / 60) * 15}
          fill="var(--c-wet)"
          rx={1}
        />
      ))}
    </svg>
  );
}
