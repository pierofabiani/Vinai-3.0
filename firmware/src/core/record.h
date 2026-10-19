/*
 * record.h — Una misura della centralina.
 *
 * In flash il record occupa REC_SIZE byte (con numero di sequenza e CRC).
 * Nel pacchetto radio occupa REC_WIRE_SIZE byte: la sequenza si ricava da
 * quella del primo record del pacchetto, il CRC è sostituito dalla firma HMAC.
 *
 * Valori "guasto": se un sensore non risponde il campo vale REC_*_FAULT e il
 * bit corrispondente in flags è acceso. Il server non deve mai inventare dati.
 */
#ifndef RECORD_H
#define RECORD_H

#include <stdint.h>
#include <stdbool.h>

#define REC_SIZE        20u   /* in flash: multiplo di HAL_FLASH_WRITE_UNIT (4) */
#define REC_WIRE_SIZE   14u   /* nel pacchetto */

#define REC_TEMP_FAULT   ((int16_t)-32768)
#define REC_U16_FAULT    0xFFFFu

/* flags */
#define RECF_TEMP_FAULT   0x01u
#define RECF_HUM_FAULT    0x02u
#define RECF_PRESS_FAULT  0x04u
#define RECF_WET_FAULT    0x08u
#define RECF_TIME_UNSYNC  0x10u   /* orologio mai sincronizzato con server o rete */
#define RECF_LOW_BATT     0x20u

typedef struct {
    uint32_t seq;          /* progressivo, mai azzerato */
    uint32_t time;         /* s dal 2020-01-01 UTC, fine dell'intervallo di misura */
    int16_t  temp_dC;      /* decimi di °C */
    uint16_t hum_dPct;     /* decimi di %RH */
    uint16_t press_dhPa;   /* decimi di hPa (es. 10132 = 1013,2 hPa) */
    uint16_t wet_raw;      /* media delle letture capacitive nell'intervallo */
    uint8_t  wet_min;      /* minuti con foglia bagnata nell'intervallo */
    uint8_t  flags;
} record_t;

/* Serializzazione in flash (little endian + CRC16). */
void record_pack(const record_t *r, uint8_t out[REC_SIZE]);
/* Ritorna false se il CRC non torna (scrittura interrotta) o lo slot è vuoto. */
bool record_unpack(const uint8_t in[REC_SIZE], record_t *r);
/* true se i REC_SIZE byte sono tutti 0xFF (slot mai scritto). */
bool record_slot_erased(const uint8_t in[REC_SIZE]);

/* Formato radio (senza seq e CRC). */
void record_wire_pack(const record_t *r, uint8_t out[REC_WIRE_SIZE]);
void record_wire_unpack(const uint8_t in[REC_WIRE_SIZE], uint32_t seq, record_t *r);

#endif
