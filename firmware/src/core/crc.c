#include "crc.h"

uint16_t crc16_ccitt(const uint8_t *data, size_t len)
{
    uint16_t crc = 0xFFFFu;
    while (len--) {
        crc ^= (uint16_t)((uint16_t)(*data++) << 8);
        for (uint8_t i = 0; i < 8u; i++) {
            if (crc & 0x8000u) crc = (uint16_t)((crc << 1) ^ 0x1021u);
            else               crc = (uint16_t)(crc << 1);
        }
    }
    return crc;
}

uint8_t crc8_sensirion(const uint8_t *data, size_t len)
{
    uint8_t crc = 0xFFu;
    while (len--) {
        crc ^= *data++;
        for (uint8_t i = 0; i < 8u; i++) {
            if (crc & 0x80u) crc = (uint8_t)((crc << 1) ^ 0x31u);
            else             crc = (uint8_t)(crc << 1);
        }
    }
    return crc;
}
