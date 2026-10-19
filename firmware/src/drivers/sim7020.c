#include "sim7020.h"
#include "../hal/hal.h"
#include <string.h>

#define LINE_MAX 260u      /* un +CSONMI con la risposta più lunga (103 byte = 206 caratteri hex) */

static char     line[LINE_MAX];

/* Datagramma ricevuto in modo asincrono durante un altro comando */
#define RXQ_MAX 128u
static uint8_t  rxq[RXQ_MAX];
static uint16_t rxq_len;
static bool     rxq_full;

/* ------------------------------------------------------------ utilità */

static void uart_puts(const char *s) { hal_uart_write((const uint8_t *)s, (uint16_t)strlen(s)); }

static int8_t hexval(char c)
{
    if (c >= '0' && c <= '9') return (int8_t)(c - '0');
    if (c >= 'A' && c <= 'F') return (int8_t)(c - 'A' + 10);
    if (c >= 'a' && c <= 'f') return (int8_t)(c - 'a' + 10);
    return -1;
}

static const char *parse_uint(const char *p, uint16_t *v)
{
    if (*p < '0' || *p > '9') return 0;
    uint16_t n = 0;
    while (*p >= '0' && *p <= '9') { n = (uint16_t)(n * 10u + (uint16_t)(*p - '0')); p++; }
    *v = n;
    return p;
}

static bool starts(const char *s, const char *pfx) { return strncmp(s, pfx, strlen(pfx)) == 0; }

/* Legge una riga terminata da \r\n. false su timeout. */
static bool read_line(uint32_t deadline)
{
    uint16_t n = 0;
    for (;;) {
        int16_t c = hal_uart_read_byte();
        if (c < 0) {
            if ((int32_t)(hal_millis() - deadline) >= 0) return false;
            continue;   /* TODO(PIC): qui si può dormire in Idle fino al prossimo byte */
        }
        if (c == '\r') continue;
        if (c == '\n') {
            if (n == 0u) continue;
            line[n] = 0;
            return true;
        }
        if (n < LINE_MAX - 1u) line[n++] = (char)c;
    }
}

/* ------------------------------------------------------------ parser */

bool sim7020_parse_cereg(const char *l, uint8_t *stat)
{
    uint16_t a, b;
    if (!starts(l, "+CEREG:")) return false;
    const char *p = l + 7; while (*p == ' ') p++;
    p = parse_uint(p, &a); if (!p) return false;
    if (*p == ',') {                         /* risposta a AT+CEREG?: "<n>,<stat>[,...]" */
        p = parse_uint(p + 1, &b); if (!p) return false;
        *stat = (uint8_t)b;
    } else {
        *stat = (uint8_t)a;                  /* URC: "+CEREG: <stat>" */
    }
    return true;
}

bool sim7020_parse_csq(const char *l, uint8_t *rssi)
{
    uint16_t a;
    if (!starts(l, "+CSQ:")) return false;
    const char *p = l + 5; while (*p == ' ') p++;
    if (!parse_uint(p, &a)) return false;
    *rssi = (uint8_t)a;
    return true;
}

/* TODO(fase 1): verificare se <data_len> conta byte o caratteri esadecimali. Qui
 * si accettano entrambi: si usa la lunghezza effettiva della stringa esadecimale. */
bool sim7020_parse_csonmi(const char *l, uint8_t *sock, uint8_t *buf, uint16_t max, uint16_t *len)
{
    uint16_t s, dl;
    if (!starts(l, "+CSONMI:")) return false;
    const char *p = l + 8; while (*p == ' ') p++;
    p = parse_uint(p, &s); if (!p || *p != ',') return false;
    p = parse_uint(p + 1, &dl); if (!p || *p != ',') return false;
    p++;
    if (*p == '"') p++;
    uint16_t n = 0;
    while (p[0] && p[1] && p[0] != '"') {
        int8_t hi = hexval(p[0]), lo = hexval(p[1]);
        if (hi < 0 || lo < 0) return false;
        if (n >= max) return false;
        buf[n++] = (uint8_t)((hi << 4) | lo);
        p += 2;
    }
    (void)dl;
    *sock = (uint8_t)s;
    *len = n;
    return n > 0u;
}

/* ------------------------------------------------------------ motore AT */

static void handle_urc(void)
{
    uint8_t s; uint16_t n;
    if (starts(line, "+CSONMI:") && sim7020_parse_csonmi(line, &s, rxq, RXQ_MAX, &n)) {
        rxq_len = n; rxq_full = true;
    }
    /* altri URC (+CEREG, +CPIN, ...) ignorati: lo stato si interroga quando serve */
}

at_result_t at_query(const char *cmd, const char *prefix, char *out, uint8_t out_max, uint16_t timeout_ms)
{
    uint32_t deadline = hal_millis() + timeout_ms;
    bool got = (prefix == 0);
    uart_puts(cmd);
    uart_puts("\r");
    while (read_line(deadline)) {
        if (strcmp(line, "OK") == 0) return got ? AT_OK : AT_ERROR;
        if (strcmp(line, "ERROR") == 0 || starts(line, "+CME ERROR")) return AT_ERROR;
        if (prefix && !got && starts(line, prefix)) {
            strncpy(out, line, out_max - 1u); out[out_max - 1u] = 0;
            got = true;
            continue;
        }
        handle_urc();
    }
    return AT_TIMEOUT;
}

at_result_t at_cmd(const char *cmd, uint16_t timeout_ms) { return at_query(cmd, 0, 0, 0, timeout_ms); }

/* ------------------------------------------------------------ alto livello */

bool sim7020_power_on(void)
{
    /* TODO(fase 1): sequenza PWRKEY e risveglio dal PSM secondo lo schema reale
     * (il vecchio firmware tiene il pin su LATx bit 15 per ~1,5 s). */
    hal_modem_power(true);
    for (uint8_t i = 0; i < 10u; i++) {
        hal_watchdog_kick();
        if (at_cmd("AT", 500) == AT_OK) return true;
    }
    return false;
}

void sim7020_power_off(void)
{
    at_cmd("AT+CPOWD=1", 2000);    /* TODO(fase 1): verificare comando di spegnimento */
    hal_modem_power(false);
}

/* Costruisce un comando AT in un buffer, senza sprintf (più leggero sul PIC). */
static void cat_num(char *dst, uint32_t v)
{
    char t[11]; uint8_t n = 0;
    do { t[n++] = (char)('0' + v % 10u); v /= 10u; } while (v);
    dst += strlen(dst);
    while (n) *dst++ = t[--n];
    *dst = 0;
}

bool sim7020_setup_once(const char *apn, const uint8_t bands[4], uint32_t plmn)
{
    char cmd[64];
    if (at_cmd("ATE0", 500) != AT_OK) return false;
    at_cmd("AT+CMEE=1", 500);
    at_cmd("AT+CFUN=0", 5000);                              /* radio spenta mentre si cambiano i parametri */

    strcpy(cmd, "AT+CBAND=");                               /* bande NB-IoT dalla configurazione */
    for (uint8_t i = 0; i < 4u && bands[i] != 0u; i++) {
        if (i) strcat(cmd, ",");
        cat_num(cmd, bands[i]);
    }
    at_cmd(cmd, 1000);

    strcpy(cmd, "AT*MCGDEFCONT=\"IP\",\"");              /* APN del contesto di default */
    strncat(cmd, apn, sizeof cmd - strlen(cmd) - 3u);
    strcat(cmd, "\"");
    if (at_cmd(cmd, 2000) != AT_OK) return false;

    if (at_cmd("AT+CFUN=1", 10000) != AT_OK) return false;

    /* operatore: automatico oppure forzato (utile con SIM in roaming) */
    if (plmn == 0u) {
        at_cmd("AT+COPS=0", 5000);
    } else {
        strcpy(cmd, "AT+COPS=1,2,\"");
        cat_num(cmd, plmn);
        strcat(cmd, "\"");
        at_cmd(cmd, 60000);                                 /* la selezione manuale può essere lenta */
    }

    /* PSM: TAU 24 h ("00111000" = 24 x 1 h), tempo attivo 10 s ("00000101" = 5 x 2 s).
     * TODO(fase 1): verificare cosa concede la rete con AT+CEREG=4. */
    at_cmd("AT+CPSMS=1,,,\"00111000\",\"00000101\"", 1000);
    return true;
}

bool sim7020_wait_registered(uint16_t timeout_s)
{
    char l[40]; uint8_t st;
    uint32_t t0 = hal_millis();
    while ((uint32_t)(hal_millis() - t0) < (uint32_t)timeout_s * 1000u) {
        hal_watchdog_kick();
        if (at_query("AT+CEREG?", "+CEREG:", l, sizeof l, 1000) == AT_OK &&
            sim7020_parse_cereg(l, &st) && (st == 1u || st == 5u)) return true;  /* 1 = casa, 5 = roaming */
        hal_delay_ms(2000);
    }
    return false;
}

static void u8_to_dec(uint16_t v, char *out)
{
    char t[6]; uint8_t n = 0;
    do { t[n++] = (char)('0' + v % 10u); v /= 10u; } while (v);
    while (n) *out++ = t[--n];
    *out = 0;
}

bool sim7020_udp_open(const uint8_t ip[4], uint16_t port, uint8_t *sock)
{
    char l[32], cmd[48], num[6];
    uint16_t s;
    if (at_query("AT+CSOC=1,2,1", "+CSOC:", l, sizeof l, 2000) != AT_OK) return false;  /* IPv4, UDP */
    const char *p = l + 6; while (*p == ' ') p++;
    if (!parse_uint(p, &s)) return false;
    *sock = (uint8_t)s;
    strcpy(cmd, "AT+CSOCON="); u8_to_dec(s, num); strcat(cmd, num);
    strcat(cmd, ","); u8_to_dec(port, num); strcat(cmd, num); strcat(cmd, ",\"");
    for (uint8_t i = 0; i < 4u; i++) { u8_to_dec(ip[i], num); strcat(cmd, num); if (i < 3u) strcat(cmd, "."); }
    strcat(cmd, "\"");
    rxq_full = false;
    return at_cmd(cmd, 5000) == AT_OK;
}

bool sim7020_udp_send(uint8_t sock, const uint8_t *data, uint16_t len)
{
    static const char hx[] = "0123456789ABCDEF";
    char head[24], num[6];
    /* TODO(fase 1): verificare se <data_len> va espresso in byte o in caratteri hex */
    strcpy(head, "AT+CSOSEND="); u8_to_dec(sock, num); strcat(head, num);
    strcat(head, ","); u8_to_dec((uint16_t)(len * 2u), num); strcat(head, num); strcat(head, ",");
    uart_puts(head);
    for (uint16_t i = 0; i < len; i++) {
        uint8_t b[2] = { (uint8_t)hx[data[i] >> 4], (uint8_t)hx[data[i] & 0x0Fu] };
        hal_uart_write(b, 2);
    }
    return at_cmd("", 10000) == AT_OK;   /* il CR finale chiude il comando */
}

uint16_t sim7020_udp_recv(uint8_t sock, uint8_t *buf, uint16_t max, uint16_t timeout_ms)
{
    uint32_t deadline = hal_millis() + timeout_ms;
    (void)sock;
    for (;;) {
        if (rxq_full) {
            uint16_t n = (rxq_len > max) ? max : rxq_len;
            memcpy(buf, rxq, n);
            rxq_full = false;
            return n;
        }
        if (!read_line(deadline)) return 0;
        handle_urc();
    }
}

void sim7020_udp_close(uint8_t sock)
{
    char cmd[16], num[6];
    strcpy(cmd, "AT+CSOCL="); u8_to_dec(sock, num); strcat(cmd, num);
    at_cmd(cmd, 2000);
}

void sim7020_signal(int8_t *rsrp, int8_t *snr, uint8_t *csq)
{
    char l[40]; uint8_t r = 99;
    if (at_query("AT+CSQ", "+CSQ:", l, sizeof l, 1000) == AT_OK) sim7020_parse_csq(l, &r);
    *csq = r;
    /* TODO(fase 1): RSRP e SNR reali da AT+CENG? (formato da verificare).
     * Per ora stima grossolana dal CSQ: dBm ~ -113 + 2*CSQ. */
    *rsrp = (r == 99u) ? (int8_t)-128 : (int8_t)(-113 + 2 * (int16_t)r);
    *snr = (int8_t)-128;
}
