// Barra dei prototipi: direzione, schermata, numero di vigneti. Sempre visibile, perché tutto
// ciò che c'è sotto è un prototipo con dati d'esempio.
import { Link, useLocation } from "@tanstack/react-router";
import { useScale } from "./data";

export function ProtoBar({ dir }: { dir: "a" | "b" }) {
  const loc = useLocation();
  const n = useScale();
  const screen = loc.pathname.includes("/flotta")
    ? "flotta"
    : loc.pathname.includes("/vigneto")
      ? "vigneto"
      : "oggi";
  const other = dir === "a" ? "b" : "a";
  const otherPath = loc.pathname.replace(`/prototipi/${dir}`, `/prototipi/${other}`);
  return (
    <nav className="protobar" aria-label="Prototipi">
      <span className="protobar-tag">Prototipo · dati d'esempio</span>
      <Link to="/prototipi" className="protobar-link">
        Direzione {dir.toUpperCase()}
      </Link>
      <a href={`${otherPath}?n=${n}`} className="protobar-link">
        Vedi {other.toUpperCase()}
      </a>
      {screen !== "flotta" ? (
        <span className="protobar-scale" role="group" aria-label="Vigneti dell'azienda">
          {[1, 3, 14].map((k) => (
            <a key={k} href={`${loc.pathname}?n=${k}`} aria-current={k === n ? "true" : undefined}>
              {k}
            </a>
          ))}
          <span className="sr-only">vigneti</span>
        </span>
      ) : null}
    </nav>
  );
}
