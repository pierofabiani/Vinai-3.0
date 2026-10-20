# Area clienti con un modello d'esempio dichiarato, finché non arrivano i modelli validati

Data: 2026-10-20 · Stato: decisa

## Contesto

Per provare la piattaforma con i clienti (e poi con la scheda vera) servono le schermate "Oggi" e "Vigneto" con dati reali. I modelli delle malattie della traccia D vanno scelti con l'agronomo, e il servizio di previsioni con licenza commerciale non è ancora scelto.

## Decisione

- **Modello d'esempio sul server** (`server/src/agro/model.ts`, nome `esempio-0`), con regole leggibili:
  - peronospora: ore di foglia bagnata per temperatura, pesate per la sensibilità della varietà;
  - oidio: ore tra 21 e 30 °C;
  - botrite: ore bagnate tra 15 e 25 °C.

  Ogni rischio porta il suo perché. Il nome e la nota del modello viaggiano in ogni risposta e l'app li mostra.
- **Protezione residua** dall'ultimo trattamento registrato: un giorno di copertura ogni 24 ore, più 2 giorni ogni 10 mm di pioggia. Senza trattamento registrato la protezione non si stima: non si inventa.
- **Pioggia passata stimata dalla bagnatura**: le centraline non hanno pluviometro (nota 0005), e un'ora quasi tutta bagnata con umidità oltre il 97% conta come pioggia. Si sostituirà con il radar.
- **Previsioni simulate** dietro un'interfaccia `ForecastProvider` (`server/src/agro/forecast.ts`). Il fornitore vero si aggiunge senza toccare le schermate.
- **Trattamenti e osservazioni** in tabelle proprie (migrazione 0004):
  - titolare, agronomo e collaboratore registrano, l'ospite solo legge;
  - le osservazioni le conferma l'agronomo o il titolare. Le osservazioni confermate sono i dati con cui calibrare i modelli veri.
- **Area clienti** su `/a/<azienda>` e `/a/<azienda>/vigneto/<id>`. La **Panoramica** del rivenditore è la prima pagina della console: clienti ordinati per urgenza, con l'accesso alla loro area così come la vedono.

## Conseguenze

Le schermate sono provabili ora, con dati veri delle centraline e trattamenti veri. Ogni consiglio resta però d'esempio, e lo dicono l'app e la panoramica. Sostituire il modello vuol dire cambiare `model.ts` (o affiancargli il servizio Python della traccia D) senza toccare api e app. Il simulatore ha una modalità dal vivo (`sim --live`) che tiene i dati dimostrativi aggiornati in tempo reale.
