# Stessa scheda Hive, firmware riscritto da zero

Data: 2026-10-18 · Stato: decisa

## Contesto

Le schede Hive Rev 1.1 sono già prodotte e funzionano dal punto di vista hardware (componenti adatti, PIC con 256 KB di flash di cui il vecchio firmware usa 33 KB). Il firmware V1.14 del fornitore ha invece difetti strutturali: nessun watchdog, dati solo in RAM, byte scartati in trasmissione, INTERVAL ignorato, modem riacceso a ogni invio.

## Decisione

Si tiene la scheda e si riscrive il firmware da zero, senza derivare dal codice del fornitore (di cui abbiamo solo i `.hex`). Tutte le centraline sono in laboratorio: si riprogrammano al banco con il PICkit 4, senza compatibilità con il vecchio protocollo.

## Conseguenze

Nessun costo hardware. Serve ricavare la mappa dei pin dal vecchio firmware e verificarla al banco (fase A1).
