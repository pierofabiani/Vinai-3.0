/*
 * coap.h — Il minimo di CoAP (RFC 7252) che serve alla centralina.
 *
 * Il messaggio CoAP lo costruisce il firmware; il modem lo spedisce come
 * semplice datagramma UDP. Così non dipendiamo dall'implementazione CoAP
 * interna del SIM7020 (poco documentata) e la parte si testa su PC.
 *
 * Richiesta: CON, POST, token 4 byte, Uri-Path "m", Content-Format 42 (octet-stream).
 * Risposta attesa: ACK con risposta allegata (2.01/2.04) e stesso token.
 */
#ifndef COAP_H
#define COAP_H

#include <stdint.h>
#include <stdbool.h>

#define COAP_OVERHEAD      13u     /* header 4 + token 4 + opzioni 4 + marker 1 */
#define COAP_TYPE_CON      0u
#define COAP_TYPE_NON      1u
#define COAP_TYPE_ACK      2u
#define COAP_TYPE_RST      3u

/* Parametri di ritrasmissione adattati a NB-IoT (latenze di secondi). */
#define COAP_ACK_TIMEOUT_MS   6000u
#define COAP_MAX_RETRANSMIT   3u      /* attese 6 + 12 + 24 + 48 s = 90 s al massimo */

uint16_t coap_build_post(uint16_t msg_id, const uint8_t token[4],
                         const uint8_t *payload, uint16_t plen, uint8_t *out, uint16_t out_max);

typedef enum {
    COAP_RX_INVALID = 0,
    COAP_RX_RESPONSE,     /* ACK con risposta 2.xx: payload valido */
    COAP_RX_EMPTY_ACK,    /* il server ha ricevuto, la risposta arriverà a parte */
    COAP_RX_SEPARATE,     /* risposta separata (CON): va confermata con coap_build_ack */
    COAP_RX_ERROR,        /* risposta 4.xx / 5.xx */
    COAP_RX_RESET,
    COAP_RX_OTHER         /* non riguarda questa richiesta: ignorare */
} coap_rx_t;

coap_rx_t coap_parse(const uint8_t *in, uint16_t len, uint16_t msg_id, const uint8_t token[4],
                     const uint8_t **payload, uint16_t *plen, uint16_t *rx_msg_id);

uint16_t coap_build_ack(uint16_t msg_id, uint8_t *out);   /* ACK vuoto, 4 byte */

#endif
