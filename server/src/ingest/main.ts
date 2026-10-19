// Porta radio: riceve i pacchetti CoAP delle centraline (UDP 5683) e risponde con la conferma.
import coap from "coap";
import { connect, type Sql } from "../lib/db.js";
import { loadEnv } from "../lib/env.js";
import { parseMasterKey } from "../lib/keys.js";
import { handleUplink, type IngestContext } from "./uplink.js";

export interface IngestOptions {
  sql?: Sql;
  port?: number;
  log?: (msg: string) => void;
}

export function startIngest(opts: IngestOptions = {}) {
  const env = loadEnv();
  const ownSql = !opts.sql;
  const sql = opts.sql ?? connect(env.DATABASE_URL);
  const ctx: IngestContext = {
    sql,
    master: parseMasterKey(env.STATION_KEY_SECRET),
    now: () => new Date(),
    log: opts.log ?? ((m) => console.log(`[ingest] ${m}`)),
  };
  // Il salvataggio richiede qualche millisecondo: la risposta resta allegata all'ACK
  // (un solo scambio radio) finché arriva entro 3 secondi.
  const server = coap.createServer({ type: "udp6", piggybackReplyMs: 3000 });
  server.on("request", (req, res) => {
    const path = req.url.split("?")[0];
    if (path !== "/m" || req.method !== "POST") {
      res.code = "4.04";
      res.end();
      return;
    }
    const src = { address: req.rsinfo.address.replace(/^::ffff:/, ""), port: req.rsinfo.port };
    void handleUplink(ctx, new Uint8Array(req.payload), src).then((out) => {
      res.code = out.reply.code;
      res.end(out.reply.code === "2.04" ? Buffer.from(out.reply.payload) : undefined);
    });
  });
  const port = opts.port ?? env.COAP_PORT;
  const ready = new Promise<void>((resolve) => server.listen(port, () => resolve()));
  void ready.then(() => ctx.log(`CoAP in ascolto su UDP ${port}`));
  const stop = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (ownSql) await sql.end();
  };
  return Object.assign(stop, { ready });
}

if (import.meta.url === `file://${process.argv[1]}`) startIngest();
