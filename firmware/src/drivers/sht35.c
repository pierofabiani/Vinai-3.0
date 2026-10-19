#include "sht35.h"
#include "../hal/hal.h"
#include "../core/crc.h"

/* Conversioni del datasheet, in interi a 32 bit (sicure con int a 16 bit):
 *   T  = -45 + 175 * raw / 65535      -> decimi: -450 + 1750 * raw / 65535
 *   RH = 100 * raw / 65535            -> decimi: 1000 * raw / 65535
 * Il vecchio firmware troncava i risultati intermedi a 16 bit: qui no. */
int16_t sht35_temp_dC(uint16_t raw)
{
    int32_t v = -450 + (int32_t)(((uint32_t)raw * 1750u + 32767u) / 65535u);
    return (int16_t)v;
}

uint16_t sht35_hum_dPct(uint16_t raw)
{
    uint32_t v = ((uint32_t)raw * 1000u + 32767u) / 65535u;
    return (uint16_t)(v > 1000u ? 1000u : v);
}

static bool once(int16_t *t, uint16_t *h)
{
    static const uint8_t cmd[2] = { 0x24u, 0x00u };   /* single shot, alta ripetibilità, senza clock stretching */
    uint8_t d[6];
    if (hal_i2c_write(SHT35_ADDR, cmd, 2) != HAL_OK) return false;
    hal_delay_ms(16);                                 /* tempo di misura max 15,5 ms */
    if (hal_i2c_read(SHT35_ADDR, d, 6) != HAL_OK) return false;
    if (crc8_sensirion(d, 2) != d[2] || crc8_sensirion(d + 3, 2) != d[5]) return false;
    *t = sht35_temp_dC((uint16_t)(((uint16_t)d[0] << 8) | d[1]));
    *h = sht35_hum_dPct((uint16_t)(((uint16_t)d[3] << 8) | d[4]));
    return true;
}

bool sht35_measure(int16_t *temp_dC, uint16_t *hum_dPct)
{
    if (once(temp_dC, hum_dPct)) return true;
    hal_delay_ms(2);
    return once(temp_dC, hum_dPct);
}
