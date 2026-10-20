# App

Una sola web app: area utenti (PWA) e area `/console` per amministratore e tecnici. TypeScript, React, TanStack Router e Query, Tailwind v4, MapLibre, uPlot. Accesso con Better Auth (collegamento via email, passkey).

## Stato (fase P2)

| Percorso | Cosa c'è |
| --- | --- |
| `/accesso` | collegamento via email o passkey |
| `/invito/:token` | invito a un'azienda; entrando con il collegamento si accetta da solo |
| `/` | ingresso: con un'azienda si va dritti al suo Oggi, con più aziende si sceglie |
| `/a/:azienda` | **Oggi**: la frase-risposta, i vigneti dal più urgente con la linea della protezione, quando trattare e la pioggia dei prossimi giorni |
| `/a/:azienda/vigneto/:id` | **Vigneto**: protezione, perché del rischio, 7 giorni e 3 di previsione, trattamenti, osservazioni da confermare, centraline |
| `/profilo` | nome, passkey (aggiungi, rimuovi), uscita |
| `/c/:imei` | installazione dal QR sul telefono del tecnico: azienda, vigneto, posizione GPS, foto, nota |
| `/console` | **Panoramica** del rivenditore: clienti dal più urgente, accesso alla loro area |
| `/console/flotta` | flotta: filtri per stato, mappa, tabella |
| `/console/centraline/:id` | scheda: dati, grafici di 7 giorni, configurazione remota, pacchetti, registro di laboratorio, QR |
| `/console/laboratorio` | registrazione delle schede (chiave mostrata una volta), collaudo, etichette con QR (`/console/etichette`) |
| `/console/aziende` | aziende, persone, inviti, vigneti |
| `/console/utenti`, `/registro`, `/posta` | solo amministratore |

L'aspetto è **provvisorio**: token in `src/index.css`, componenti in `src/components/ui.tsx`. La direzione visiva vera si sceglie in P3 con Impeccable e sostituisce i token in un solo punto. Le regole già seguite: stato sempre con icona ed etichetta, una serie per grafico con tabella dei valori, tutto verificato a 375 e 1440 px, tema chiaro e scuro dal sistema.

## Prototipi di design (P3)

`/prototipi`: le due direzioni visive candidate (Carta IGM e Verderame) per Oggi, Vigneto e Console › Flotta, su un'istantanea dei dati del simulatore (`public/prototipi/dati.json`, generata da `pnpm --filter @vinai/server proto:dati`). Codice in `src/proto/`, stili chiusi in `.igm` e `.vrd`, caricati solo su quelle pagine. Brief e scelte: `docs/design/p3-direzioni.md`. Dopo la scelta i prototipi diventano le schermate vere e questa cartella si toglie.

## Prove nel browser

```
pnpm --filter @vinai/app e2e
```

Con `pnpm dev` acceso e `BOOTSTRAP_ADMIN_EMAIL` in `.env`. I collegamenti di accesso si leggono dalla posta di prova nel database; la passkey usa un autenticatore virtuale. Schermate in `app/e2e/screenshots/`.

Per provarla da un altro computer quando gira su questo server: `ssh -L 5173:localhost:5173 utente@server`, poi http://localhost:5173 (le passkey richiedono `localhost` o HTTPS).
