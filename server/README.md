# Server

Ricezione dei pacchetti dalle centraline, API per l'app, console di gestione. TypeScript su Node.js, PostgreSQL con TimescaleDB.

Piano dettagliato, stack e fasi: [`docs/piattaforma.md`](../docs/piattaforma.md).

## Stato (fase P1)

| Parte | Cosa fa |
| --- | --- |
| `src/ingest` | CoAP su UDP 5683, `POST /m`: salva il pacchetto grezzo, verifica la firma, salva misure e salute in una transazione, risponde con conferma firmata, ora del server ed eventuale configurazione. Errori: `4.00` formato, `4.01` sconosciuta o firma, `5.03` database |
| `src/stations` | provisioning (chiave nuova, cifrata con `STATION_KEY_SECRET`), configurazioni remote versionate |
| `migrations/` | schema TimescaleDB: `station`, `measurement` (hypertable), `health`, `raw_packet`, `config_version`, aggregati `measurement_1h` e `measurement_1d` |
| `src/sim` | simulatore di flotta: centraline finte che seguono le regole del firmware e parlano con l'ingest vero via UDP |
| `src/api` | `GET /api/health` |
| `src/worker` | coda pg-boss avviata, nessun job ancora |

Regole dell'ingest: [nota 0008](../docs/decisioni/0008-regole-ingest.md).

## Comandi

```
pnpm dev                       # dalla radice: database, migrazioni, api, ingest, worker, web
pnpm --filter @vinai/server db:migrate
pnpm --filter @vinai/server sim --stations 50 --days 7 --loss 0.05 --ack-loss 0.05
pnpm --filter @vinai/server test   # serve il database di sviluppo: crea e usa vinai_test
```

Il simulatore va lanciato con `pnpm dev` acceso. Riempie il database di sviluppo con dati realistici (anche per l'app) e alla fine confronta misure generate e salvate. Per un secondo giro serve un'altra serie di IMEI: `--imei-base 991000000000000`.

In produzione i processi girano separati, dopo `pnpm build`: `start:migrate`, poi `start:api`, `start:ingest`, `start:worker`.

## Da costruire (traccia B del piano)

1. **Ricezione CoAP**: fatta in P1 (vedi sopra).
2. **Database**: centraline, aziende, vigneti, utenti e ruoli, configurazioni (desiderata e confermata), misure, salute, pacchetti grezzi, osservazioni di campo, trattamenti.
3. **API** per l'app: autenticazione con link via email e passkey, permessi per ruolo e per azienda.
4. **Console di gestione**: flotta, scheda centralina, configurazioni, firmware, laboratorio, allarmi, aziende e utenti.
5. **Connettori dati esterni**: pioggia dal radar, previsioni, bollettini fitosanitari.

Regola: una versione di configurazione presente in `health.cfg_rejected` non va più reinviata.
