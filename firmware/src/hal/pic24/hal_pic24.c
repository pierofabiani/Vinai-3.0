/*
 * hal_pic24.c — HAL per il PIC24FJ256GA704 della scheda Hive Rev 1.1.
 *
 * STATO: scheletro. NON ancora compilato con XC16 né provato sulla scheda.
 * Le parti che dipendono dai collegamenti sono marcate TODO(fase 1) e vanno
 * completate con la mappa dei pin (ricavata dal vecchio firmware e verificata
 * al banco). Indizi già trovati nel firmware V1.14:
 *   - UART1 verso il modem a 19200 baud (U1BRG = 51 con BRGH = 1, Fcy = 4 MHz)
 *   - I2C1 per SHT35 (0x44), LPS22HB (0x5C) ed EEPROM (0x50)
 *   - bagnatura fogliare letta con il CTMU sul canale analogico AN7
 *   - batteria letta con l'ADC, partitore acceso da un pin prima della misura
 *   - pin di accensione del modem su un LAT bit 15, stato modem su un PORT bit 4
 *   - RTCC con allarme; il vecchio firmware lo usava fisso ogni 10 minuti
 *
 * Bit di configurazione: generarli da MPLAB X (Window > Target Memory Views >
 * Configuration Bits) con queste scelte:
 *   - oscillatore FRC 8 MHz, cristallo 32 kHz (SOSC) per l'RTCC  TODO: verificare che il quarzo ci sia
 *   - watchdog attivo solo fuori dallo sleep, periodo ~8 s
 *   - brown-out reset attivo
 *   - segmento di boot protetto per il futuro bootloader (FBSLIM)
 *   - programmazione su PGEC2/PGED2 (come la configurazione attuale, FICD ICS = 2)
 */
#include <xc.h>
#include "../hal.h"

#define FCY 4000000UL

/* ------------------------------------------------------------ sistema */

static volatile uint32_t s_ms;          /* incrementato dal Timer1 a 1 kHz mentre la CPU è sveglia */
static uint8_t s_reset_reason;

void __attribute__((interrupt, no_auto_psv)) _T1Interrupt(void) { s_ms++; IFS0bits.T1IF = 0; }

void hal_init(void)
{
    /* motivo del reset, poi azzera i flag */
    if (RCONbits.WDTO)       s_reset_reason = RESET_WATCHDOG;
    else if (RCONbits.BOR && !RCONbits.POR) s_reset_reason = RESET_BROWN_OUT;
    else if (RCONbits.POR)   s_reset_reason = RESET_POWER_ON;
    else if (RCONbits.SWR)   s_reset_reason = RESET_SOFTWARE;
    else if (RCONbits.EXTR)  s_reset_reason = RESET_MCLR;
    else                     s_reset_reason = RESET_OTHER;
    RCON = 0;

    /* tutti i pin digitali e in uscita bassa, salvo quelli usati: minimo consumo */
    ANSA = 0; ANSB = 0; ANSC = 0;       /* TODO(fase 1): lasciare analogici AN7 (bagnatura) e il pin batteria */
    /* TODO(fase 1): TRIS/LAT di tutti i pin secondo lo schema; PPS per UART1 */

    /* Timer1: tick 1 ms */
    T1CON = 0; TMR1 = 0; PR1 = (uint16_t)(FCY / 1000UL - 1UL);
    IFS0bits.T1IF = 0; IEC0bits.T1IE = 1; T1CONbits.TON = 1;

    /* UART1: 19200 8N1 verso il SIM7020 */
    U1MODE = 0; U1MODEbits.BRGH = 1; U1BRG = (uint16_t)(FCY / (4UL * 19200UL) - 1UL);
    U1MODEbits.UARTEN = 1; U1STAbits.UTXEN = 1;

    /* I2C1 a 100 kHz */
    I2C1BRG = 0x12;                     /* TODO(fase 1): verificare con la formula del datasheet a Fcy 4 MHz */
    I2C1CONLbits.I2CEN = 1;

    /* TODO(fase 1): RTCC (RTCCON1L, SOSC), ADC a 12 bit, CTMU */
}

uint32_t hal_millis(void)
{
    uint32_t v;
    IEC0bits.T1IE = 0; v = s_ms; IEC0bits.T1IE = 1;
    return v;
}

void hal_delay_ms(uint16_t ms) { uint32_t t0 = hal_millis(); while ((uint32_t)(hal_millis() - t0) < ms) { ClrWdt(); } }
void hal_watchdog_kick(void) { ClrWdt(); }
uint8_t hal_reset_reason(void) { return s_reset_reason; }
void hal_reset(void) { __asm__ volatile ("reset"); }

/* ------------------------------------------------------------ RTCC
 * TODO(fase 1): il PIC24FJ256GA705 ha l'RTCC "nuovo" (registri TIMEL/TIMEH,
 * DATEL/DATEH in BCD, allarme ALMTIMEL/ALMDATEL). Conversione epoca<->BCD in
 * software. Per un risveglio dopo N secondi: leggere l'ora, sommare N,
 * scrivere l'allarme con maschera "ogni giorno" (AMASK) e abilitare l'interrupt. */
uint32_t hal_rtc_now(void) { return 0; }
void hal_rtc_set(uint32_t t) { (void)t; }
void hal_rtc_alarm_in(uint16_t s) { (void)s; }

void hal_sleep(void)
{
    T1CONbits.TON = 0;                  /* il tick ms non serve durante lo sleep */
    Sleep();
    T1CONbits.TON = 1;
}

/* ------------------------------------------------------------ I2C (polling con timeout) */

static bool i2c_wait(volatile uint16_t *reg, uint16_t mask, bool until_set)
{
    uint32_t t0 = hal_millis();
    while (((*reg & mask) != 0u) != until_set) {
        if ((uint32_t)(hal_millis() - t0) > 10u) return false;
    }
    return true;
}

static void i2c_stop(void) { I2C1CONLbits.PEN = 1; i2c_wait(&I2C1CONL, 0x0004u, false); }

static hal_status_t i2c_start_addr(uint8_t addr7, bool read, bool restart)
{
    if (restart) { I2C1CONLbits.RSEN = 1; if (!i2c_wait(&I2C1CONL, 0x0002u, false)) return HAL_TIMEOUT; }
    else         { I2C1CONLbits.SEN = 1;  if (!i2c_wait(&I2C1CONL, 0x0001u, false)) return HAL_TIMEOUT; }
    I2C1TRN = (uint16_t)((addr7 << 1) | (read ? 1u : 0u));
    if (!i2c_wait(&I2C1STAT, 0x4000u, false)) return HAL_TIMEOUT;     /* TRSTAT */
    if (I2C1STATbits.ACKSTAT) { i2c_stop(); return HAL_NACK; }
    return HAL_OK;
}

static hal_status_t i2c_tx(const uint8_t *d, uint8_t n)
{
    for (uint8_t i = 0; i < n; i++) {
        I2C1TRN = d[i];
        if (!i2c_wait(&I2C1STAT, 0x4000u, false)) return HAL_TIMEOUT;
        if (I2C1STATbits.ACKSTAT) return HAL_NACK;
    }
    return HAL_OK;
}

static hal_status_t i2c_rx(uint8_t *d, uint8_t n)
{
    for (uint8_t i = 0; i < n; i++) {
        I2C1CONLbits.RCEN = 1;
        if (!i2c_wait(&I2C1STAT, 0x0002u, true)) return HAL_TIMEOUT; /* RBF */
        d[i] = (uint8_t)I2C1RCV;
        I2C1CONLbits.ACKDT = (i + 1u == n) ? 1 : 0;                   /* NACK sull'ultimo byte */
        I2C1CONLbits.ACKEN = 1;
        if (!i2c_wait(&I2C1CONL, 0x0010u, false)) return HAL_TIMEOUT;
    }
    return HAL_OK;
}

hal_status_t hal_i2c_write(uint8_t a, const uint8_t *d, uint8_t n)
{
    hal_status_t s = i2c_start_addr(a, false, false);
    if (s != HAL_OK) return s;
    s = i2c_tx(d, n);
    i2c_stop();
    return s;
}

hal_status_t hal_i2c_read(uint8_t a, uint8_t *d, uint8_t n)
{
    hal_status_t s = i2c_start_addr(a, true, false);
    if (s != HAL_OK) return s;
    s = i2c_rx(d, n);
    i2c_stop();
    return s;
}

hal_status_t hal_i2c_write_read(uint8_t a, const uint8_t *w, uint8_t wl, uint8_t *r, uint8_t rl)
{
    hal_status_t s = i2c_start_addr(a, false, false);
    if (s == HAL_OK) s = i2c_tx(w, wl);
    if (s == HAL_OK) s = i2c_start_addr(a, true, true);
    if (s == HAL_OK) s = i2c_rx(r, rl);
    i2c_stop();
    return s;
}

/* ------------------------------------------------------------ UART (ricezione in interrupt, buffer circolare) */

#define RXB 512u
static volatile uint8_t  rxb[RXB];
static volatile uint16_t rx_head, rx_tail;

void __attribute__((interrupt, no_auto_psv)) _U1RXInterrupt(void)
{
    while (U1STAbits.URXDA) {
        uint16_t n = (uint16_t)((rx_head + 1u) % RXB);
        uint8_t c = (uint8_t)U1RXREG;
        if (n != rx_tail) { rxb[rx_head] = c; rx_head = n; }   /* buffer pieno: il byte si perde, ma il protocollo se ne accorge */
    }
    if (U1STAbits.OERR) U1STAbits.OERR = 0;
    IFS0bits.U1RXIF = 0;
}

void hal_uart_write(const uint8_t *d, uint16_t n)
{
    for (uint16_t i = 0; i < n; i++) {
        uint32_t t0 = hal_millis();
        while (U1STAbits.UTXBF) { if ((uint32_t)(hal_millis() - t0) > 50u) return; }  /* mai bloccati per sempre */
        U1TXREG = d[i];
    }
}

int16_t hal_uart_read_byte(void)
{
    if (rx_tail == rx_head) return -1;
    uint8_t c = rxb[rx_tail];
    rx_tail = (uint16_t)((rx_tail + 1u) % RXB);
    return c;
}

void hal_uart_flush_rx(void) { rx_tail = rx_head; }

/* ------------------------------------------------------------ modem, sensori, analogico: TODO(fase 1) */

void hal_modem_power(bool on) { (void)on; /* TODO(fase 1): PWRKEY / alimentazione del SIM7020 */ }
bool hal_modem_status(void) { return true; /* TODO(fase 1) */ }
void hal_sensors_power(bool on) { (void)on; /* TODO(fase 1): se i sensori hanno un'alimentazione comandata */ }
uint16_t hal_battery_mv(void) { return 0; /* TODO(fase 1): partitore + ADC, coefficiente dal vecchio firmware */ }

/* Bagnatura con il CTMU, come nel vecchio firmware (V1.14, funzione a 0x3A5E):
 * scarica, carica a corrente costante per un tempo fisso, campiona su AN7.
 * TODO(fase 1): rifare con tempi in microsecondi veri (il vecchio usa cicli
 * di attesa) e mediare 16 letture come prima. */
hal_status_t hal_wetness_raw(uint16_t *raw) { *raw = 0; return HAL_ERROR; }

/* ------------------------------------------------------------ flash del registro
 * Area riservata nel linker script (vedi README): 24 pagine da 1024 istruzioni.
 * Scrittura a doppia parola (NVMCON = 0x4001), cancellazione di pagina (0x4003).
 * Si usano solo i 16 bit bassi di ogni istruzione (vista PSV), quindi una
 * doppia parola contiene 4 byte utili = HAL_FLASH_WRITE_UNIT.
 * TODO(fase 1): indirizzo base dell'area (LOG_BASE) dopo aver fissato la mappa
 * di memoria con il bootloader. */
#define LOG_BASE        0x01E000UL          /* pagine 60-83, vedi mappa della flash nel README */
#define PAGE_INSTR      1024UL
#define PAGE_BYTES      2048u
#define PAGES           24u

uint16_t hal_logflash_page_size(void) { return PAGE_BYTES; }
uint16_t hal_logflash_page_count(void) { return PAGES; }

static uint32_t to_paddr(uint32_t off) { return LOG_BASE + off; }   /* 2 byte utili = 2 unità di indirizzo */

hal_status_t hal_logflash_erase_page(uint16_t page)
{
    uint32_t a = LOG_BASE + (uint32_t)page * PAGE_INSTR * 2UL;
    NVMCON = 0x4003;
    NVMADRU = (uint16_t)(a >> 16); NVMADR = (uint16_t)a;
    __builtin_disi(5);
    __builtin_write_NVM();
    while (NVMCONbits.WR) {}
    return NVMCONbits.WRERR ? HAL_ERROR : HAL_OK;
}

hal_status_t hal_logflash_write(uint32_t off, const uint8_t *d, uint16_t len)
{
    if ((off % 4u) || (len % 4u)) return HAL_ERROR;
    for (uint16_t i = 0; i < len; i += 4u) {
        uint32_t a = to_paddr(off + i);
        TBLPAG = 0xFA;                                   /* latch di scrittura */
        __builtin_tblwtl(0, (uint16_t)(d[i] | ((uint16_t)d[i + 1] << 8)));
        __builtin_tblwth(0, 0xFF);
        __builtin_tblwtl(2, (uint16_t)(d[i + 2] | ((uint16_t)d[i + 3] << 8)));
        __builtin_tblwth(2, 0xFF);
        NVMCON = 0x4001;
        NVMADRU = (uint16_t)(a >> 16); NVMADR = (uint16_t)a;
        __builtin_disi(5);
        __builtin_write_NVM();
        while (NVMCONbits.WR) {}
        if (NVMCONbits.WRERR) return HAL_ERROR;
    }
    return HAL_OK;
}

void hal_logflash_read(uint32_t off, uint8_t *d, uint16_t len)
{
    for (uint16_t i = 0; i < len; i += 2u) {
        uint32_t a = to_paddr(off + i);
        TBLPAG = (uint16_t)(a >> 16);
        uint16_t w = __builtin_tblrdl((uint16_t)a);
        d[i] = (uint8_t)w;
        if (i + 1u < len) d[i + 1] = (uint8_t)(w >> 8);
    }
}
