---
name: Vinai
description: Centraline in vigna, una decisione sul trattamento. Mondo "Verderame": blu notte la sera, calce bianca al sole.
colors:
  notte: "oklch(0.19 0.03 240)"
  panel: "oklch(0.235 0.032 238)"
  panel-2: "oklch(0.27 0.034 236)"
  shell-verderame: "oklch(0.3 0.06 205)"
  shell-ink: "oklch(0.96 0.02 200)"
  line: "oklch(0.36 0.03 238)"
  line-soft: "oklch(0.3 0.03 238)"
  ink: "oklch(0.95 0.01 220)"
  ink-2: "oklch(0.8 0.02 220)"
  ink-3: "oklch(0.68 0.025 220)"
  verderame: "oklch(0.76 0.12 200)"
  verderame-ink: "oklch(0.2 0.03 240)"
  foglia: "oklch(0.78 0.15 140)"
  ruggine: "oklch(0.74 0.14 52)"
  vinaccia: "oklch(0.66 0.2 352)"
  grigio-azzurro: "oklch(0.7 0.03 230)"
  pioggia: "oklch(0.84 0.03 240)"
  focus: "oklch(0.82 0.1 200)"
  series-sera: "#5b97d3"
  grid: "oklch(0.3 0.03 238)"
  calce: "oklch(0.975 0.006 210)"
  calce-panel: "oklch(1 0 0)"
  calce-panel-2: "oklch(0.955 0.01 215)"
  calce-shell: "oklch(0.42 0.09 205)"
  calce-line: "oklch(0.82 0.02 220)"
  calce-ink: "oklch(0.2 0.03 240)"
  calce-ink-2: "oklch(0.36 0.03 240)"
  calce-ink-3: "oklch(0.46 0.03 240)"
  calce-verderame: "oklch(0.48 0.11 210)"
  calce-foglia: "oklch(0.52 0.15 145)"
  calce-ruggine: "oklch(0.58 0.15 50)"
  calce-vinaccia: "oklch(0.5 0.2 352)"
  series-campo: "#1f6cb0"
typography:
  display:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 1.25rem + 2vw, 2.5rem)"
    fontWeight: 720
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.verderame}"
    textColor: "{colors.verderame-ink}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.line-soft}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.notte}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  chip-filter:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "32px"
  chip-filter-active:
    backgroundColor: "{colors.verderame}"
    textColor: "{colors.verderame-ink}"
  tag:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "16px"
  table-row:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  shell:
    backgroundColor: "{colors.shell-verderame}"
    textColor: "{colors.shell-ink}"
    padding: "10px 16px"
  nav-tab-active:
    textColor: "{colors.shell-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
---

# Design System: Vinai

## Overview

**Creative North Star: "La mano di verderame"**

Il sistema prende il gesto che il viticoltore conosce meglio, la poltiglia azzurra di solfato di rame sulle foglie, e lo trasforma in grammatica visiva: la protezione è una barra azzurra che i giorni e la pioggia consumano, messa contro le ore di rischio che arrivano. Il fondo è blu notte perché la decisione sul trattamento di domani si prende la sera; al sole, in vigna, lo stesso mondo passa a calce bianca ad alto contrasto con gli stessi ruoli di colore (modalità campo, `html[data-campo="true"]`).

La densità è da strumento di lavoro, non da vetrina: pannelli piatti appena più chiari del fondo, nessun bordo, righe di tabella che sono pannelli separati, cifre tabellari ovunque ci sia un numero. Il colore porta significato e non decorazione: azzurro verderame vuol dire protezione e azione principale, vinaccia rischio e guasto, ruggine attenzione, verde foglia tutto bene. Ogni stato ha sempre anche un'icona e un'etichetta. Rifiuti confermati dalla direzione scelta: il semaforo generico e il cruscotto con le icone meteo.

La testata è una fascia verderame scura che regge marchio, contesto e interruttore sera/campo; sotto, il contenuto si legge dall'alto: prima la risposta, poi il dettaglio.

**Key Characteristics:**
- Tema scuro "sera" di default, modalità "campo" chiara con gli stessi ruoli e token omonimi.
- Un solo accento cromatico (verderame) per protezione e azione principale; i toni di stato sono semantici, mai decorativi.
- Superfici piatte, profondità per gradini tonali; nessun bordo sui pannelli.
- Righe-tabella come pannelli separati, colorate per gravità con miscele in oklab.
- Hanken Grotesk unica famiglia, cifre tabellari, monospazio solo per codici da copiare.
- Dispositivo firma: la linea della protezione (barra erosa dalla pioggia, tacche d'infezione, segno "adesso").

## Colors

Una notte blu-ardesia con un solo accento azzurro rame e quattro toni di stato semantici; in campo gli stessi ruoli su calce bianca. I token vivono in `app/src/index.css` come proprietà CSS (OKLCH, sorgente normativa) mappate a Tailwind v4 con `@theme inline` (`bg-panel`, `text-ink-2`, `bg-accent`...). I nomi nel codice sono di ruolo (`--accent`, `--bad`, `--warn`, `--ok`); qui li chiamiamo con il nome del mondo.

### Primary
- **Verderame** (`--accent`, sera `{colors.verderame}`, campo `{colors.calce-verderame}`): la protezione e l'azione principale. Bottone primario, filtro a pillola attivo, tessera del marchio, selezione del testo (35% su trasparente), `accent-color` dei controlli nativi, lampo di riga cambiata in flotta. Il testo sopra è sempre `--accent-ink` (blu notte in sera, quasi bianco in campo).
- **Testata verderame scura** (`--shell`, `{colors.shell-verderame}` / `{colors.calce-shell}`): la fascia della testata in console e in area utenti, con testo `--shell-ink`.

### Secondary
- **Vinaccia** (`--bad`, `{colors.vinaccia}` / `{colors.calce-vinaccia}`): rischio e guasto. Icone di stato "Muta", "Sensore guasto", "Da trattare"; testo d'errore nei campi; fondo del bottone `danger` e dell'`ErrorBox` al 12%. Nel dispositivo firma: le ore con condizioni da infezione.
- **Ruggine** (`--warn`, `{colors.ruggine}` / `{colors.calce-ruggine}`): attenzione. "In ritardo", "Batteria bassa", "Da controllare".
- **Verde foglia** (`--ok`, `{colors.foglia}` / `{colors.calce-foglia}`): tutto bene. "Attiva", "Tutto bene", esito "ok".

### Tertiary
- **Azzurro serie** (`--series`, `{colors.series-sera}` su pannello sera, `{colors.series-campo}` su bianco): l'unico colore dei grafici (uPlot) e delle micro-barre "Bagnatura 24 h". È acqua, non protezione: volutamente diverso dal verderame. Validato con il validatore di palette della skill dataviz sulle due superfici. La banda min-max usa `--series-wash` (16% in sera, 12% in campo).
- **Pioggia** (`--water`, `{colors.pioggia}`): grigio-azzurro chiaro per l'acqua nel mondo utenti (gocce dei giorni di pioggia nei prototipi, come `--pioggia`). Definito in app ma non ancora usato da nessun componente dell'app.

### Neutral
- **Notte** (`--bg`, `{colors.notte}`) / **Calce** (`{colors.calce}`): fondo pagina; anche fondo dei campi di input, che così si "scavano" nel pannello.
- **Pannello** (`--panel`, `{colors.panel}` / `{colors.calce-panel}`): pannelli, righe-tabella, filtri a pillola inattivi.
- **Pannello rialzato** (`--panel-2`): hover di riga, bottone secondario, tag, tooltip del grafico.
- **Linee** (`--line`, `--line-soft`): bordo dei campi, separatori, bordo tratteggiato dello stato vuoto; `--line-soft` per l'hover del secondario. `--grid` per le griglie dei grafici.
- **Inchiostri** (`--ink`, `--ink-2`, `--ink-3`): testo primario, secondario (descrizioni, etichette dei campi), terziario (intestazioni di tabella, suggerimenti, metadati).
- **Grigio-azzurro** (`--neutral`, `{colors.grigio-azzurro}`): tono degli stati neutri "Mai collegata" e "Dismessa".
- **Focus** (`--focus`): anello di focus da 2px.

### Named Rules
**La Regola del Rame Raro.** Il verderame significa protezione o azione principale, e nient'altro: niente verderame per grafici, decorazioni o stati di salute. Se un elemento azzurro non protegge e non è l'azione da fare, è un errore.

**La Regola dei Ruoli Gemelli.** Sera e campo hanno gli stessi nomi di token e gli stessi ruoli; cambia solo il valore. Un componente non sa in che modalità si trova.

**La Regola della Riga che Pesa.** Una riga con un problema si tinge mescolando in oklab il pannello con vinaccia (80/20 in sera, 90/10 in campo) o ruggine (86/14, 88/12): mai con l'accento, così un guasto non si confonde con una selezione.

## Typography

**Display Font:** Hanken Grotesk Variable (con ui-sans-serif, system-ui)
**Body Font:** Hanken Grotesk Variable
**Label/Mono Font:** ui-monospace, SF Mono, Menlo, Consolas (solo dati da copiare)

**Character:** Una sola grottesca, morbida e leggibile, che regge sia la frase-risposta grande sia la tabella fitta. Il peso fa la gerarchia; le cifre sono sempre tabellari dove si confrontano.

### Hierarchy
- **Display** (720, `clamp(1.7rem, 1.25rem + 2vw, 2.5rem)`, 1.1, -0.02em, `text-wrap: balance`): la frase-risposta dell'area utenti ("Entro domani: tratta Campo Lungo."). Oggi solo nei prototipi `.vrd-answer`.
- **Headline** (700, 1.75rem in `PageHeader`, 1.9rem nel titolo della Flotta, `leading-tight`, `tracking-tight`): titolo di pagina in console, scritto come risposta ("Tutte le centraline stanno bene").
- **Title** (600, 1rem; 1.25rem `text-xl` per i titoli delle pagine semplici come Accesso e Home): titoli di sezione e di pannello.
- **Body** (400, 15.5px, 1.45): testo corrente; descrizioni a `max-width: 70ch`. Le righe di dettaglio e le tabelle usano 14px (`text-sm`).
- **Label** (600, 12px, `text-ink-3`): intestazioni di colonna; 500 a 14px in `ink-2` per le etichette dei campi.
- **Mono** (400, 12px, `text-ink-3`): IMEI abbreviati, chiavi, indirizzi; mai per decorare.

### Named Rules
**La Regola delle Cifre in Colonna.** Ogni numero da confrontare (temperature, tensioni, dBm, conteggi nei filtri) usa `.num` (`font-variant-numeric: tabular-nums`).

**La Regola del Titolo che Risponde.** Il titolo più grande della schermata è una risposta, non un'etichetta di sezione.

## Layout

Contenuto centrato a `max-width: 1400px` in console (testata compresa), `48rem` (`max-w-3xl`) nell'area utenti semplice, `24rem` per l'accesso; margini laterali 16px. Il ritmo verticale usa la scala Tailwind da 4px: 4/6/8px tra righe, 16px dentro i pannelli, 24px sotto l'intestazione di pagina, 32px tra sezioni (`mt-8`), 28-32px sopra il contenuto (`py-7 lg:py-8`).

La Flotta è una griglia a due colonne da `xl`: tabella fluida e mappa a 360px fissata (`sticky`); sotto `md` la tabella diventa una lista di pannelli impilati con nome, stato e una riga di misure. Nei prototipi utenti la colonna laterale "Quando trattare" è a 380px da 1024px e scende sotto i vigneti al telefono. La testata console va su due righe al telefono: le schede scorrono in orizzontale con una sfumatura a destra che segnala il resto. Verifica sempre a 375 e 1440 px, in sera e in campo.

## Elevation & Depth

Il sistema è piatto: la profondità è tonale (notte → pannello → pannello rialzato), non affidata alle ombre. Un'unica ombra esiste, `--shadow`, per ciò che galleggia sopra il contenuto.

### Shadow Vocabulary
- **Galleggiante** (`box-shadow: 0 10px 28px -14px oklch(0 0 0 / 0.6)` in sera; `0 10px 28px -16px oklch(0.3 0.03 240 / 0.35)` in campo): tooltip del grafico. Nient'altro.

### Named Rules
**La Regola del Gradino.** Un elemento sale di un gradino tonale, non di un'ombra: hover di riga = `panel-2`, campo d'input = `bg` dentro il pannello.

## Shapes

Angoli morbidi e coerenti per famiglia: pillole piene (`9999px`) per tutto ciò che si preme (bottoni, filtri, tag, interruttore campo); 8px (`rounded-lg`) per campi, righe-tabella e righe-pannello del telefono; 12px (`rounded-xl`) per pannelli e stato vuoto; 6px per le schede della testata; 4px per tooltip e anello di focus. Nessun bordo sui pannelli: i soli bordi sono quello dei campi (`--line`), il tratteggio dello stato vuoto e il contorno semitrasparente dell'interruttore sulla testata. Le righe-tabella sono separate da 4px (`border-spacing-y-1`) con il primo e l'ultimo `td` arrotondati, così ogni riga si legge come un pannello.

## Components

### Buttons
Tattili e calmi: pillole compatte, il colore solo dove c'è l'azione.
- **Shape:** pillola (9999px), altezza 36px, padding 0 16px, 14px semibold, icona 16px con gap 8px.
- **Primary:** fondo verderame, testo `accent-ink`. Una per vista.
- **Hover / Focus:** primario `brightness(1.1)`, attivo `0.95`; secondario passa a `line-soft`; transizione colore 150ms. Focus: anello 2px `--focus`, offset 2px. Disabilitato 50% di opacità; in attesa l'icona diventa uno spinner.
- **Secondary / Ghost / Danger:** secondario su `panel-2`; ghost solo testo `ink-2` con fondo `panel-2` all'hover; danger con fondo vinaccia al 12% (22% all'hover), testo `ink` e icona vinaccia.

### Chips
- **Style:** filtri a pillola alti 32px, padding 0 12px, 14px, fondo `panel`, testo `ink-2`; ognuno porta icona di stato, etichetta e conteggio tabellare al 75% di opacità.
- **State:** attivo = fondo verderame, testo `accent-ink` semibold (icona e conteggio prendono il colore del testo); hover inattivo = `panel-2`. `aria-pressed` ne porta lo stato.
- **Tag:** pillola 12px medium su `panel-2`; con un tono, un pallino da 6px del colore di stato precede il testo.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `panel` su `bg`.
- **Shadow Strategy:** nessuna (vedi Elevation & Depth).
- **Border:** nessuno. Stato vuoto: bordo tratteggiato `--line`, centrato, 40px di padding verticale.
- **Internal Padding:** 16px (`p-4`); 12-16px nelle righe-pannello.

### Inputs / Fields
- **Style:** alti 40px, 8px di raggio, bordo 1px `--line`, fondo `bg` (scavato nel pannello), padding 0 12px; segnaposto `ink-3`. Etichetta sopra (14px medium `ink-2`), suggerimento o errore sotto.
- **Focus:** il bordo diventa `--focus`, nessun alone. Hover: bordo `ink-3`.
- **Error / Disabled:** messaggio in vinaccia sotto il campo; `ErrorBox` con icona triangolo su vinaccia al 12%. Disabilitato al 50%.

### Navigation
- **Testata:** fascia `--shell` a tutta larghezza, wordmark "Vinai" 17px bold, schede 15px all'85% di opacità; scheda attiva su `shell-ink` al 15% e semibold, hover al 10%. A destra l'interruttore sera/campo (pillola 32px con bordo `shell-ink` al 30%, icona sole/luna, etichetta lunga da `sm`, corta al telefono) e il profilo.
- **Mobile:** le schede vanno su una riga propria a tutta larghezza e scorrono in orizzontale con maschera sfumata.

### Tabella a righe-pannello
Separazione verticale 4px, celle alte 44px su `panel`, intestazioni 12px semibold `ink-3`; hover di riga `panel-2` in 200ms. `data-tone="bad|warn"` tinge la riga con `--bad-row`/`--warn-row`. Quando lo stato di una centralina cambia, la riga si accende per 1,6s con un contorno interno verderame che svanisce (`stato-cambiato`, annullato da `prefers-reduced-motion`). Righe ordinate per urgenza; le colonne non si spostano.

### Stato
`StatusLabel`: icona 16px nel colore del tono + etichetta in `ink`. In forma compatta l'etichetta resta per i lettori di schermo. Mai il colore da solo.

### Grafici e mappa
Grafici uPlot: una serie per grafico in `--series`, griglia `--grid`, assi 12px `ink-3` senza tacche, barre arrotondate per i minuti di bagnatura, tooltip galleggiante e link "Tabella" per i valori. Mappa MapLibre: stile scuro in sera, positron in campo; marcatori cerchio 7px nel colore del tono di stato con contorno 2px `--panel` (OKLCH convertito in `rgb()` perché MapLibre non lo legge).

### Linea della protezione (dispositivo firma)
Il cuore del mondo, oggi costruito nei prototipi dell'area utenti (`app/src/proto/b/parts.tsx`, `ProtectionLine` e `Legend`; stili `.vrd` in `app/src/proto/proto.css`). Su una finestra di 10 giorni (7 passati, 3 previsti), larga quanto il pannello e misurata in pixel veri:
- una rotaia sottile (2px, `--rule`) attraversa tutta la finestra;
- la **protezione** è una barra verderame (12px compatta, 18px estesa, raggio 3) dal giorno del trattamento alla fine della copertura;
- ogni **pioggia** la "lava": una tacca del colore del fondo, larga in proporzione ai millimetri (3-28px), con l'etichetta "−N mm" nella vista estesa;
- sotto, una tacca vinaccia per ogni **ora con condizioni da infezione**; attenuata al 35% se cade sotto la protezione, piena dove il vigneto è scoperto, con la scritta "rischio senza copertura da ...";
- una linea verticale `ink` segna **adesso**.
Ha un `aria-label` che racconta tutto in parole, e una legenda di quattro voci sopra l'elenco. Ogni vigneto è una riga-pannello con nome, varietà, stato (icona + etichetta: Da trattare vinaccia, Da controllare ruggine, Tutto bene foglia), la linea e una riga di perché.

**Nota di integrazione.** Il CSS dei prototipi non è ancora fuso nei token dell'app: lo scope `.vrd` ridefinisce in proprio `--verderame`, `--verderame-deep`, `--vinaccia`, `--ruggine`, `--foglia`, `--pioggia`, `--rule`. Portando le schermate utenti nell'app, questi nomi vanno mappati sui ruoli di `index.css` (`--accent`, `--bad`, `--warn`, `--ok`, `--water`, `--line`).

## Do's and Don'ts

### Do:
- **Do** prendere i colori solo dai token di `app/src/index.css` e usarli per ruolo (`bg-accent`, `text-bad`), così sera e campo funzionano da soli.
- **Do** accompagnare ogni stato con icona ed etichetta (`StatusLabel`, `Tag` con pallino).
- **Do** usare righe-tabella come pannelli separati da 4px, tinte per gravità con `--bad-row`/`--warn-row`.
- **Do** disegnare i grafici con una sola serie in `--series`, con la tabella dei valori a un tocco.
- **Do** scrivere il titolo della schermata come risposta, e mettere le cifre in `.num`.
- **Do** usare pillole (9999px) per ciò che si preme e 12px per i pannelli.
- **Do** verificare ogni schermata a 375 e 1440 px, in sera e in modalità campo.

### Don't:
- **Don't** usare il verderame per qualcosa che non sia protezione o azione principale (né per grafici, né per stati di salute).
- **Don't** affidare un significato al solo colore.
- **Don't** aggiungere bordi ai pannelli o ombre alle superfici a riposo: la profondità è tonale; `--shadow` è solo per ciò che galleggia.
- **Don't** tingere una riga con l'accento per segnalare un problema: si confonderebbe con una selezione.
- **Don't** usare il semaforo generico né le icone meteo da cruscotto: il rischio si mostra con la linea della protezione.
- **Don't** usare il monospazio come decorazione: solo per codici e chiavi da copiare.
- **Don't** passare valori OKLCH a MapLibre: convertirli con `rgb()` di `FleetMap.tsx`.
