/*
 * hal.h — Interfaccia hardware della centralina Hive (Vinai 3.0)
 *
 * Tutto il codice applicativo e i moduli "core" parlano con l'hardware SOLO
 * attraverso queste funzioni. Esistono due implementazioni:
 *   - src/hal/pic24/  : PIC24FJ256GA704 reale (da completare con la mappa pin, fase 1)
 *   - tests/hal_host/ : simulazione su PC, usata dai test automatici
 *
 * Regola: nessuna funzione HAL può bloccarsi senza timeout.
 */
#ifndef HAL_H
#define HAL_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

/* ---------- Esito comune ---------- */
typedef enum {
    HAL_OK = 0,
    HAL_TIMEOUT,
    HAL_NACK,        /* I2C: periferica non risponde */
    HAL_ERROR
} hal_status_t;

/* ---------- Sistema ---------- */
void     hal_init(void);
uint32_t hal_millis(void);              /* ms dall'avvio, avanza anche durante le attese */
void     hal_delay_ms(uint16_t ms);
void     hal_watchdog_kick(void);
uint8_t  hal_reset_reason(void);        /* vedi RESET_* sotto, letto da RCON all'avvio */
void     hal_reset(void);               /* reset software */

#define RESET_POWER_ON   1u
#define RESET_BROWN_OUT  2u
#define RESET_WATCHDOG   3u
#define RESET_SOFTWARE   4u
#define RESET_MCLR       5u
#define RESET_OTHER      6u

/* ---------- Orologio (RTCC) ----------
 * Tempo in secondi dal 2020-01-01 00:00:00 UTC. */
uint32_t hal_rtc_now(void);
void     hal_rtc_set(uint32_t epoch2020);
/* Programma la prossima sveglia dal sonno dopo 'seconds' secondi. */
void     hal_rtc_alarm_in(uint16_t seconds);

/* Sonno profondo fino alla prossima sveglia (RTCC o interrupt). */
void     hal_sleep(void);

/* ---------- I2C (SHT35, LPS22HB, EEPROM 24C08) ----------
 * addr7 = indirizzo a 7 bit. */
hal_status_t hal_i2c_write(uint8_t addr7, const uint8_t *data, uint8_t len);
hal_status_t hal_i2c_read(uint8_t addr7, uint8_t *data, uint8_t len);
hal_status_t hal_i2c_write_read(uint8_t addr7, const uint8_t *wdata, uint8_t wlen,
                                uint8_t *rdata, uint8_t rlen);

/* ---------- UART verso il modem SIM7020E ---------- */
void     hal_uart_write(const uint8_t *data, uint16_t len);
int16_t  hal_uart_read_byte(void);      /* -1 se non ci sono byte */
void     hal_uart_flush_rx(void);

/* ---------- Alimentazione e controllo modem ---------- */
void     hal_modem_power(bool on);       /* alimentazione / PWRKEY */
bool     hal_modem_status(void);         /* pin STATUS del modem, se cablato */

/* ---------- Analogico ----------
 * Batteria: millivolt, partitore acceso solo durante la misura.
 * Bagnatura: lettura capacitiva con il CTMU, valore grezzo ADC a 12 bit.
 *            Più la foglia è bagnata, più la capacità sale (polarità da
 *            confermare al banco: vedi config.wet_polarity). */
uint16_t hal_battery_mv(void);
hal_status_t hal_wetness_raw(uint16_t *raw);

/* Alimentazione dei sensori, se c'è un pin dedicato (da verificare). */
void     hal_sensors_power(bool on);

/* ---------- Flash interna per il registro misure ----------
 * Vista a 16 bit della flash di programma (come PSV): ogni istruzione da 24 bit
 * conserva 2 byte utili. La flash è con ECC: ogni "unità di scrittura" si
 * scrive UNA sola volta dopo la cancellazione della pagina.
 * Gli offset sono relativi all'inizio dell'area registro. */
#define HAL_FLASH_WRITE_UNIT  4u        /* byte utili di una doppia parola */
uint16_t     hal_logflash_page_size(void);   /* byte utili per pagina */
uint16_t     hal_logflash_page_count(void);
hal_status_t hal_logflash_erase_page(uint16_t page);
hal_status_t hal_logflash_write(uint32_t offset, const uint8_t *data, uint16_t len);
void         hal_logflash_read(uint32_t offset, uint8_t *data, uint16_t len);

#endif /* HAL_H */
