// Componenti di base, nel mondo Verderame (DESIGN.md). Un solo vocabolario: stesso bottone, stessi campi,
// stessi stati. Pannelli arrotondati senza bordo; le righe delle tabelle sono pannelli separati.
import {
  AlertTriangle,
  Archive,
  BatteryLow,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  type LucideIcon,
  WifiOff,
} from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import type { FleetStatus } from "../lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  busy,
  icon: Icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-accent-ink hover:brightness-110 active:brightness-95",
        variant === "secondary" && "bg-panel-2 text-ink hover:bg-line-soft",
        variant === "ghost" && "text-ink-2 hover:bg-panel-2 hover:text-ink",
        variant === "danger" && "bg-bad/12 text-ink hover:bg-bad/22 [&_svg]:text-bad",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="size-4" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-ink-2">{label}</span>
      {children}
      {error ? (
        <span className="text-bad">{error}</span>
      ) : hint ? (
        <span className="text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

const control =
  "h-10 w-full rounded-lg border border-line bg-bg px-3 text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-ink-3 focus:border-focus focus:outline-none disabled:opacity-50";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(control, className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(control, "pr-8", className)}>
      {children}
    </select>
  );
}

export const STATUS: Record<
  FleetStatus,
  { label: string; tone: "ok" | "warn" | "bad" | "neutral"; icon: LucideIcon }
> = {
  attiva: { label: "Attiva", tone: "ok", icon: CheckCircle2 },
  in_ritardo: { label: "In ritardo", tone: "warn", icon: Clock },
  muta: { label: "Muta da 3 ore", tone: "bad", icon: WifiOff },
  batteria_bassa: { label: "Batteria bassa", tone: "warn", icon: BatteryLow },
  sensore_guasto: { label: "Sensore guasto", tone: "bad", icon: AlertTriangle },
  mai_collegata: { label: "Mai collegata", tone: "neutral", icon: CircleDashed },
  dismessa: { label: "Dismessa", tone: "neutral", icon: Archive },
};

const toneText = { ok: "text-ok", warn: "text-warn", bad: "text-bad", neutral: "text-neutral" } as const;

/** Stato con icona ed etichetta: mai il colore da solo. */
export function StatusLabel({ status, compact }: { status: FleetStatus; compact?: boolean }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <s.icon className={cx("size-4 shrink-0", toneText[s.tone])} aria-hidden />
      <span className={compact ? "sr-only" : "text-ink"}>{s.label}</span>
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full bg-panel-2 px-2 py-0.5 text-xs font-medium text-ink",
        tone === "neutral" ? "" : "before:size-1.5 before:rounded-full before:bg-current",
        tone === "neutral" ? "" : toneText[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 max-w-[70ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mt-8", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl bg-panel", className)}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-[60ch] text-sm text-ink-2">{children}</div> : null}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-bad/12 px-3 py-2 text-sm text-ink">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-panel", className)} aria-hidden />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-2" aria-busy="true" aria-label="Caricamento">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-y-1 text-sm [&_td]:h-11 [&_td]:bg-panel [&_td]:whitespace-nowrap [&_td]:px-3 [&_td:first-child]:rounded-l-lg [&_td:last-child]:rounded-r-lg [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink-3 [&_td]:transition-colors [&_tbody_tr:hover_td]:bg-panel-2 [&_tr[data-tone=bad]_td]:bg-(--bad-row) [&_tr[data-tone=warn]_td]:bg-(--warn-row) [&_td]:duration-200">
        {children}
      </table>
    </div>
  );
}

/** Coppie etichetta-valore, per le schede. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export { cx };
