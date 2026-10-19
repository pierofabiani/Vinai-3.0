#include "eeprom24c08.h"
#include "../hal/hal.h"
#include <string.h>

#define PAGE 16u

static uint8_t dev(uint16_t addr) { return (uint8_t)(0x50u | ((addr >> 8) & 0x03u)); }

bool eeprom_read(uint16_t addr, uint8_t *buf, uint16_t len)
{
    if ((uint32_t)addr + len > EEPROM_SIZE) return false;
    while (len) {
        /* una lettura non attraversa il confine di blocco da 256 byte */
        uint16_t n = (uint16_t)(256u - (addr & 0xFFu));
        if (n > len) n = len;
        if (n > 255u) n = 255u;
        uint8_t a = (uint8_t)addr;
        if (hal_i2c_write_read(dev(addr), &a, 1, buf, (uint8_t)n) != HAL_OK) return false;
        addr = (uint16_t)(addr + n); buf += n; len = (uint16_t)(len - n);
    }
    return true;
}

static bool wait_ready(uint16_t addr)
{
    /* ACK polling: il chip non risponde finché il ciclo di scrittura (max 5 ms) non è finito */
    uint32_t t0 = hal_millis();
    uint8_t a = (uint8_t)addr;
    while (hal_i2c_write(dev(addr), &a, 1) != HAL_OK) {
        if ((uint32_t)(hal_millis() - t0) > 20u) return false;
        hal_delay_ms(1);
    }
    return true;
}

bool eeprom_write(uint16_t addr, const uint8_t *buf, uint16_t len)
{
    uint16_t a0 = addr; const uint8_t *b0 = buf; uint16_t l0 = len;
    uint8_t tmp[PAGE + 1u];
    if ((uint32_t)addr + len > EEPROM_SIZE) return false;
    while (len) {
        uint16_t n = (uint16_t)(PAGE - (addr % PAGE));     /* una scrittura resta dentro la pagina */
        if (n > len) n = len;
        tmp[0] = (uint8_t)addr;
        memcpy(tmp + 1, buf, n);
        if (hal_i2c_write(dev(addr), tmp, (uint8_t)(n + 1u)) != HAL_OK) return false;
        if (!wait_ready(addr)) return false;
        addr = (uint16_t)(addr + n); buf += n; len = (uint16_t)(len - n);
    }
    /* verifica */
    uint8_t chk[PAGE];
    while (l0) {
        uint16_t n = l0 > PAGE ? PAGE : l0;
        if (!eeprom_read(a0, chk, n) || memcmp(chk, b0, n) != 0) return false;
        a0 = (uint16_t)(a0 + n); b0 += n; l0 = (uint16_t)(l0 - n);
    }
    return true;
}
