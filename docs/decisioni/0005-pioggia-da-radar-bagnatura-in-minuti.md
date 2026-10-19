# Pluviometro rimosso; bagnatura fogliare misurata in minuti

Data: 2026-10-18 · Stato: decisa

## Contesto

Il pluviometro a bascula è la parte meccanica più delicata e costosa. Per le previsioni delle malattie, l'esperienza degli anni passati indica la bagnatura fogliare come dato più utile. Il vecchio firmware la leggeva una volta per intervallo e la riduceva a una scala 0-5.

## Decisione

La pioggia arriva da fonti esterne (radar della Protezione Civile, pluviometri regionali). La bagnatura (sensore capacitivo letto dal CTMU) si campiona ogni minuto e si salva come minuti bagnati nell'intervallo più la lettura grezza media; soglia, isteresi e polarità sono configurabili da remoto. L'ingresso del sensore Hall resta libero.

## Conseguenze

I temporali molto locali possono sfuggire ai dati a griglia: va verificato sui vigneti reali. La bagnatura registra comunque inizio e durata di ogni pioggia sul posto.
