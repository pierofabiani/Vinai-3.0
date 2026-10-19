/*
 * persist.h — Dati permanenti nella EEPROM 24C08 (1 KB).
 *
 * Mappa:
 *   0x000  identità (32 byte): IMEI e chiave segreta, scritte in laboratorio
 *   0x040  configurazione, copia A (64 byte)
 *   0x080  configurazione, copia B (64 byte)
 *   0x0C0  ultima configurazione con cui la rete ha funzionato (64 byte)
 *   0x100  stato, slot 0 (16 byte)  } scritti a turno con un contatore di
 *   0x110  stato, slot 1 (16 byte)  } generazione: un taglio di corrente
 *                                     rovina al massimo lo slot in scrittura
 *   0x120..0x3FF libero
 *
 * Lo stato si scrive a ogni invio riuscito (circa 24 volte al giorno): la
 * 24C08 regge un milione di cicli, cioè oltre un secolo a questo ritmo.
 */
#ifndef PERSIST_H
#define PERSIST_H

#include <stdint.h>
#include <stdbool.h>
#include "../core/config.h"
#include "../core/packet.h"

typedef struct {
    uint64_t imei;
    uint8_t  key[DEVICE_KEY_LEN];
} identity_t;

typedef struct {
    uint32_t acked_seq;     /* ultima sequenza confermata dal server */
    uint16_t reset_count;
    uint16_t cfg_rejected;  /* ultima versione di configurazione rifiutata (0 = nessuna) */
    uint16_t generation;
} pstate_t;

bool persist_load_identity(identity_t *id);
bool persist_save_identity(const identity_t *id);     /* solo in laboratorio */

bool persist_load_config(config_t *c);               /* false se nessuna copia valida */
bool persist_save_config(const config_t *c);         /* scrive A poi B */

/* Ultima configurazione con cui un invio è riuscito: è il punto di ritorno se
 * un cambio di APN, bande o operatore impedisce di collegarsi. */
bool persist_load_good_config(config_t *c);
bool persist_save_good_config(const config_t *c);

bool persist_load_state(pstate_t *s);
bool persist_save_state(pstate_t *s);                 /* incrementa generation */

#endif
