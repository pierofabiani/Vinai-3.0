import { useQuery } from "@tanstack/react-query";
import { Empty, ErrorBox, PageHeader, SkeletonRows } from "../../components/ui";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";

interface Mail {
  id: number;
  created_at: string;
  recipient: string;
  subject: string;
  body: string;
  link: string | null;
}

/** Ambiente di sviluppo e prova: le email non partono, si leggono qui. */
export function Outbox() {
  const mails = useQuery({
    queryKey: ["outbox"],
    queryFn: () => api<Mail[]>("/console/dev/outbox"),
    refetchInterval: 5000,
    retry: false,
  });
  return (
    <>
      <PageHeader
        title="Posta di prova"
        description="In sviluppo e prova le email non partono davvero: inviti e collegamenti di accesso finiscono qui."
      />
      {mails.error ? (
        <ErrorBox error={mails.error} />
      ) : mails.isPending ? (
        <SkeletonRows />
      ) : mails.data?.length ? (
        <ul className="grid gap-3">
          {mails.data.map((m) => (
            <li key={m.id} className="rounded-xl bg-panel p-4">
              <p className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium">{m.subject}</span>
                <span className="text-ink-3">
                  {m.recipient} · {dateTime(m.created_at)}
                </span>
              </p>
              <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-ink-2">{m.body}</pre>
              {m.link ? (
                <a href={m.link} className="mt-2 inline-block text-sm text-accent underline">
                  Apri il collegamento
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Nessuna email" />
      )}
    </>
  );
}
