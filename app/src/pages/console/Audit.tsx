import { useQuery } from "@tanstack/react-query";
import { ErrorBox, PageHeader, SkeletonRows, Table } from "../../components/ui";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";

interface Entry {
  time: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  email: string | null;
}

export function Audit() {
  const log = useQuery({ queryKey: ["audit"], queryFn: () => api<Entry[]>("/console/audit") });
  return (
    <>
      <PageHeader
        title="Registro delle azioni"
        description="Le ultime 200 azioni fatte dalla console e dall'app: chi, cosa, quando."
      />
      <ErrorBox error={log.error} />
      {log.isPending ? (
        <SkeletonRows />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Chi</th>
              <th>Azione</th>
              <th>Dettagli</th>
            </tr>
          </thead>
          <tbody>
            {log.data?.map((e, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap text-ink-2 num">{dateTime(e.time)}</td>
                <td>{e.email ?? "sistema"}</td>
                <td className="font-mono text-xs">{e.action}</td>
                <td className="max-w-[50ch] truncate font-mono text-xs text-ink-3">
                  {[e.target, e.detail && Object.keys(e.detail).length ? JSON.stringify(e.detail) : null]
                    .filter(Boolean)
                    .join(" ")}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
