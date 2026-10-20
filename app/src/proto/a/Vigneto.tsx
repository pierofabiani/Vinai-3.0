// Direzione A · Carta IGM · Vigneto: il perché, il trattamento, 7 giorni passati e 3 previsti.
import { useParams } from "@tanstack/react-router";
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
import { BackToToday, IgmBand, IgmDefs, IgmState, Parcel } from "./parts";

export function VignetoA() {
  const { data } = useProtoData();
  const { id } = useParams({ strict: false }) as { id: string };
  if (!data) return <div className="igm" />;
  const v = data.vineyards.find((x) => x.id === id);
  if (!v) return <div className="igm">Vigneto non trovato</div>;
  const now = new Date(data.generatedAt).getTime();
  const t = v.treatment;
  const hours = [...v.past, ...v.forecast];
  const win = treatWindow(v);
  const usedPct = Math.min(100, 100 - t.remainingPct);
  const rainPct = Math.min(usedPct, Math.round(((t.rainSinceMm / 10) * 2 * 100) / t.coverDays));
  const stations = data.fleet.filter((s) => s.vineyard === v.name);
  return (
    <div className="igm">
      <IgmDefs />
      <IgmBand org={data.organization.name} />
      <main className="igm-wrap">
        <BackToToday dir="a" />
        <div style={{ display: "flex", gap: 18, alignItems: "center", marginTop: 14 }}>
          <Parcel v={v} size={84} />
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 780, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {v.name}
            </h1>
            <p style={{ color: "var(--ink-3)" }}>
              {v.variety} · {fmtNum(v.center[0], 4)}, {fmtNum(v.center[1], 4)}
              {v.synthetic ? " · vigneto d'esempio" : ""}
            </p>
          </div>
        </div>
        <p style={{ marginTop: 16, fontSize: 19, fontWeight: 650, maxWidth: "60ch" }}>
          <IgmState a={v.advice.action} />{" "}
          {v.advice.action === "tratta"
            ? `per ${DISEASE[v.advice.disease].toLowerCase()}, prima che la copertura finisca.`
            : v.advice.action === "controlla"
              ? `: ${DISEASE[v.advice.disease].toLowerCase()} da tenere d'occhio.`
              : ": nessuna condizione da infezione."}
        </p>

        <div className="igm-grid">
          <div>
            <h2 className="igm-h2">Perché</h2>
            <div style={{ borderTop: "2px solid var(--bistro)" }}>
              {(Object.keys(v.risk) as Disease[])
                .sort((a, b) => v.risk[b].index - v.risk[a].index)
                .map((d) => (
                  <div key={d} className="igm-disease">
                    <b>{DISEASE[d]}</b>
                    <span className="igm-level" data-l={v.risk[d].level}>
                      <i />
                      <i />
                      <i /> <span style={{ marginLeft: 4 }}>{LEVEL[v.risk[d].level]}</span>
                    </span>
                    <p style={{ color: "var(--ink-2)", fontSize: 15 }}>{v.risk[d].why}</p>
                  </div>
                ))}
            </div>

            <h2 className="igm-h2" style={{ marginTop: 30 }}>
              Ultimi 7 giorni e prossimi 3
            </h2>
            <TimeChart
              title="Al vigneto (media delle centraline)"
              hours={hours}
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

          <aside className="igm-aside">
            <h2 className="igm-h2">Ultimo trattamento</h2>
            <div style={{ borderTop: "2px solid var(--bistro)", paddingTop: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700 }}>{t.product}</p>
              <p style={{ color: "var(--ink-2)" }}>
                {fmtDay(t.date)} ({daysAgo(t.date, now)}), contro {DISEASE[t.target].toLowerCase()}. Copertura
                di circa {t.coverDays} giorni.
              </p>
              <div
                className="igm-cover"
                role="img"
                aria-label={`Copertura consumata al ${usedPct}%, di cui ${rainPct} punti per la pioggia`}
              >
                <span style={{ width: `${t.remainingPct}%`, left: `${usedPct}%` }} />
                <em style={{ left: `${usedPct - rainPct}%`, width: `${rainPct}%` }} />
              </div>
              <p className="num" style={{ fontSize: 14.5, color: "var(--ink-2)" }}>
                Restano {fmtNum(t.remainingDays, 1)} giorni ·{" "}
                {t.rainSinceMm > 0
                  ? `${fmtNum(t.rainSinceMm)} mm di pioggia da allora ne hanno consumati ${fmtNum((t.rainSinceMm / 10) * 2, 1)}`
                  : "da allora non è piovuto"}
              </p>
              <p style={{ marginTop: 10, fontWeight: 650 }}>
                {t.remainingDays <= 0
                  ? "La copertura è già finita."
                  : t.exhaustedOn
                    ? `Con i ${fmtNum(t.rainNextMm)} mm previsti finisce ${fmtWhen(t.exhaustedOn)}.`
                    : "Regge anche con la pioggia prevista."}
              </p>
            </div>

            <h2 className="igm-h2" style={{ marginTop: 26 }}>
              Quando trattare
            </h2>
            <p style={{ borderTop: "2px solid var(--bistro)", paddingTop: 12, fontSize: 17 }}>
              {win ? (
                <>
                  Prima finestra asciutta: <b>{fmtWindow(win)}</b>.
                </>
              ) : (
                "Nessuna finestra asciutta di almeno 4 ore nelle prossime 36."
              )}
            </p>

            <h2 className="igm-h2" style={{ marginTop: 26 }}>
              Centraline
            </h2>
            <ul style={{ borderTop: "2px solid var(--bistro)" }}>
              {stations.length ? (
                stations.map((s) => (
                  <li
                    key={s.id}
                    style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)", fontSize: 15 }}
                  >
                    <b>{s.label}</b> · {s.status === "attiva" ? "attiva" : s.status.replace("_", " ")} ·{" "}
                    <span className="num">{fmtNum(s.temp_c, 1)} °C</span>
                  </li>
                ))
              ) : (
                <li style={{ padding: "8px 0", color: "var(--ink-3)" }}>
                  Vigneto d'esempio, senza centraline vere.
                </li>
              )}
            </ul>
          </aside>
        </div>
      </main>
      <ProtoBar dir="a" />
    </div>
  );
}
