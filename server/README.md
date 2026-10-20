# Server

Ricezione dei pacchetti dalle centraline, API per l'app, console di gestione. TypeScript su Node.js, PostgreSQL con TimescaleDB.

Piano dettagliato, stack e fasi: [`docs/piattaforma.md`](../docs/piattaforma.md).

## Stato (fase P2)

| Parte | Cosa fa |
| --- | --- |
| `src/ingest` | CoAP su UDP 5683, `POST /m`: salva il pacchetto grezzo, verifica la firma, salva misure e salute in una transazione, risponde con conferma firmata, ora del server ed eventuale configurazione. Errori: `4.00` formato, `4.01` sconosciuta o firma, `5.03` database |
| `src/auth` | Better Auth: collegamento via email, passkey, sessioni, ruoli globali; registrazione chiusa (nota 0009) |
| `src/orgs` | inviti alle aziende (token con impronta, 7 giorni), accettazione al primo accesso |
| `src/api` | `/api/auth/*`, `/api/me`, inviti, `/api/orgs/:id`, installazione da QR (`/api/install/:imei`), area clienti (`/api/orgs/:id/today`, `/api/vineyards/:id`, trattamenti, osservazioni), console (`/api/console/*`: panoramica, flotta, scheda, laboratorio, configurazione, aziende, vigneti, utenti, registro, posta di prova) |
| `src/agro` | modello d'esempio (rischio, protezione residua, consiglio, finestra asciutta), previsioni simulate, viste Oggi e Vigneto (nota 0010) |
| `src/console` | stato della flotta (attiva, in ritardo, muta da 3 ore, batteria bassa, sensore guasto, mai collegata) e scheda della centralina |
| `src/stations` | provisioning (chiave cifrata con `STATION_KEY_SECRET`), configurazioni remote versionate, controllo dell'IMEI |
| `migrations/` | 0001 misure (TimescaleDB), 0002 tabelle di Better Auth, 0003 aziende, inviti, vigneti, installazioni, registro di laboratorio e delle azioni, 0004 trattamenti e osservazioni |
| `src/sim` | simulatore di flotta e dati dimostrativi (`seed:demo`) |
| `src/worker` | coda pg-boss avviata, nessun job ancora |

Regole dell'ingest: [nota 0008](../docs/decisioni/0008-regole-ingest.md).

## Comandi

```
pnpm dev                       # dalla radice: database, migrazioni, api, ingest, worker, web
pnpm --filter @vinai/server db:migrate
pnpm --filter @vinai/server sim --stations 50 --days 7 --loss 0.05 --ack-loss 0.05
pnpm --filter @vinai/server test   # serve il database di sviluppo: crea e usa vinai_test
pnpm --filter @vinai/server posta  # ultime email della posta di prova (primo accesso)
pnpm --filter @vinai/server seed:demo --imei-base 992000000000000
```

Il simulatore va lanciato con `pnpm dev` acceso. Riempie il database di sviluppo con dati realistici (anche per l'app) e alla fine confronta misure generate e salvate. Per un secondo giro serve un'altra serie di IMEI: `--imei-base 991000000000000`.

In produzione i processi girano separati, dopo `pnpm build`: `start:migrate`, poi `start:api`, `start:ingest`, `start:worker`.

## Da costruire (traccia B del piano)

1. **Ricezione CoAP**: fatta in P1 (vedi sopra).
2. **Database**: fatto per centraline, aziende, vigneti, utenti e ruoli, configurazioni, misure, salute, pacchetti grezzi. Mancano osservazioni di campo e trattamenti (P4).
3. **API** per l'app: autenticazione e permessi fatti in P2; mancano le rotte dei dati per le schermate dell'app (P4).
4. **Console di gestione**: fatte flotta, scheda, configurazioni, laboratorio, aziende e utenti. Mancano firmware/OTA e allarmi (P5).
5. **Connettori dati esterni**: pioggia dal radar, previsioni, bollettini fitosanitari.

Regola: una versione di configurazione presente in `health.cfg_rejected` non va più reinviata.
