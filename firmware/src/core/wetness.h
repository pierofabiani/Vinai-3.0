/*
 * wetness.h — Accumulo della bagnatura fogliare in un intervallo di misura.
 *
 * Il vecchio firmware leggeva il sensore una volta per intervallo e lo
 * riduceva a una scala 0-5. Per i modelli delle malattie conta invece la
 * DURATA della bagnatura: qui il sensore si campiona ogni wet_sample_s secondi
 * (risveglio breve, solo CTMU + ADC) e si contano i minuti in cui la foglia è
 * bagnata, con isteresi per non oscillare attorno alla soglia.
 *
 * Al momento del salvataggio si ottengono:
 *   - wet_min: minuti bagnati nell'intervallo = durata intervallo x frazione
 *              di campioni bagnati (robusto a campioni saltati o in più)
 *   - wet_raw: media delle letture grezze (per ricalibrare a posteriori)
 */
#ifndef WETNESS_H
#define WETNESS_H

#include <stdint.h>
#include <stdbool.h>

typedef struct {
    uint32_t sum_raw;
    uint16_t samples;
    uint16_t wet_samples;
    uint16_t faults;
    bool     is_wet;        /* stato corrente, conservato tra un intervallo e l'altro */
} wetness_acc_t;

void wetness_init(wetness_acc_t *a);
/* Aggiunge un campione. ok=false se la lettura è fallita. */
void wetness_add(wetness_acc_t *a, bool ok, uint16_t raw,
                 uint16_t threshold, uint16_t hyst, uint8_t polarity);
/* Chiude l'intervallo e azzera i contatori (lo stato is_wet resta). */
void wetness_close(wetness_acc_t *a, uint32_t interval_s,
                   uint16_t *raw_avg, uint8_t *wet_min, bool *fault);

#endif
