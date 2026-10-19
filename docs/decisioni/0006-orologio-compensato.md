# Orologio interno compensato in software

Data: 2026-10-19 · Stato: decisa

## Contesto

Il quarzo da 32 kHz è stato rimosso dal fornitore: l'orologio gira sull'oscillatore RC interno, che può sbagliare di diversi punti percentuali.

## Decisione

Ogni risposta del server porta l'ora vera. Da due sincronizzazioni distanti almeno mezz'ora la centralina stima quanto corre il suo orologio (rapporto tra 0,70 e 1,30, media mobile) e converte di conseguenza attese e orari. Con il quarzo il rapporto resta 1.

## Conseguenze

Misure ogni 10 minuti veri e orari corretti entro un minuto anche con un orologio sbagliato del 12% (verificato in simulazione). Per le schede nuove conviene rimontare il quarzo: l'impronta c'è e consuma circa un microampere.
