# APN, bande e operatore configurabili, con ritorno automatico

Data: 2026-10-19 · Stato: decisa

## Contesto

NB-IoT in roaming lo vendono pochi fornitori; oggi si usa 1NCE. Cambiare fornitore non deve richiedere di riprogrammare le schede, ma un APN sbagliato inviato da remoto non deve isolare una centralina.

## Decisione

APN, bande NB-IoT e operatore fanno parte della configurazione remota. Una configurazione di rete diventa "collaudata" solo dopo un invio riuscito iniziato con essa. Dopo 3 tentativi falliti di fila con una configurazione non collaudata, la centralina torna all'ultima collaudata e riporta la versione annullata in `health.cfg_rejected`; il server non deve reinviarla.

## Conseguenze

Cambiare fornitore = nuova SIM + tre valori. Un errore di configurazione costa al massimo qualche ora di ritardo nei dati.
