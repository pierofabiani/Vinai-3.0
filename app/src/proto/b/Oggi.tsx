// Direzione B · Verderame · Oggi: la sera si decide la mattina. Per ogni vigneto, quanta protezione resta
// contro il rischio che arriva.
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  byWhen,
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
  summarize,
  useProtoData,
  useScale,
  type Vineyard,
} from "../data";
import { ProtoBar } from "../ProtoBar";
import { FieldToggle, Legend, ProtectionLine, VrdShell, VrdState } from "./parts";

export function useField() {
  const [on, set] = useState(() => new URLSearchParams(location.search).get("campo") === "1");
  return { on, set };
}

export function OggiB() {
  const { data } = useProtoData();
  const n = useScale();
  const field = useField();
  const vs = useMemo(() => (data ? pick(data, n) : []), [data, n]);
  if (!data) return <div className="vrd" />;
  const now = new Date(data.generatedAt).getTime();
  const s = summarize(vs, now);
  const lead = s.lead;
  const firstBy = s.treat[0]?.advice.by;
  return (
    <div className="vrd" data-campo={field.on}>
      <VrdShell
        org={`${data.organization.name} · ${fmtDay(data.generatedAt)}, ore ${fmtTime(data.generatedAt)}`}
        right={<FieldToggle on={field.on} set={field.set} />}
      />
      <main className="vrd-wrap">
        <section className="vrd-answer" style={{ marginTop: 28 }}>
          <h1>
            {s.treat.length
              ? `${capital(firstBy ? byWhen(firstBy, now) : "appena puoi")}: tratta ${
                  s.treat.length <= 2 ? s.treat.map((v) => v.name).join(" e ") : `${s.treat.length} vigneti`
                }.`
              : `${s.headline}.`}
          </h1>
          {lead ? (
            <p>
              {lead.name}: la protezione {lead.treatment.remainingDays > 0 ? "sta finendo" : "è finita"} e{" "}
              {DISEASE[lead.advice.disease].toLowerCase()} è a rischio{" "}
              {LEVEL[lead.risk[lead.advice.disease].level]}. {lead.risk[lead.advice.disease].why}
            </p>
          ) : (
            <p>Tutti i vigneti sono coperti o senza condizioni da infezione per i prossimi 3 giorni.</p>
          )}
        </section>

        <div className="vrd-grid">
          <div>
            <h2 className="vrd-h2">Protezione e rischio, vigneto per vigneto</h2>
            <Legend />
            {[...s.treat, ...s.check, ...(vs.length > 6 ? [] : s.ok)].map((v) => (
              <Row key={v.id} v={v} now={now} />
            ))}
            {vs.length > 6 && s.ok.length ? (
              <details className="vrd-row" style={{ display: "block" }}>
                <summary className="vrd-summary">
                  <ChevronRight className="vrd-chevron" size={18} aria-hidden />
                  <VrdState a="ok">Coperti e senza rischio · {s.ok.length} vigneti</VrdState>
                </summary>
                <p style={{ marginTop: 8, color: "var(--ink-2)" }}>{s.ok.map((v) => v.name).join(", ")}.</p>
              </details>
            ) : null}
          </div>
          <aside className="vrd-aside">
            <Window lead={lead ?? vs[0]} window={s.window} />
          </aside>
        </div>
        <p className="vrd-note">
          Prototipo. Le misure vengono dal simulatore; pioggia, previsioni, rischio e trattamenti sono
          d'esempio (regole semplificate, non i modelli validati con l'agronomo). Vinai consiglia: la
          decisione di trattare resta tua.
        </p>
      </main>
      <ProtoBar dir="b" />
    </div>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ v, now }: { v: Vineyard; now: number }) {
  const navigate = useNavigate();
  const r = v.risk[v.advice.disease];
  return (
    <a
      className="vrd-row"
      href={`/prototipi/b/vigneto/${v.id}`}
      onClick={(e) => {
        e.preventDefault();
        navigate({ to: "/prototipi/b/vigneto/$id", params: { id: v.id }, search: (p) => ({ n: p.n }) });
      }}
    >
      <span>
        <span className="vrd-row-name">{v.name}</span> <span className="vrd-row-sub">{v.variety}</span>
      </span>
      <VrdState a={v.advice.action} />
      <span className="vrd-row-line">
        <ProtectionLine v={v} now={now} />
      </span>
      <span className="vrd-row-why">
        {v.advice.action === "ok"
          ? "Nessuna condizione da infezione"
          : `${DISEASE[v.advice.disease]}, rischio ${LEVEL[r.level]}`}{" "}
        · {coverText(v, now)}
      </span>
    </a>
  );
}

function Window({
  lead,
  window,
}: {
  lead: Vineyard | undefined;
  window: { from: string; to: string } | null;
}) {
  if (!lead) return null;
  const days = nextDays(lead);
  return (
    <div className="vrd-panel">
      <h2 className="vrd-h2">Quando trattare {lead.name}</h2>
      <p className="vrd-window num">{window ? capital(fmtWindow(window)) : "Nessuna finestra asciutta"}</p>
      <p style={{ color: "var(--ink-2)", fontSize: 14.5, marginBottom: 14 }}>
        {window
          ? "Prima finestra di almeno 4 ore senza pioggia."
          : "Nelle prossime 36 ore non c'è una finestra di 4 ore senza pioggia."}
      </p>
      {days.map((d) => (
        <div key={d.t} className="vrd-day">
          <b>{fmtDay(d.t)}</b>
          <span className="vrd-raindrops" role="img" aria-label={`${fmtNum(d.rain)} mm di pioggia`}>
            {Array.from({ length: Math.min(14, Math.ceil(d.rain / 2)) }, (_, i) => (
              <i key={i} style={{ height: `${8 + ((i * 7) % 10)}px` }} />
            ))}
          </span>
          <span className="num" style={{ color: "var(--ink-2)" }}>
            {d.rain > 0 ? `${fmtNum(d.rain)} mm` : "asciutto"} · {fmtNum(d.tmin)}–{fmtNum(d.tmax)} °C
          </span>
        </div>
      ))}
    </div>
  );
}
