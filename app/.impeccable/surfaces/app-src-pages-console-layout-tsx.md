---
version: 1
slug: "app-src-pages-console-layout-tsx"
primary_target: "app/src/pages/console/Layout.tsx"
related_targets: ["app/src/pages/console/Fleet.tsx","app/src/proto/b/Oggi.tsx","app/src/proto/b/Vigneto.tsx","app/src/index.css"]
---

# Superficie: app Vinai (console e area utenti)

Modalità: Operate. Pubblico: titolare (telefono, in vigna), agronomo (sera, telefono o computer), amministratore e tecnico (console, computer). Compito: decidere se e dove trattare; tenere in salute la flotta. Brief e intervista: docs/design/p3-direzioni.md.

## Direction contract

THESIS: Il trattamento come la mano di verderame che il viticoltore conosce: la protezione è una barra azzurra che i giorni e la pioggia consumano, messa contro le ore di rischio che arrivano. Rifiuta il semaforo generico e il cruscotto con le icone meteo.

OWN-WORLD: Fondo blu notte (oklch 0.19 0.03 240), pannelli appena più chiari, testata e barra di navigazione in verderame scuro. Azzurro solfato di rame = protezione e azione principale; vinaccia = rischio e guasto; ruggine = attenzione; verde foglia = tutto bene; grigio-azzurro chiaro = acqua. Hanken Grotesk, cifre tabellari. Pannelli arrotondati senza bordi, righe-tabella come pannelli separati, stati sempre con icona ed etichetta. Modalità campo a calce bianca con gli stessi ruoli.

STORY: Chi apre l'app legge una frase che risponde (tratta cosa, entro quando), vede per ogni vigneto quanta protezione resta e quando arriva il rischio, sceglie la finestra asciutta. L'amministratore vede per prime le centraline che non stanno bene, con la loro storia di 24 ore.

FIRST VIEWPORT: Testata verderame con marchio, contesto e interruttore campo. Sotto, la frase-risposta grande (fino a 2,5 rem), una riga di perché. Poi i vigneti come pannelli impilati, ciascuno con nome, stato, linea della protezione larga quanto il pannello e una riga di dettaglio; a destra (computer) il pannello "Quando trattare" con la finestra asciutta e i 3 giorni di pioggia. In console: titolo che dice quante centraline controllare, filtri a pillola, tabella a righe-pannello ordinate per urgenza, mappa scura a destra.

FORM: Verderame, mia candidata n. 1 su sette (scelta di Impeccable, non l'assegnata); seed:9340706a56995b10. Rialzi: righe vive ordinate per urgenza che cambiano stato senza spostare colonne (tabellone a palette); una geometria per vigneto (mappa del giardino zoologico); durata della bagnatura = lunghezza esatta (notazione Laban).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
