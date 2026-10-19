// Direzione B · Verderame · Vigneto: la protezione per intero, il perché, 7 giorni e 3 di previsione.
import { useParams } from "@tanstack/react-router";
import { BackToToday } from "../a/parts";
import {
  DISEASE,
  type Disease,
  daysAgo,
  fmtDay,
  fmtDayShort,
  fmtNum,
  fmtTime,
  fmtWhen,
  fmtWindow,
  LEVEL,
  treatWindow,
  useProtoData,
} from "../data";
import { ProtoBar } from "../ProtoBar";
import { TimeChart } from "../TimeChart";
import { useField } from "./Oggi";
import { FieldToggle, Legend, ProtectionLine, VrdShell, VrdState } from "./parts";

const METER: Record<string, string> = {
  alto: "var(--vinaccia)",
  medio: "var(--ruggine)",
  basso: "var(--foglia)",
};

export function VignetoB() {
  const { data } = useProtoData();
  const field = useField();
  const { id } = useParams({ strict: false }) as { id: string };
  if (!data) return <div className="vrd" />;
  const v = data.vineyards.find((x) => x.id === id);
  if (!v) return <div className="vrd">Vigneto non trovato</div>;
  const now = new Date(data.generatedAt).getTime();
  const t = v.treatment;
  const win = treatWindow(v);
  const stations = data.fleet.filter((s) => s.vineyard === v.name);
  return (
    <div className="vrd" data-campo={field.on}>
      <VrdShell org={data.organization.name} right={<FieldToggle on={field.on} set={field.set} />} />
      <main className="vrd-wrap">
        <BackToToday dir="b" />
        <h1 style={{ fontSize: 32, fontWeight: 720, letterSpacing: "-0.02em", marginTop: 12 }}>{v.name}</h1>
        <p style={{ color: "var(--ink-3)" }}>
          {v.variety}
          {v.synthetic ? " · vigneto d'esempio" : ""}
        </p>
        <p style={{ marginTop: 12, fontSize: 19, fontWeight: 600 }}>
          <VrdState a={v.advice.action} />{" "}
          {v.advice.action === "tratta"
            ? `per ${DISEASE[v.advice.disease].toLowerCase()}${win ? `, meglio ${fmtWindow(win)}` : ""}.`
            : v.advice.action === "controlla"
              ? `: ${DISEASE[v.advice.disease].toLowerCase()} da tenere d'occhio.`
              : ": coperto e senza condizioni da infezione."}
        </p>

        <section className="vrd-panel" style={{ marginTop: 22 }}>
          <h2 className="vrd-h2">
            {t.product}, {fmtDay(t.date)} ({daysAgo(t.date, now)})
          </h2>
          <Legend />
          <ProtectionLine v={v} now={now} full />
          <p style={{ marginTop: 10, color: "var(--ink-2)" }}>
            Copertura di circa {t.coverDays} giorni contro {DISEASE[t.target].toLowerCase()}.{" "}
            {t.rainSinceMm > 0
              ? `Da allora ${fmtNum(t.rainSinceMm)} mm di pioggia ne hanno lavati via ${fmtNum((t.rainSinceMm / 10) * 2, 1)} giorni.`
              : "Da allora non è piovuto."}{" "}
            {t.remainingDays <= 0
              ? "La protezione è finita."
              : t.exhaustedOn
                ? `Con i ${fmtNum(t.rainNextMm)} mm previsti finisce ${fmtWhen(t.exhaustedOn)}.`
                : "Regge anche con la pioggia prevista."}
          </p>
        </section>

        <div className="vrd-grid">
          <div>
            <TimeChart
              title="Al vigneto, 7 giorni e 3 di previsione (media delle centraline)"
              hours={[...v.past, ...v.forecast]}
              nowIndex={v.past.length - 1}
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
          </div>
          <aside className="vrd-aside">
            <div className="vrd-panel">
              <h2 className="vrd-h2">Perché</h2>
              {(Object.keys(v.risk) as Disease[])
                .sort((a, b) => v.risk[b].index - v.risk[a].index)
                .map((d) => (
                  <div key={d} className="vrd-disease">
                    <div>
                      <b>{DISEASE[d]}</b>
                      <div style={{ fontSize: 14, color: "var(--ink-2)" }}>
                        rischio {LEVEL[v.risk[d].level]}
                      </div>
                      <div className="vrd-meter" role="img" aria-label={`indice ${v.risk[d].index} su 100`}>
                        <span
                          style={{
                            width: `${Math.max(3, v.risk[d].index)}%`,
                            background: METER[v.risk[d].level],
                          }}
                        />
                      </div>
                    </div>
                    <p style={{ fontSize: 14.5, color: "var(--ink-2)" }}>{v.risk[d].why}</p>
                  </div>
                ))}
            </div>
            <div className="vrd-panel" style={{ marginTop: 14 }}>
              <h2 className="vrd-h2">Centraline</h2>
              {stations.length ? (
                stations.map((s) => (
                  <p
                    key={s.id}
                    style={{ padding: "6px 0", borderTop: "1px solid var(--rule)", fontSize: 15 }}
                  >
                    <b>{s.label}</b> · {s.status === "attiva" ? "attiva" : s.status.replace("_", " ")} ·{" "}
                    <span className="num">{fmtNum(s.temp_c, 1)} °C</span>
                  </p>
                ))
              ) : (
                <p style={{ color: "var(--ink-3)" }}>Vigneto d'esempio, senza centraline vere.</p>
              )}
            </div>
          </aside>
        </div>
      </main>
      <ProtoBar dir="b" />
    </div>
  );
}
