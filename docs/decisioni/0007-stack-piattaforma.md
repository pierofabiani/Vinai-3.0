# Stack della piattaforma: TypeScript, PostgreSQL + TimescaleDB, una web app con due aree

Data: 2026-10-19 · Stato: proposta

## Contesto

La piattaforma deve ricevere i pacchetti CoAP delle centraline, gestire aziende, utenti e installazioni, e mostrare i dati in una PWA moderna ma semplice. Il carico è minimo: 500 centraline con un invio all'ora fanno un pacchetto ogni 7 secondi. Il budget del server è circa 10 € al mese e il team di App Salad lavora in TypeScript. Il piano completo è in [`docs/piattaforma.md`](../piattaforma.md).

## Decisione

- **Un monorepo TypeScript** (pnpm + Turborepo) con quattro processi: `ingest` (CoAP), `api` (Hono), `worker` (pg-boss) e `models` (Python, senza accesso in scrittura al database).
- **PostgreSQL 17 + TimescaleDB + PostGIS** come unico archivio. Le misure stanno in hypertable con chiave `(station_id, seq)`, che garantisce l'idempotenza. Medie orarie e giornaliere sono aggregati continui. Niente Redis e niente code esterne: pg-boss usa PostgreSQL.
- **Better Auth** per gli account: link via email e passkey, aziende con ruoli e inviti.
- **Una sola web app React** (Vite, TanStack Router e Query) con l'area utenti e l'area `/console`. Hanno in comune design system, grafici e mappa; il codice della console si carica solo per chi ha il ruolo giusto.
- **Design con Impeccable**: `PRODUCT.md` e `DESIGN.md` nel repository, componenti shadcn/ui ridisegnati, Tailwind v4, uPlot per i grafici e MapLibre per la mappa 3D.
- **Docker Compose su un VPS europeo**, con Caddy per HTTPS.

## Alternative scartate

- **Supabase o Firebase**: un servizio gestito comodo, ma la porta UDP CoAP va ospitata comunque altrove. Si dipenderebbe da un fornitore per auth e dati, e i costi crescono con le righe delle misure. Il vecchio sistema era su Supabase; i dati storici si importano una volta.
- **InfluxDB o un altro database di serie temporali separato**: un secondo archivio da tenere allineato con utenti e aziende. Timescale tiene tutto in PostgreSQL con SQL normale.
- **MQTT broker**: non serve, le centraline parlano CoAP (nota 0002).
- **Next.js**: il rendering lato server non porta vantaggi a una PWA dietro login che deve funzionare offline; Vite è più semplice da servire come file statici.
- **App native iOS e Android**: due codebase e gli store; la PWA basta. L'unico limite è che su iPhone le notifiche push arrivano solo se l'app è aggiunta alla schermata Home.

## Conseguenze

Un solo linguaggio per server e web, un solo database da salvare, un solo `docker compose up` per avviare tutto in locale. Il codec del pacchetto esiste due volte, in C e in TypeScript: lo tengono allineati i vettori d'oro generati dal firmware e verificati nel CI.
