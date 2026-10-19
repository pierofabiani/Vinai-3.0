/*
 * logstore.h — Registro circolare delle misure nella flash interna del PIC.
 *
 * Proprietà garantite (verificate dai test in tests/test_logstore.c):
 *  - ogni record si scrive una sola volta (compatibile con la flash ECC);
 *  - un taglio di corrente durante una scrittura perde al massimo quel record,
 *    mai i precedenti: lo slot rovinato viene riconosciuto (CRC) e saltato;
 *  - dopo un reset il registro si ricostruisce leggendo la flash, senza
 *    bisogno di stato salvato altrove;
 *  - quando il registro è pieno si sovrascrivono le misure più vecchie, una
 *    pagina alla volta.
 *
 * Quali record sono già confermati dal server NON è affare del registro: il
 * numero di sequenza confermato sta nella EEPROM (vedi app/state).
 */
#ifndef LOGSTORE_H
#define LOGSTORE_H

#include <stdint.h>
#include <stdbool.h>
#include "record.h"

void     logstore_init(void);              /* scansiona la flash, da chiamare all'avvio */
bool     logstore_append(record_t *r);     /* assegna r->seq e scrive; false se la flash fallisce */
bool     logstore_get(uint32_t seq, record_t *r);  /* false se il record non c'è più */
uint32_t logstore_last_seq(void);          /* 0 se vuoto */
uint32_t logstore_first_seq(void);         /* più vecchio ancora presente; 0 se vuoto */
uint16_t logstore_capacity(void);          /* record conservabili prima di sovrascrivere */
/* Garantisce che i prossimi numeri di sequenza siano > seq (es. dopo una flash
 * cancellata: il server ha già visto fino ad acked_seq e scarterebbe i doppioni). */
void     logstore_bump_seq(uint32_t seq);

#endif
