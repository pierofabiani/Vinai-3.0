// Panoramica del rivenditore: una frase che dice dove intervenire oggi, poi i clienti dal più urgente,
// con vigneti da trattare, centraline con problemi e accesso alla loro area così come la vedono.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Eye, Radio, SprayCan } from "lucide-react";
import { Empty, ErrorBox, SkeletonRows, Table } from "../../components/ui";
import { api } from "../../lib/api";
import { ago } from "../../lib/format";

interface OverviewRow {
  id: string;
  name: string;
  region: string | null;
  province: string | null;
  members: number;
  vineyards: number;
  treat: number;
  check: number;
  ok: number;
  firstTreat: string | null;
  stations: number;
  stationProblems: number;
  neverSeen: number;
  lastData: string | null;
}

interface OverviewData {
  generatedAt: string;
  totals: {
    organizations: number;
    vineyards: number;
    treat: number;
    stations: number;
    stationProblems: number;
    unassigned: number;
  };
  organizations: OverviewRow[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Overview() {
  const q = useQuery({
    queryKey: ["overview"],
    queryFn: () => api<OverviewData>("/console/overview"),
    refetchInterval: 60_000,
  });
  const d = q.data;
  const t = d?.totals;
  const headline = !t
    ? "Panoramica"
    : t.treat || t.stationProblems
      ? [
          t.treat ? `${plural(t.treat, "vigneto", "vigneti")} da trattare` : null,
          t.stationProblems
            ? `${plural(t.stationProblems, "centralina", "centraline")} da controllare`
            : null,
        ]
          .filter(Boolean)
          .join(", ")
      : "Clienti e centraline in ordine";
  return (
    <>
      <header className="mb-5">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-tight text-balance">{headline}</h1>
        {t ? (
          <p className="mt-1 text-ink-2">
            {plural(t.organizations, "azienda cliente", "aziende clienti")},{" "}
            {plural(t.vineyards, "vigneto", "vigneti")}, {plural(t.stations, "centralina", "centraline")} in
            servizio.{" "}
            {t.unassigned ? (
              <>
                {plural(t.unassigned, "centralina non è assegnata", "centraline non sono assegnate")}:{" "}
                <Link to="/console/laboratorio" className="text-accent underline">
                  laboratorio
                </Link>
                .
              </>
            ) : null}
          </p>
        ) : null}
      </header>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <SkeletonRows />
      ) : !d?.organizations.length ? (
        <Empty title="Nessun cliente ancora">
          Crea la prima azienda dalla scheda{" "}
          <Link to="/console/aziende" className="underline">
            Aziende
          </Link>{" "}
          e invita il titolare.
        </Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Azienda</th>
              <th>Vigneti</th>
              <th>Centraline</th>
              <th>Ultimo dato</th>
              <th>
                <span className="sr-only">Azioni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.organizations.map((o) => (
              <tr key={o.id} data-tone={o.treat ? "bad" : o.stationProblems ? "warn" : undefined}>
                <td>
                  <Link
                    to="/console/aziende/$id"
                    params={{ id: o.id }}
                    className="font-semibold hover:underline"
                  >
                    {o.name}
                  </Link>
                  <span className="block text-xs text-ink-3">
                    {[o.province, o.region].filter(Boolean).join(", ") || "zona non indicata"} ·{" "}
                    {plural(o.members, "persona", "persone")}
                  </span>
                </td>
                <td>
                  {o.vineyards === 0 ? (
                    <span className="text-ink-3">nessuno</span>
                  ) : (
                    <span className="inline-flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm">
                      {o.treat ? (
                        <span
                          className="inline-flex items-center gap-1.5 font-semibold"
                          title={o.firstTreat ? `per primo: ${o.firstTreat}` : undefined}
                        >
                          <SprayCan className="size-4 text-bad" aria-hidden /> {o.treat} da trattare
                        </span>
                      ) : null}
                      {o.check ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Eye className="size-4 text-warn" aria-hidden /> {o.check} da controllare
                        </span>
                      ) : null}
                      {o.ok ? (
                        <span className="inline-flex items-center gap-1.5 text-ink-2">
                          <Check className="size-4 text-ok" aria-hidden /> {o.ok} bene
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="text-sm">
                  {o.stations === 0 ? (
                    <span className="text-ink-3">nessuna</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {o.stationProblems ? <Radio className="size-4 text-warn" aria-hidden /> : null}
                      {o.stations}{" "}
                      {o.stationProblems ? `· ${o.stationProblems} con problemi` : "· tutte bene"}
                      {o.neverSeen ? (
                        <span className="text-ink-3"> · {o.neverSeen} mai collegate</span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="text-ink-2 num">{o.lastData ? ago(o.lastData) : "—"}</td>
                <td className="text-right">
                  <Link
                    to="/a/$orgId"
                    params={{ orgId: o.id }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-panel-2 px-3 text-sm font-semibold hover:bg-line-soft"
                  >
                    Area cliente <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-4 text-[13px] text-ink-3">
        Vigneti da trattare secondo il modello d'esempio (non ancora validato con l'agronomo). Aggiornato ogni
        minuto.
      </p>
    </>
  );
}
