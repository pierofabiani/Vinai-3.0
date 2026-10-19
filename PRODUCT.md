# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Due utenti primari con la stessa priorità:

- **Titolare dell'azienda agricola**: decide se e dove trattare. Usa soprattutto il telefono, spesso in vigna, con competenza tecnica media. Il suo compito è rispondere a "devo trattare, e dove?".
- **Agronomo consulente**: segue una o più aziende con un solo account. Usa telefono e computer, vuole dati, storico, confronti tra vigneti e il perché di ogni allarme. Valida le osservazioni di campo.

Altri utenti confermati:

- **Collaboratori e ospiti** dell'azienda: consultano i dati, i collaboratori segnalano osservazioni.
- **Tecnico**: provisioning in laboratorio, installazione con QR e GPS, salute delle centraline.
- **Amministratore** (il titolare del progetto e il team App Salad): dalla console gestisce flotta, aziende, utenti, configurazioni e firmware.

## Product Purpose

Vinai porta i dati delle centraline in vigna a una decisione: dove e quando c'è rischio di malattie della vite (peronospora, oidio, botrite, black rot), con il perché di ogni allarme.
Il sistema è un supporto alle decisioni: la scelta di trattare resta dell'agronomo e del titolare, e l'app lo dice chiaramente.
Successo al pilota (marzo 2027): 3-5 centraline e 1-2 aziende usano l'app per tutta la stagione. Il titolare risponde alla domanda principale in due secondi. Le osservazioni di campo validate si accumulano per calibrare i modelli.

## Positioning

- Centraline proprie (schede Hive con firmware riscritto), che misurano la **bagnatura fogliare in minuti per intervallo**, il dato che l'esperienza degli anni precedenti indica come più predittivo.
- Pioggia da radar e reti regionali.
- Modelli delle malattie pubblicati e spiegabili, poi calibrati sulle osservazioni di campo confermate dagli agronomi.
- Solo più avanti, modelli AI addestrati su quei dati validati, insieme agli avvisi fitosanitari regionali e provinciali.

## Operating Context

- **In vigna**: sole diretto, mani sporche o guanti, rete mobile debole o assente. Serve una modalità chiara ad alto contrasto, bersagli grandi, gli ultimi dati disponibili offline e osservazioni registrabili senza rete.
- **In ufficio o a casa**: l'agronomo consulta storico e grafici da computer. L'amministratore usa la console da computer.
- **Ritmo stagionale**: dal germogliamento (fine marzo-aprile) alla vendemmia l'uso è quotidiano; d'inverno è raro. Gli allarmi arrivano con notifiche push, email o Telegram.
- **Installazione**: il tecnico inquadra il QR della centralina dal telefono, la associa al vigneto, scatta foto e posizione.

## Capabilities and Constraints

- PWA installabile su iPhone e Android dal browser, senza store. Su iPhone le notifiche push arrivano solo se l'app è aggiunta alla schermata Home: serve una guida al primo accesso.
- Una sola web app con l'area utenti e l'area `/console` di amministrazione.
- Accesso senza password: link via email o passkey; inviti con ruoli per azienda.
- Dati delle centraline: temperatura, umidità, pressione, minuti di bagnatura e lettura grezza, salute del dispositivo (batteria, segnale, reset). Un invio all'ora di default, invio immediato in caso di gelata. **Niente pluviometro**: la pioggia arriva da fonti esterne.
- I valori guasto di un sensore restano guasti: l'interfaccia non deve mai mostrare dati inventati o interpolati come se fossero misurati.
- Ogni allarme di malattia mostra quali condizioni lo hanno fatto scattare.
- Export in CSV ed Excel.
- Lingua: italiano.
- **Decisioni aperte**: nome definitivo del prodotto; zone e aziende del pilota; servizio di previsioni meteo; modelli e soglie, da scegliere con un agronomo di riferimento.

## Brand Commitments

Nessun impegno vincolante. "Vinai" è un **nome provvisorio**, da usare come segnaposto. Non ci sono logo né colori da rispettare.

## Evidence on Hand

- Firmware e formato dei dati delle centraline: `firmware/`, `docs/decisioni/`.
- Dati storici 2021-2023 del vecchio sistema (Supabase): non ancora esportati.
- Non esistono testimonianze, clienti dichiarati, casi studio, prezzi o risultati di accuratezza dei modelli: non vanno inventati.

## Product Principles

1. **Prima la risposta, poi il dettaglio**: la schermata iniziale dice cosa fare e dove; grafici e storico sono a un tocco.
2. **Mai un numero senza fonte né un allarme senza perché**: misurato, stimato da radar o previsto si distinguono sempre.
3. **Funziona dove si lavora**: in vigna, al sole e senza rete prima che in ufficio.
4. **Il dato di campo vale oro**: segnalare un'osservazione deve richiedere 20 secondi e dare un riscontro visibile.
5. **Supporto, non sostituto**: il sistema informa, la decisione resta a chi conosce la vigna.

## Accessibility & Inclusion

- Il colore non è mai l'unico portatore di significato: c'è sempre anche un'etichetta o un'icona.
- Leggibilità sotto il sole (modalità campo ad alto contrasto) e bersagli tattili ampi per l'uso con i guanti.
- Utenti con familiarità digitale variabile: linguaggio semplice, niente gergo tecnico nell'area utenti.
- Obiettivo di riferimento: WCAG 2.2 AA.
