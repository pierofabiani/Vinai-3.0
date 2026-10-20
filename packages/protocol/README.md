# @vinai/protocol

Il protocollo tra centralina e server in TypeScript: uplink e downlink firmati (HMAC-SHA256 troncato a 8 byte), record delle misure, configurazione TLV, il CoAP minimo della centralina e l'epoca del 2020.

È lo specchio di `firmware/src/core/{packet,record,config,coap}.c`. Lo garantiscono i **vettori d'oro** in `vectors/firmware.json`, generati dal codice C del firmware (`make -C firmware vectors`). I test devono riprodurre quei byte esattamente; il CI del firmware controlla che il JSON sia aggiornato.

Chi lo usa:
- `server/src/ingest`: decodifica gli uplink e firma le risposte;
- `server/src/sim`: le centraline simulate costruiscono gli stessi datagrammi del firmware.

Se cambia il formato dei pacchetti: firmware, `make -C firmware vectors`, questo pacchetto, server e nota di decisione, tutto nella stessa modifica.
