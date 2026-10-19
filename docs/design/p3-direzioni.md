# P3 — Due direzioni visive per Oggi, Vigneto e Console › Flotta

Data: 2026-10-19 · Metodo: Impeccable (`shape` + `new-work`, modalità *Operate*) · Seme: `seed:9340706a56995b10`

Da qui escono **due prototipi navigabili** sugli stessi dati del simulatore. Ne scegli uno; dalla scelta nascono il contratto di direzione, i token e `DESIGN.md`. L'aspetto attuale della console (P2) è provvisorio: vale come prova di cosa evitare, non come punto di partenza.

## Come vederle

Con `pnpm dev` acceso: http://localhost:5173/prototipi. Dal tuo computer, quando gira sul server: `ssh -L 5173:localhost:5173 utente@server`. I dati si rigenerano con `pnpm --filter @vinai/server proto:dati`, le schermate con `pnpm --filter @vinai/app proto:schermate`.

| Schermata | A · Carta IGM | B · Verderame |
| --- | --- | --- |
| Oggi | `/prototipi/a/oggi?n=3` (anche `n=1`, `n=14`) | `/prototipi/b/oggi?n=3` (`&campo=1` per la modalità campo) |
| Vigneto | dal nome del vigneto in Oggi | dal nome del vigneto in Oggi |
| Console › Flotta | `/prototipi/a/flotta` | `/prototipi/b/flotta` |

## Brief

**Lavoro e pubblico.**
- **Titolare**, sul telefono, in vigna di mattina, col sole e magari i guanti: deve sapere *se* trattare e *dove*.
- **Agronomo**, al computer o al telefono, spesso la sera: confronta i vigneti e vuole il perché di ogni allarme.
- **Amministratore**, al computer: dalla Flotta controlla lo stato delle centraline.

**Esito.** Oggi risponde a "devo trattare, e dove?" in due secondi. Vigneto spiega il perché: bagnatura, temperatura, pioggia, ultimo trattamento e protezione rimasta. Flotta dice quali centraline non stanno bene.

**Cosa sappiamo dall'intervista.**
- Il numero di vigneti per azienda va da 1 a oltre 20: le schermate devono reggere entrambi gli estremi.
- L'ultimo trattamento e la protezione rimasta sono decisivi quanto il rischio.
- Da evitare: effetto videogioco, gestionale grigio, troppi numeri, aria da app meteo.

**Confini.**
- Prototipi ad alta fedeltà su dati simulati, non schermate finite.
- Il rischio malattie e i trattamenti sono **d'esempio**: lo dice ogni schermata.
- Pioggia e previsioni sono sintetiche, generate dallo stesso meteo del simulatore.
- Nessun numero senza fonte, nessun allarme senza perché, il colore mai da solo.
- Controlli standard del web: il mondo visivo porta solo tipografia, palette, densità e una mossa distintiva (regole della modalità *Operate*).

**Stati da coprire.** Rischio alto, medio e basso; protezione scaduta; una centralina muta; un sensore guasto; un'azienda con 1, 3 o 14 vigneti; i dati di ieri senza rete.

## Direzione A — Carta IGM *(assegnata dal sorteggio)*

- **Tesi.** I vigneti come li disegna la carta topografica IGM 1:25.000: ogni appezzamento è il suo segno cartografico di vigneto (trattini in filari), e il segno si colora col rischio. Rifiuta il cruscotto con le icone meteo.
- **Mondo.**
  - Fondo carta bianca, nero carta per il testo.
  - Bistro delle curve di livello per la struttura: barra di navigazione, righe, assi.
  - Verde bosco = tutto bene, azzurro idrografia = acqua (bagnatura e pioggia), carminio delle strade = rischio.
  - Atkinson Hyperlegible Next, scelto per leggere al sole; cifre tabellari.
- **Scena.** Mattina, in vigna, al sole: fondo chiaro.
- **Prima schermata (Oggi, telefono).**
  - In alto la risposta in una frase: "Tratta Le Coste entro domani".
  - Sotto, i vigneti come piccoli appezzamenti tratteggiati, ordinati per rischio, ognuno con la sua riga: malattia guida, motivo, ultimo trattamento.
  - Più in basso, una striscia di 3 giorni con pioggia prevista e bagnatura.
- **Mossa distintiva.** La campitura "vigneto" della carta, i cui trattini si infittiscono e diventano carminio col rischio. La bagnatura è disegnata come l'idrografia: tratti azzurri la cui lunghezza è esattamente la durata.
- **Rialzi dai rivali scartati** (con cosa resta di ciascuno):
  - *dalla notazione Laban*: ogni periodo di bagnatura è una barra lunga esattamente quanto è durato, sull'asse del tempo.
  - *dal web giapponese ad alta densità*: la Flotta osa la densità, con più centraline per schermo e righe da 32 px.
  - *dal folio botanico*: tutti i vigneti stanno sulla stessa scala e la stessa linea di base, per confrontarli a colpo d'occhio.
- **Rischio onesto.** Il riferimento cartografico può sembrare "tecnico" a chi non ha mai usato una carta IGM. Lo compensa una frase in alto che risponde subito.

## Direzione B — Verderame *(scelta di Impeccable)*

- **Tesi.** Il trattamento come la mano di verderame che il viticoltore conosce. Ogni vigneto mostra quanta "coperta azzurra" gli resta, consumata dai giorni e lavata dalla pioggia, contro il rischio che sale. Rifiuta il semaforo generico.
- **Mondo.**
  - Fondo blu notte, perché qui si decide la sera per la mattina dopo.
  - Azzurro solfato di rame = protezione.
  - Viola vinaccia = rischio, ruggine = attenzione, verde foglia = tutto bene.
  - Hanken Grotesk, cifre tabellari.
  - Modalità campo chiara a calce bianca.
- **Scena.** Sera, in cantina o a casa, si decide il trattamento di domani.
- **Prima schermata (Oggi, telefono).**
  - In alto la risposta.
  - Poi una riga per vigneto: a sinistra la barra azzurra della protezione che si accorcia giorno per giorno, a destra il rischio della malattia guida, e il punto in cui le due si incrociano è "da trattare".
  - Sotto, la pioggia prevista che "laverà" la protezione.
- **Mossa distintiva.** La protezione come barra di verderame che si erode. Le piogge passate e previste ne tolgono un pezzo visibile, segnato con data e millimetri.
- **Rialzi dai rivali scartati** (con cosa resta di ciascuno):
  - *dal tabellone a palette*: le righe della Flotta sono entità vive ordinate per urgenza, e un cambio di stato ridisegna la riga senza spostare le colonne.
  - *dalla mappa del giardino zoologico*: una sola geometria per vigneto, dal poligono sulla mappa al profilo nelle liste.
  - *dalla notazione Laban*: la durata della bagnatura in barre di lunghezza esatta.
- **Rischio onesto.** È l'idea più vicina al prodotto, quindi la più "familiare". E il fondo scuro va bilanciato con la modalità campo per l'uso al sole.

## Rivali sorteggiati e verdetti

| Rivale | Verdetto | Cosa resta |
| --- | --- | --- |
| Folio botanico per stagioni | scartato | stessa scala e stessa linea di base per confrontare (A) |
| Partitura Laban | scartato | durata = lunghezza esatta (A, B) |
| Web giapponese ad alta densità | scartato | coraggio della densità nella Flotta (A) |
| Mappa del giardino zoologico | scartato | una geometria per vigneto ovunque (B) |
| Copertina di musicassetta | scartato | nessuno: non porta né il pubblico né il compito |
| Tabellone a palette della stazione | scartato | righe vive che cambiano stato senza rompere la griglia (B) |

## Dopo la scelta

1. Contratto di direzione nel brief della superficie: tesi, mondo, storia, prima schermata, forma, seme.
2. Token definitivi, revisione finale (`impeccable-finish-reviewer`), `DESIGN.md` scritto dal costruito.
3. La console P2 passa al mondo scelto.
