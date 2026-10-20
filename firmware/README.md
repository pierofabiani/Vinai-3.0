# Firmware Hive 3.0 (Vinai 3.0)

Nuovo firmware per la scheda **Hive Rev 1.1** già prodotta (PIC24FJ256GA704, modem SIM7020E, SHT35, LPS22HB, EEPROM 24C08, sensore di bagnatura capacitivo).
Riscritto da zero: non deriva dal codice del fornitore, di cui abbiamo solo i `.hex`.

## Cosa fa

- Misura temperatura, umidità, pressione e **bagnatura fogliare** ogni `INTERVAL` minuti (default 10).
- La bagnatura si campiona ogni minuto e si salva come **minuti bagnati nell'intervallo** più la lettura media grezza. Il vecchio firmware salvava una sola lettura ridotta a una scala 0-5.
- Ogni misura finisce subito nella **flash del PIC** (circa 16 giorni di autonomia senza rete) e si cancella solo quando il server ne conferma il salvataggio.
- Invia a lotti (default ogni ora) con **CoAP su UDP**, firmato HMAC-SHA256 con una chiave per centralina. L'invio è immediato in caso di gelata.
- Riceve dal server conferma, ora esatta e nuova configurazione nella stessa risposta.
- **Pluviometro rimosso**: la pioggia arriverà da fonti esterne. L'ingresso del sensore Hall resta libero.

## Struttura

```
src/
  hal/hal.h              interfaccia hardware: l'unico punto che conosce il PIC
  hal/pic24/hal_pic24.c  implementazione per il PIC24FJ256GA704 (scheletro, vedi "Da fare")
  core/                  moduli portabili, testati su PC
    record.*             formato della misura (20 byte in flash, 14 nel pacchetto)
    logstore.*           registro circolare in flash: ECC, tagli di corrente, ricostruzione al riavvio
    packet.*             formato dei messaggi uplink/downlink + firma
    coap.*               CoAP minimo (RFC 7252), verificato con la libreria aiocoap
    config.*             parametri remoti, validati in blocco
    wetness.*            accumulo della bagnatura con isteresi
    sha256.*, crc.*      firma HMAC-SHA256, CRC16, CRC8 Sensirion
  drivers/               sht35, lps22hb, eeprom24c08, sim7020 (comandi AT)
  app/
    station.*            logica: quando campionare, misurare, inviare; ritentativi
    persist.*            identità, configurazione e stato nella EEPROM
    net.h                trasporto astratto
    net_sim7020.c        trasporto sul modem reale (solo PIC)
    main_pic.c           main del PIC
tools/
  gen_vectors.c          vettori d'oro per il server: make vectors -> packages/protocol/vectors/firmware.json
tests/
  test_core.c            test dei moduli core
  test_app.c             driver + scenari di giorni simulati con un server finto
  hal_host/              hardware simulato (flash ECC con tagli di corrente, sensori, EEPROM, rete)
```

## Test su PC

```
make test
```

Oggi: **8.172 controlli, 0 falliti** (gcc con AddressSanitizer e UBSan). Gli scenari simulati coprono:

| Scenario | Risultato atteso e verificato |
| --- | --- |
| Giorno normale | 144 misure, circa 25 pacchetti, nessun duplicato |
| 3 giorni senza rete | nessuna misura persa, tentativi con attese crescenti (non uno ogni 10 minuti) |
| Conferme perse | reinvii, ma nessuna riga doppia nel database |
| 20 giorni senza rete | si perdono solo le misure oltre la capacità della flash, e il server sa quante |
| Reset con arretrato | registro ricostruito dalla flash, tutto inviato dopo |
| Configurazione remota | applicata, salvata, conservata dopo il reset; una configurazione invalida è rifiutata in blocco |
| Gelata | invio entro 15 minuti, senza raffiche |
| Orologio sbagliato | sincronizzato dalla prima risposta del server |
| APN sbagliato inviato da remoto | dopo 3 tentativi torna all'ultima rete funzionante, segnala la versione annullata, nessuna misura persa |
| Cambio di APN e bande corretto | applicato, collaudato al primo invio riuscito, conservato dopo il riavvio |
| Orologio interno impreciso (±12%) | deriva stimata e compensata: misure ogni 10 minuti veri, orari corretti entro un minuto |
| Sensore guasto | valori di guasto e flag, gli altri sensori continuano |
| Bagnatura | 30 minuti di foglia bagnata misurati come 30 minuti |
| Taglio di corrente in flash | perso al massimo il record in scrittura, mai i precedenti |

## Mappa della memoria

**Flash del PIC** (pagine da 1024 istruzioni, 0x800 unità di indirizzo):

| Area | Pagine | Indirizzi | Uso |
| --- | --- | --- | --- |
| Bootloader | 0-3 | 0x000000-0x001FFF | segmento di boot protetto, per l'OTA (fase successiva) |
| Applicazione | 4-31 | 0x002000-0x00FFFF | questo firmware |
| Area di scarico OTA | 32-59 | 0x010000-0x01DFFF | firmware nuovo in arrivo, poi copia di riserva |
| Registro misure | 60-83 | 0x01E000-0x029FFF | 24 pagine x 102 record = 2.448 slot (2.346 utili) |
| Configurazione chip | ultima pagina | 0x02AF00... | bit di configurazione |

Da confermare con il datasheet e il linker script prima della fase OTA.

**EEPROM 24C08**: vedi `src/app/persist.h` (identità, configurazione A/B da 64 byte, ultima configurazione funzionante, stato a slot alternati).

## Rete cellulare configurabile

APN, bande NB-IoT e operatore non sono scritti nel codice: stanno nella configurazione (default 1NCE: `iot.1nce.net`, bande 8 e 20, operatore automatico) e si cambiano da remoto o in laboratorio. Cambiare fornitore di SIM = nuova SIM + questi tre valori.

| Parametro | Tag | Valori ammessi |
| --- | --- | --- |
| APN | 11 | 1-29 caratteri stampabili, senza virgolette, virgole o barre |
| Bande | 12 | da 1 a 4 tra 1, 3, 5, 8, 20, 28 (bande NB-IoT del SIM7020E) |
| Operatore | 13 | 0 = automatico, oppure MCC+MNC (es. 22201 TIM, 22210 Vodafone) |

Protezione: una configurazione di rete diventa "collaudata" solo dopo un invio riuscito iniziato con quella configurazione. Se dopo un cambio la centralina fallisce 3 tentativi di fila, torna all'ultima configurazione collaudata e riporta al server la versione annullata (`health.cfg_rejected`); il server non deve reinviarla.

## Compilazione per il PIC (MPLAB X + XC16)

Scorciatoia da terminale, dopo aver installato XC16: `cd firmware && make pic`. Usa il compilatore a riga di comando e non ha ancora un file `.hex` finale: gli errori del primo tentativo vanno completati nel driver (TODO(fase 1)).

La procedura con MPLAB X qui sotto resta quella consigliata per programmare la scheda.

1. Nuovo progetto "Standalone", dispositivo **PIC24FJ256GA704**, compilatore XC16.
2. Aggiungere tutti i `.c` di `src/` (non quelli di `tests/`).
3. Generare i bit di configurazione come indicato in testa a `hal_pic24.c`.
4. Riservare nel linker script l'area del registro (0x01E000-0x029FFF), così il compilatore non ci mette codice.
5. Programmare con PICkit 5 o MPLAB Snap sul connettore ICSP (PGEC2/PGED2).

## Cosa dicono le foto della scheda (19/10/2026)

- Montati come da BOM: PIC24FJ256GA704 (lotto 2020), SIM7020E, traslatore di livello (QFN vicino al modem), regolatore vicino al portapile, condensatore da 470 uF per i picchi del modem, portapile 3 x AA Keystone, jumper batteria, pulsante.
- Impronte vuote: un grande modulo con connettore SMA accanto (probabilmente la radio Zigbee prevista nel 2021, non usata), una impronta tonda e una a 4 piazzole vicino al PIC (il quarzo da 32 kHz, rimosso: per questo il firmware compensa la deriva dell'orologio), una fila 2x5 di piazzole vicino al modem.
- Sensori su schedina separata: SHT35 con filtro in PTFE + LPS22HB, cavo a 4 fili (probabilmente alimentazione, massa, SDA, SCL).
- Bagnatura: pettine interdigitato sotto il solder mask, quindi capacitivo (conferma quanto visto nel firmware). Saldature e bordi scoperti: vanno protetti con resina o vernice protettiva, altrimenti umidità e ossidazione spostano la lettura.
- Programmatore disponibile: MPLAB PICkit 4.

## Da fare (fase 1, con la scheda al banco)

- [ ] Backup del firmware di ogni scheda con MPLAB IPE (lettura), prima di riprogrammarla
- [x] Programmazione: fila 1x5 a destra del connettore dei sensori (MCLR, VDD, GND, PGD, PGC). Pin 1 del PICkit 4 = freccia = MCLR
- [x] Quarzo da 32 kHz: rimosso dal fornitore. L'RTCC gira sull'oscillatore interno LPRC e il firmware ne compensa la deriva

- [ ] Mappa completa dei pin (TRIS, LAT, ANS, PPS) da vecchio firmware + foto + misure
- [ ] Prima compilazione con XC16 e correzione dei nomi dei registri
- [ ] RTCC: lettura/scrittura dell'ora e allarme dopo N secondi
- [ ] CTMU per la bagnatura con tempi reali in microsecondi; taratura di soglia e polarità con il sensore vero
- [ ] Batteria: partitore e coefficiente
- [ ] SIM7020E: sequenza PWRKEY, risveglio dal PSM, formato di `AT+CSOSEND` e `+CSONMI`, lettura RSRP/SNR (`AT+CENG?`)
- [ ] Misura dei consumi: sleep, campionamento bagnatura, invio
- [ ] Chiave del dispositivo e provisioning in laboratorio (script che scrive identità e configurazione)
