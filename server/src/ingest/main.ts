// Porta radio: riceve i pacchetti CoAP delle centraline (UDP 5683).
// Fase P0: il server risponde, ma non salva ancora nulla. Su /m risponde 5.03,
// così una centralina vera non riceve conferma e tiene le misure in flash.
// Decodifica, firma e salvataggio arrivano in P1 (docs/piattaforma.md, sezione 5).
import coap from "coap";
import { loadEnv } from "../lib/env.js";

export function startIngest() {
  const env = loadEnv();
  const server = coap.createServer({ type: "udp6" });
  server.on("request", (req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/m" && req.method === "POST") {
      console.log(
        `[ingest] pacchetto da ${req.rsinfo.address}: ${req.payload.length} byte (non ancora salvato)`,
      );
      res.code = "5.03";
      res.end();
      return;
    }
    res.code = "4.04";
    res.end();
  });
  server.listen(env.COAP_PORT, () => {
    console.log(`[ingest] CoAP in ascolto su UDP ${env.COAP_PORT}`);
  });
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}

if (import.meta.url === `file://${process.argv[1]}`) startIngest();
