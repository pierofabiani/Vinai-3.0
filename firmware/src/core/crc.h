#ifndef CRC_H
#define CRC_H
#include <stdint.h>
#include <stddef.h>

/* CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF): integrità dei record e della configurazione. */
uint16_t crc16_ccitt(const uint8_t *data, size_t len);

/* CRC-8 Sensirion (poly 0x31, init 0xFF): controllo delle letture dell'SHT35. */
uint8_t crc8_sensirion(const uint8_t *data, size_t len);

#endif
