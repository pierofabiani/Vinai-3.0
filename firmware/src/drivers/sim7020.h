/*
 * sim7020.h — Comandi AT del modem SIMCom SIM7020E (NB-IoT).
 *
 * Il motore AT è sincrono con timeout: invia un comando e legge righe finché
 * arriva OK / ERROR o scade il tempo. Le notifiche spontanee (URC) che
 * arrivano nel frattempo vengono passate a sim7020_on_urc().
 *
 * TODO(fase 1): verificare sintassi e formati sul "SIM7020 Series AT Command
 * Manual" e con il modem reale al banco. I punti incerti sono marcati.
 */
#ifndef SIM7020_H
#define SIM7020_H

#include <stdint.h>
#include <stdbool.h>

typedef enum { AT_OK = 0, AT_ERROR, AT_TIMEOUT } at_result_t;

at_result_t at_cmd(const char *cmd, uint16_t timeout_ms);
/* Come at_cmd ma copia la prima riga che inizia con 'prefix' (es. "+CSQ:"). */
at_result_t at_query(const char *cmd, const char *prefix, char *line, uint8_t line_max, uint16_t timeout_ms);

bool sim7020_power_on(void);          /* accensione o risveglio dal PSM, attende "AT" -> OK */
void sim7020_power_off(void);
/* Eco off, bande, APN, operatore (0 = automatico), PSM. Da rifare se cambiano. */
bool sim7020_setup_once(const char *apn, const uint8_t bands[4], uint32_t plmn);
bool sim7020_wait_registered(uint16_t timeout_s);

/* Socket UDP */
bool sim7020_udp_open(const uint8_t ip[4], uint16_t port, uint8_t *sock);
bool sim7020_udp_send(uint8_t sock, const uint8_t *data, uint16_t len);
/* Attende un datagramma (URC +CSONMI) fino a timeout_ms. Ritorna la lunghezza, 0 se nulla. */
uint16_t sim7020_udp_recv(uint8_t sock, uint8_t *buf, uint16_t max, uint16_t timeout_ms);
void sim7020_udp_close(uint8_t sock);

void sim7020_signal(int8_t *rsrp_dbm, int8_t *snr_db, uint8_t *csq);

/* Parser puri (testati su PC) */
bool sim7020_parse_cereg(const char *line, uint8_t *stat);          /* "+CEREG: 0,1" */
bool sim7020_parse_csq(const char *line, uint8_t *rssi);            /* "+CSQ: 17,99" */
bool sim7020_parse_csonmi(const char *line, uint8_t *sock,
                          uint8_t *buf, uint16_t max, uint16_t *len); /* "+CSONMI: 0,8,A1B2C3D4" */

#endif
