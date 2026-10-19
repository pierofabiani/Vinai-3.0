# Istruzioni per Claude Code — Vinai 3.0

## Il progetto in breve

Centraline meteo NB-IoT nei vigneti → server → app PWA, per prevedere le malattie della vite.
Documenti di riferimento: architettura e piano sono linkati nel `README.md`; le scelte prese stanno in `docs/decisioni/`.
Prima di cambiare un comportamento già deciso, leggi la nota di decisione relativa; se la scelta cambia, scrivine una nuova.

## Lingua

- Commenti, documentazione, messaggi di commit: **italiano**.
- Identificatori nel codice: inglese.

## Firmware (`firmware/`)

- Target: PIC24FJ256GA704, compilatore XC16. **`int` è a 16 bit**: usa sempre tipi a larghezza fissa (`uint16_t`, `uint32_t`) e fai i cast prima delle moltiplicazioni che possono superare 65535.
- Nessuna attesa senza timeout. Nessuna allocazione dinamica. Buffer statici.
- Tutto l'hardware passa da `src/hal/hal.h`. La logica (`src/core`, `src/app`, `src/drivers`) deve compilare e girare anche su PC.
- La flash del PIC ha l'ECC: ogni unità da 4 byte si scrive **una sola volta** dopo la cancellazione della pagina.
- I punti da verificare sulla scheda vera sono marcati `TODO(fase 1)`: non toglierli senza averli provati al banco.
- Test: `make -C firmware test` (gcc con AddressSanitizer e UBSan). Ogni nuova funzione ha un test; ogni bug trovato diventa uno scenario in `tests/test_app.c`.
- Non cambiare il formato dei pacchetti (`src/core/packet.h`) o la mappa della EEPROM (`src/app/persist.h`) senza aggiornare server, test e nota di decisione insieme.

## Server, app, modelli

- Server e app in TypeScript; modelli in Python.
- Il server è l'unico punto che scrive nel database. Ogni pacchetto si salva anche grezzo, per poterlo rielaborare.
- I modelli delle malattie mostrano sempre il perché di un allarme. Nessun modello "a scatola nera" in produzione senza spiegazione.

## Prima di dire "fatto"

1. I test passano.
2. Il README della cartella è aggiornato.
3. Se hai preso una decisione di progetto, c'è la nota in `docs/decisioni/`.
