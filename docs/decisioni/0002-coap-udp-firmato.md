# CoAP su UDP, payload binario firmato HMAC

Data: 2026-10-18 · Stato: decisa

## Contesto

Su NB-IoT ogni pacchetto tiene la radio accesa per secondi. Il vecchio protocollo testuale su TCP richiede almeno 6 scambi per invio e garantisce solo che i byte arrivino, non che siano salvati.

## Decisione

Messaggi CoAP confermabili (RFC 7252) costruiti dal firmware e spediti dal modem come semplice UDP. Payload binario (record da 14 byte, fino a 30 per pacchetto, sotto i 512 byte), firmato con HMAC-SHA256 troncato a 8 byte con una chiave per centralina. Il server risponde nello stesso scambio con l'ultima sequenza salvata, l'ora e l'eventuale nuova configurazione.

## Conseguenze

2 scambi radio per invio. Nessuna dipendenza dai comandi CoAP interni del SIM7020. Dati non cifrati (sono misure meteo); la cifratura AES del payload si può aggiungere senza cambiare il trasporto.
