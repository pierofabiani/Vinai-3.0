// Indice dei prototipi: le due direzioni, le tre schermate, i tre formati di azienda.
import { useProtoData } from "./data";

const DIRS = [
  {
    id: "a",
    name: "A · Carta IGM",
    line: "Carta chiara, pensata per il sole del mattino. I vigneti sono disegnati col segno cartografico, che si infittisce e diventa rosso col rischio. La bagnatura è disegnata come acqua.",
  },
  {
    id: "b",
    name: "B · Verderame",
    line: "Blu notte, per decidere la sera il trattamento di domani, più una modalità campo chiara. La protezione è una barra color verderame che la pioggia consuma, a confronto con le ore di rischio che arrivano.",
  },
];

export function ProtoIndex() {
  const { data } = useProtoData();
  const first = data?.vineyards.find((v) => !v.synthetic)?.id ?? "";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Vinai · due direzioni visive</h1>
      <p className="mt-2 text-ink-2">
        Stessi dati, stesse schermate, due mondi. Le misure vengono dal simulatore; pioggia, previsioni,
        rischio e trattamenti sono d'esempio. Il brief completo è in docs/design/p3-direzioni.md.
      </p>
      {DIRS.map((d) => (
        <section key={d.id} className="mt-8 border-t border-line pt-5">
          <h2 className="text-lg font-semibold">{d.name}</h2>
          <p className="mt-1 max-w-[65ch] text-ink-2">{d.line}</p>
          <ul className="mt-3 grid gap-1.5">
            <li>
              Oggi:{" "}
              <a className="underline" href={`/prototipi/${d.id}/oggi?n=3`}>
                3 vigneti
              </a>{" "}
              ·{" "}
              <a className="underline" href={`/prototipi/${d.id}/oggi?n=1`}>
                1
              </a>{" "}
              ·{" "}
              <a className="underline" href={`/prototipi/${d.id}/oggi?n=14`}>
                14
              </a>
            </li>
            <li>
              <a className="underline" href={`/prototipi/${d.id}/vigneto/${first}?n=3`}>
                Vigneto
              </a>
            </li>
            <li>
              <a className="underline" href={`/prototipi/${d.id}/flotta`}>
                Console › Flotta
              </a>
            </li>
          </ul>
        </section>
      ))}
    </main>
  );
}
