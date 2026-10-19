# Server

Ricezione dei pacchetti dalle centraline, API per l'app, console di gestione. TypeScript su Node.js, PostgreSQL con TimescaleDB.

Piano dettagliato, stack e fasi: [`docs/piattaforma.md`](../docs/piattaforma.md).

## Stato (fase P0)

| Ingresso | Cosa fa oggi |
| --- | --- |
| `src/api` | Hono su `127.0.0.1:8787`, rotta `GET /api/health` con le versioni di PostgreSQL, TimescaleDB e PostGIS |
| `src/ingest` | CoAP su UDP 5683; a `POST /m` risponde 5.03 senza salvare, così una centralina vera tiene le misure in flash |
| `src/worker` | avvia la coda pg-boss |

In sviluppo `src/dev.ts` li avvia tutti e tre nello stesso processo (`pnpm dev` dalla radice). In produzione girano separati: `pnpm start:api`, `start:ingest`, `start:worker` dopo `pnpm build`.

## Da costruire (traccia B del piano)

1. **Ricezione CoAP** (porta 5683/UDP): verifica della firma HMAC con la chiave della centralina, salvataggio idempotente per (centralina, sequenza), salvataggio del pacchetto grezzo, risposta con ultima sequenza salvata, ora e configurazione. Il formato è in [`firmware/src/core/packet.h`](../firmware/src/core/packet.h): i vettori di test del firmware vanno riusati qui.
2. **Database**: centraline, aziende, vigneti, utenti e ruoli, configurazioni (desiderata e confermata), misure, salute, pacchetti grezzi, osservazioni di campo, trattamenti.
3. **API** per l'app: autenticazione con link via email e passkey, permessi per ruolo e per azienda.
4. **Console di gestione**: flotta, scheda centralina, configurazioni, firmware, laboratorio, allarmi, aziende e utenti.
5. **Connettori dati esterni**: pioggia dal radar, previsioni, bollettini fitosanitari.

Regola: una versione di configurazione presente in `health.cfg_rejected` non va più reinviata.
