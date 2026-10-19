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

- Server e app in TypeScript; modelli in Python. Piano, stack e fasi: `docs/piattaforma.md` (nota 0007).
- Il server è l'unico punto che scrive nel database. Ogni pacchetto si salva anche grezzo, per poterlo rielaborare.
- I modelli delle malattie mostrano sempre il perché di un allarme. Nessun modello "a scatola nera" in produzione senza spiegazione.

### Monorepo

- pnpm + Turborepo. Dalla radice: `pnpm dev` (database Docker + api + ingest + worker + web app), `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Lint e formattazione con Biome.
- Database di sviluppo: `infra/compose.dev.yml`, su `127.0.0.1:5442` (sulla 5432 di questo server gira un altro PostgreSQL: non toccarlo). Porte: api 8787, web 5173, CoAP UDP 5683.
- Nuove dipendenze con script di installazione vanno aggiunte a `allowBuilds` in `pnpm-workspace.yaml` solo se servono davvero.

### Server (`server/`)

- Tre ingressi: `src/api` (Hono), `src/ingest` (CoAP), `src/worker` (pg-boss). In sviluppo `src/dev.ts` li avvia insieme.
- Le dipendenze esterne (database, orologio, servizi) si passano alle funzioni: la logica si testa senza database.
- `ingest` conferma (`acked_seq`) solo ciò che è già salvato nel database. Se il salvataggio fallisce, nessun ACK. Regole complete: nota 0008.
- Il codec (`packages/protocol`) deve passare i vettori d'oro generati dal firmware C (`make -C firmware vectors`).
- Dentro `sql.begin(...)` ogni query usa la transazione (`tx`), mai il pool: altrimenti sotto carico il pool si blocca.
- Schema: migrazioni SQL in `server/migrations`, mai modificare una migrazione già applicata.
- Ogni modifica a ingest o configurazioni si prova anche con il simulatore (`pnpm --filter @vinai/server sim`, con `pnpm dev` acceso).

### App (`app/`)

- Una sola web app con area utenti e area `/console`. React, Vite, TanStack Query, Tailwind v4.
- Design con la skill Impeccable (`.claude/skills/impeccable`): `PRODUCT.md` descrive prodotto e utenti, `DESIGN.md` il sistema visivo (arriva in P3). Prima di una schermata nuova: `/impeccable shape`; prima del merge: `/impeccable critique` e `/impeccable audit`.
- Testi dell'interfaccia in italiano. Verifica sempre a 375 px (telefono) e a 1440 px (computer), in tema scuro e in modalità campo.

## Prima di dire "fatto"

1. I test passano.
2. Il README della cartella è aggiornato.
3. Se hai preso una decisione di progetto, c'è la nota in `docs/decisioni/`.
