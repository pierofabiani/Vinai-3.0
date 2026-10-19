# Regole dell'ingest e schema delle misure

Data: 2026-10-19 · Stato: decisa

## Contesto

In P1 la porta radio passa dalla carta al codice e al simulatore di flotta. Alcune scelte del piano (`docs/piattaforma.md`) andavano precisate o corrette.

## Decisione

- **Errori con risposta, non silenzio.** Centralina sconosciuta o firma sbagliata ricevono `4.01`; un pacchetto malformato riceve `4.00`; il database non disponibile riceve `5.03`. Il silenzio farebbe ritrasmettere la centralina per 90 secondi con la radio accesa (4 tentativi CoAP), consumando la batteria per niente. Il firmware tratta 4.xx e 5.xx come invio fallito e tiene le misure in flash.
- **Conferma solo dopo il salvataggio.** Ordine: pacchetto grezzo, decodifica, transazione (misure, salute, centralina, configurazione), risposta. `acked_seq` è l'ultima sequenza del pacchetto, inviata solo a transazione conclusa.
- **Chiave delle misure `(station_id, time, seq)`.** TimescaleDB richiede la colonna del tempo in ogni vincolo unico. Un reinvio porta lo stesso record (stessa sequenza, stessa ora), quindi `ON CONFLICT DO NOTHING` su questa chiave scarta i doppioni.
- **Sensori guasti come `NULL`**, con i `flags` originali: mai numeri inventati. I record con orologio mai sincronizzato restano nella tabella ma sono esclusi dagli aggregati orari e giornalieri.
- **Migrazioni in SQL scritto a mano** (`server/migrations`), senza ORM: hypertable, compressione e aggregati continui sono SQL specifico di TimescaleDB. Le query usano `postgres` (postgres.js) con risultati tipizzati.
- **Configurazioni senza differenze non diventano versioni.** Il firmware ignora una configurazione vuota: una versione identica a quella in uso resterebbe "da inviare" per sempre. Se capita al momento dell'invio, la versione passa a "superata".
- **Dentro una transazione si usa la transazione.** Il simulatore ha trovato un blocco del pool: una query sul pool dentro una transazione aperta, con 6 pacchetti contemporanei, esauriva le 5 connessioni.

## Conseguenze

Prova di accettazione P1: 50 centraline simulate per 7 giorni, con il 5% di invii persi e il 5% di conferme perse, una centralina isolata per 3 giorni, un APN rifiutato e un cambio di intervallo. Risultato: 49.569 misure generate e 49.569 salvate, ogni pacchetto spedito presente tra i grezzi, la versione rifiutata mai reinviata. La stessa prova, ridotta a 12 centraline per 2 giorni, gira nel CI.
