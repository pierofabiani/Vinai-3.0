# Misure salvate in flash, cancellate solo dopo la conferma del server

Data: 2026-10-18 · Stato: decisa

## Contesto

Il vecchio firmware teneva misure e configurazione solo in RAM: ogni reset le perdeva.

## Decisione

Ogni misura va subito in un registro circolare nella flash del PIC (48 KB, circa 16 giorni a 10 minuti) con numero di sequenza e CRC. La centralina considera inviata una misura solo quando il server conferma di averla salvata. Il server scarta i duplicati per (centralina, sequenza). Stato e configurazione stanno nella EEPROM, in copie doppie con CRC.

## Conseguenze

Nessuna misura persa per guasti di rete, server o reset; si perde solo ciò che supera la capacità della flash, e il server sa quante misure mancano.
