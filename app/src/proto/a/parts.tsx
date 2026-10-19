// Pezzi della Direzione A (Carta IGM): segno cartografico del vigneto, stato, testata.
import { Link, useLocation } from "@tanstack/react-router";
import { Check, Eye, SprayCan } from "lucide-react";
import type { ReactNode } from "react";
import { ACTION, type Action, project, type Vineyard } from "../data";

/** Il segno "vigneto" della carta IGM: trattini verticali in filari. Più fitti e carminio col rischio. */
export function IgmDefs() {
  const pat = (id: string, w: number, h: number, color: string, sw: number) => (
    <pattern id={id} width={w} height={h} patternUnits="userSpaceOnUse">
      <line
        x1={w / 4}
        y1={1}
        x2={w / 4}
        y2={h / 2 - 1}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <line
        x1={(3 * w) / 4}
        y1={h / 2 + 1}
        x2={(3 * w) / 4}
        y2={h - 1}
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </pattern>
  );
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {pat("igm-ok", 10, 12, "var(--bosco)", 1.3)}
        {pat("igm-controlla", 8, 10, "var(--ocra)", 1.6)}
        {pat("igm-tratta", 6, 8, "var(--carminio)", 1.9)}
      </defs>
    </svg>
  );
}

export function Parcel({ v, size = 56 }: { v: Vineyard; size?: number }) {
  const f = project([v.parcel], size, size, 4);
  const d = `${v.parcel.map((p, i) => `${i ? "L" : "M"}${f(p)[0].toFixed(1)},${f(p)[1].toFixed(1)}`).join("")}Z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <path d={d} fill={`url(#igm-${v.advice.action})`} stroke="var(--bistro)" strokeWidth={1.2} />
    </svg>
  );
}

const ICON = { tratta: SprayCan, controlla: Eye, ok: Check };

export function IgmState({ a, children }: { a: Action; children?: ReactNode }) {
  const I = ICON[a];
  return (
    <span className="igm-state" data-a={a}>
      <I aria-hidden />
      {children ?? ACTION[a]}
    </span>
  );
}

export function IgmBand({
  org,
  right,
  console: isConsole,
}: {
  org: string;
  right?: ReactNode;
  console?: boolean;
}) {
  const loc = useLocation();
  return (
    <header className="igm-band">
      <div className="igm-band-in" style={isConsole ? { maxWidth: 1400 } : undefined}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <span className="igm-brand">Vinai</span>
          {isConsole ? (
            <nav className="igm-tabs" aria-label="Console" style={{ display: "flex", gap: 4 }}>
              {["Flotta", "Laboratorio", "Aziende", "Utenti"].map((t) => (
                <a
                  key={t}
                  href={t === "Flotta" ? loc.pathname : "#"}
                  aria-current={t === "Flotta" ? "page" : undefined}
                >
                  {t}
                </a>
              ))}
            </nav>
          ) : (
            <small>{org}</small>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}

export function BackToToday({ dir }: { dir: "a" | "b" }) {
  const loc = useLocation();
  const n = new URLSearchParams(loc.searchStr).get("n") ?? "3";
  return (
    <Link
      to={dir === "a" ? "/prototipi/a/oggi" : "/prototipi/b/oggi"}
      search={{ n }}
      className={dir === "a" ? "igm-back" : "vrd-back"}
    >
      ← Oggi
    </Link>
  );
}
