/*
 * net.h — Trasporto verso il server, indipendente dal modem.
 *
 * Implementazioni:
 *   src/app/net_sim7020.c   : modem SIM7020E via comandi AT CoAP (solo PIC)
 *   tests/hal_host/net_host.c: rete simulata per i test
 *
 * net_exchange invia UN messaggio CoAP POST confermabile e attende la risposta
 * allegata. Le ritrasmissioni CoAP (4 tentativi, attese crescenti) avvengono
 * dentro questa funzione.
 */
#ifndef NET_H
#define NET_H

#include <stdint.h>
#include <stdbool.h>
#include "../core/config.h"

typedef enum {
    NET_OK = 0,
    NET_NO_NETWORK,      /* registrazione in rete fallita */
    NET_NO_RESPONSE,     /* inviato, nessuna risposta valida */
    NET_MODEM_FAIL       /* il modem non risponde ai comandi */
} net_result_t;

net_result_t net_open(const config_t *cfg);
net_result_t net_exchange(const uint8_t *req, uint16_t len, uint8_t *resp, uint16_t *resp_len, uint16_t resp_max);
void         net_close(void);                 /* modem in PSM (o spento se il PSM non c'è) */
void         net_radio_info(int8_t *rsrp_dbm, int8_t *snr_db, uint8_t *csq);

#endif
