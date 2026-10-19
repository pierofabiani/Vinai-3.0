#include "lps22hb.h"
#include "../hal/hal.h"

#define REG_WHO_AM_I   0x0Fu   /* = 0xB1 */
#define REG_CTRL1      0x10u
#define REG_CTRL2      0x11u
#define REG_STATUS     0x27u
#define REG_PRESS_XL   0x28u

static bool wr(uint8_t reg, uint8_t val)
{
    uint8_t b[2] = { reg, val };
    return hal_i2c_write(LPS22HB_ADDR, b, 2) == HAL_OK;
}

static bool rd(uint8_t reg, uint8_t *buf, uint8_t n)
{
    return hal_i2c_write_read(LPS22HB_ADDR, &reg, 1, buf, n) == HAL_OK;
}

bool lps22hb_init(void)
{
    uint8_t id;
    if (!rd(REG_WHO_AM_I, &id, 1) || id != 0xB1u) return false;
    /* ODR = 0 (power-down / one-shot), BDU = 1 */
    return wr(REG_CTRL1, 0x02u);
}

bool lps22hb_measure(uint16_t *press_dhPa)
{
    uint8_t st, p[3];
    /* IF_ADD_INC (bit4, default) + ONE_SHOT (bit0) */
    if (!wr(REG_CTRL2, 0x11u)) return false;
    uint32_t t0 = hal_millis();
    for (;;) {
        if (!rd(REG_STATUS, &st, 1)) return false;
        if (st & 0x01u) break;                         /* P_DA: pressione pronta */
        if ((uint32_t)(hal_millis() - t0) > 100u) return false;
        hal_delay_ms(5);
    }
    if (!rd(REG_PRESS_XL, p, 3)) return false;
    uint32_t raw = (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16);
    /* hPa = raw / 4096 -> decimi di hPa = raw * 10 / 4096 */
    uint32_t d = (raw * 10u + 2048u) / 4096u;
    if (d < 2600u || d > 12600u) return false;         /* fuori dal campo del sensore */
    *press_dhPa = (uint16_t)d;
    return true;
}
