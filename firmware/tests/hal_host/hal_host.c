/* hal_host.c — Implementazione simulata di hal.h per i test su PC. */
#include "../../src/hal/hal.h"
#include "sim.h"
#include <string.h>

/* ---------- Flash con semantica ECC ---------- */
static uint8_t  flash[SIM_PAGE_COUNT * SIM_PAGE_SIZE];
static uint32_t erase_cnt[SIM_PAGE_COUNT];
static int32_t  cut_after = -1;
static bool     cut = false;

/* ---------- Tempo ---------- */
/* Ora vera (secondi, con frazioni) e orologio della centralina, che può correre
 * a una velocità diversa (rate = secondi RTCC per secondo vero). */
static double   true_t;
static double   rtc_at_set, true_at_set;
static double   rtc_rate = 1.0;
static uint32_t ms;

/* ---------- Sensori ---------- */
static int16_t  env_t = 215; static uint16_t env_h = 650, env_p = 10132;
static bool     sht_ok = true, lps_ok = true;
static uint16_t wet = 2000, batt = 4300;

/* ---------- EEPROM 24C08: 1 KB in 4 blocchi da 256 (indirizzi 0x50..0x53) ---------- */
static uint8_t  eeprom[1024];

/* ---------- SHT35 / LPS22HB ---------- */
static uint8_t  sht_cmd[2];
static uint8_t  lps_reg;
static uint8_t  lps_regs[0x80];

void sim_reset_all(void)
{
    memset(flash, 0xFF, sizeof flash);
    memset(erase_cnt, 0, sizeof erase_cnt);
    memset(eeprom, 0xFF, sizeof eeprom);
    memset(lps_regs, 0, sizeof lps_regs);
    lps_regs[0x0F] = 0xB1;
    cut_after = -1; cut = false;
    true_t = 0; rtc_at_set = 0; true_at_set = 0; rtc_rate = 1.0; ms = 0;
    env_t = 215; env_h = 650; env_p = 10132;
    sht_ok = true; lps_ok = true; wet = 2000; batt = 4300;
}

void sim_flash_power_cut_after(int32_t units) { cut_after = units; cut = false; }
bool sim_flash_power_was_cut(void) { return cut; }
void sim_power_restore(void) { cut = false; cut_after = -1; }
uint32_t sim_flash_erase_count(uint16_t page) { return erase_cnt[page]; }
void sim_set_time(uint32_t t) { true_t = t; rtc_at_set = t; true_at_set = t; }
void sim_set_rtc_wrong(uint32_t rtc) { rtc_at_set = rtc; true_at_set = true_t; }
void sim_set_rtc_rate(double r) { rtc_at_set = rtc_at_set + (true_t - true_at_set) * rtc_rate; true_at_set = true_t; rtc_rate = r; }
uint32_t sim_true_time(void) { return (uint32_t)true_t; }
void sim_advance(uint32_t s) { true_t += s; ms += s * 1000u; }
void sim_advance_rtc(uint32_t s) { double d = s / rtc_rate; true_t += d; ms += (uint32_t)(d * 1000.0); }
void sim_set_env(int16_t t, uint16_t h, uint16_t p) { env_t = t; env_h = h; env_p = p; }
void sim_set_sht35_present(bool p) { sht_ok = p; }
void sim_set_lps22_present(bool p) { lps_ok = p; }
void sim_set_wet_raw(uint16_t r) { wet = r; }
void sim_set_battery(uint16_t mv) { batt = mv; }
void sim_eeprom_corrupt(uint16_t a) { eeprom[a % 1024u] ^= 0x5Au; }

/* ---------- Sistema ---------- */
void hal_init(void) {}
uint32_t hal_millis(void) { return ms; }
void hal_delay_ms(uint16_t d) { ms += d; }
void hal_watchdog_kick(void) {}
uint8_t hal_reset_reason(void) { return RESET_POWER_ON; }
void hal_reset(void) {}

uint32_t hal_rtc_now(void) { return (uint32_t)(rtc_at_set + (true_t - true_at_set) * rtc_rate + 1e-6); }
void hal_rtc_set(uint32_t t) { rtc_at_set = t; true_at_set = true_t; }
void hal_rtc_alarm_in(uint16_t s) { (void)s; }
void hal_sleep(void) {}

void hal_sensors_power(bool on) { (void)on; }
uint16_t hal_battery_mv(void) { return batt; }
hal_status_t hal_wetness_raw(uint16_t *raw) { *raw = wet; return (wet == 0xFFFFu) ? HAL_ERROR : HAL_OK; }

/* ---------- Flash ---------- */
uint16_t hal_logflash_page_size(void) { return SIM_PAGE_SIZE; }
uint16_t hal_logflash_page_count(void) { return SIM_PAGE_COUNT; }

hal_status_t hal_logflash_erase_page(uint16_t page)
{
    if (page >= SIM_PAGE_COUNT || cut) return HAL_ERROR;
    memset(&flash[(uint32_t)page * SIM_PAGE_SIZE], 0xFF, SIM_PAGE_SIZE);
    erase_cnt[page]++;
    return HAL_OK;
}

hal_status_t hal_logflash_write(uint32_t off, const uint8_t *d, uint16_t len)
{
    if (len % HAL_FLASH_WRITE_UNIT || off % HAL_FLASH_WRITE_UNIT) return HAL_ERROR;
    if (off + len > sizeof flash) return HAL_ERROR;
    if (cut) return HAL_ERROR;                 /* senza corrente non si scrive più nulla fino al riavvio */
    for (uint16_t u = 0; u < len; u += HAL_FLASH_WRITE_UNIT) {
        if (cut_after == 0) { cut = true; cut_after = -1; return HAL_ERROR; }  /* corrente via */
        if (cut_after > 0) cut_after--;
        /* ECC: un'unità si scrive solo se vergine */
        for (uint8_t i = 0; i < HAL_FLASH_WRITE_UNIT; i++)
            if (flash[off + u + i] != 0xFFu) return HAL_ERROR;
        memcpy(&flash[off + u], d + u, HAL_FLASH_WRITE_UNIT);
    }
    return HAL_OK;
}

void hal_logflash_read(uint32_t off, uint8_t *d, uint16_t len) { memcpy(d, &flash[off], len); }

/* ---------- I2C: SHT35 (0x44), LPS22HB (0x5C), EEPROM (0x50..0x53) ---------- */
#include "../../src/core/crc.h"

static uint16_t sht_raw_t(void) { return (uint16_t)(((int32_t)env_t + 450) * 65535 / 1750); }
static uint16_t sht_raw_h(void) { return (uint16_t)((uint32_t)env_h * 65535u / 1000u); }

hal_status_t hal_i2c_write(uint8_t a, const uint8_t *d, uint8_t len)
{
    if (a == 0x44u) {
        if (!sht_ok) return HAL_NACK;
        if (len == 2u) { sht_cmd[0] = d[0]; sht_cmd[1] = d[1]; }
        return HAL_OK;
    }
    if (a == 0x5Cu) {
        if (!lps_ok) return HAL_NACK;
        if (len >= 1u) lps_reg = d[0];
        if (len == 2u) {
            lps_regs[d[0] & 0x7Fu] = d[1];
            if (d[0] == 0x11u && (d[1] & 0x01u)) {        /* ONE_SHOT: misura pronta */
                uint32_t p = (uint32_t)env_p * 4096u / 10u;
                lps_regs[0x28] = (uint8_t)p; lps_regs[0x29] = (uint8_t)(p >> 8); lps_regs[0x2A] = (uint8_t)(p >> 16);
                lps_regs[0x11] &= (uint8_t)~0x01u;
                lps_regs[0x27] = 0x03u;                    /* STATUS: P e T disponibili */
            }
        }
        return HAL_OK;
    }
    if (a >= 0x50u && a <= 0x53u) {
        if (len < 1u) return HAL_ERROR;
        uint16_t base = (uint16_t)(((a - 0x50u) << 8) | d[0]);
        if (len > 17u) return HAL_ERROR;                  /* pagina da 16 byte */
        for (uint8_t i = 1; i < len; i++) {
            uint16_t addr = (uint16_t)((base & 0x3F0u) | ((base + i - 1u) & 0x0Fu));
            eeprom[addr] = d[i];
        }
        return HAL_OK;
    }
    return HAL_NACK;
}

hal_status_t hal_i2c_read(uint8_t a, uint8_t *d, uint8_t len)
{
    if (a == 0x44u) {
        if (!sht_ok) return HAL_NACK;
        if (len != 6u) return HAL_ERROR;
        uint16_t t = sht_raw_t(), h = sht_raw_h();
        d[0] = (uint8_t)(t >> 8); d[1] = (uint8_t)t; d[2] = crc8_sensirion(d, 2);
        d[3] = (uint8_t)(h >> 8); d[4] = (uint8_t)h; d[5] = crc8_sensirion(d + 3, 2);
        return HAL_OK;
    }
    return HAL_NACK;
}

hal_status_t hal_i2c_write_read(uint8_t a, const uint8_t *w, uint8_t wl, uint8_t *r, uint8_t rl)
{
    if (a == 0x5Cu) {
        if (!lps_ok) return HAL_NACK;
        uint8_t reg = w[0] & 0x7Fu;
        for (uint8_t i = 0; i < rl; i++) r[i] = lps_regs[(reg + i) & 0x7Fu];
        return HAL_OK;
    }
    if (a >= 0x50u && a <= 0x53u && wl == 1u) {
        uint16_t base = (uint16_t)(((a - 0x50u) << 8) | w[0]);
        for (uint8_t i = 0; i < rl; i++) r[i] = eeprom[(base + i) % 1024u];
        return HAL_OK;
    }
    return HAL_NACK;
}

/* ---------- UART: modem finto che risponde OK a ogni riga ---------- */
static char     tx_log[4096];
static uint16_t tx_len;
static char     rx_q[512];
static uint16_t rx_head, rx_tail;

void sim_uart_reset(void) { tx_len = 0; tx_log[0] = 0; rx_head = rx_tail = 0; }
const char *sim_uart_tx_log(void) { return tx_log; }

static void rx_push(const char *s) { while (*s) { rx_q[rx_head] = *s++; rx_head = (uint16_t)((rx_head + 1u) % sizeof rx_q); } }

void hal_uart_write(const uint8_t *d, uint16_t l)
{
    for (uint16_t i = 0; i < l; i++) {
        char c = (char)d[i];
        if (tx_len < sizeof tx_log - 2u) { tx_log[tx_len++] = (c == '\r') ? '\n' : c; tx_log[tx_len] = 0; }
        if (c == '\r') rx_push("\r\nOK\r\n");
    }
}
int16_t hal_uart_read_byte(void)
{
    if (rx_tail == rx_head) { ms += 1; return -1; }   /* il tempo scorre mentre si aspetta */
    char c = rx_q[rx_tail]; rx_tail = (uint16_t)((rx_tail + 1u) % sizeof rx_q);
    return (uint8_t)c;
}
void hal_uart_flush_rx(void) { rx_tail = rx_head; }
void hal_modem_power(bool on) { (void)on; }
bool hal_modem_status(void) { return true; }
