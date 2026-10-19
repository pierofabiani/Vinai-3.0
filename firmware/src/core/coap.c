#include "coap.h"
#include <string.h>

#define CODE_POST       0x02u
#define OPT_URI_PATH    11u
#define OPT_CFORMAT     12u
#define CFORMAT_OCTET   42u

uint16_t coap_build_post(uint16_t msg_id, const uint8_t token[4],
                         const uint8_t *payload, uint16_t plen, uint8_t *out, uint16_t out_max)
{
    if ((uint32_t)plen + COAP_OVERHEAD > out_max) return 0;
    uint16_t i = 0;
    out[i++] = (uint8_t)(0x40u | (COAP_TYPE_CON << 4) | 4u);   /* ver 1, CON, TKL 4 */
    out[i++] = CODE_POST;
    out[i++] = (uint8_t)(msg_id >> 8);
    out[i++] = (uint8_t)msg_id;
    memcpy(out + i, token, 4); i += 4;
    out[i++] = (uint8_t)((OPT_URI_PATH << 4) | 1u);            /* Uri-Path "m" */
    out[i++] = 'm';
    out[i++] = (uint8_t)(((OPT_CFORMAT - OPT_URI_PATH) << 4) | 1u);
    out[i++] = CFORMAT_OCTET;
    out[i++] = 0xFFu;                                          /* inizio payload */
    memcpy(out + i, payload, plen);
    return (uint16_t)(i + plen);
}

uint16_t coap_build_ack(uint16_t msg_id, uint8_t *out)
{
    out[0] = (uint8_t)(0x40u | (COAP_TYPE_ACK << 4));
    out[1] = 0;
    out[2] = (uint8_t)(msg_id >> 8);
    out[3] = (uint8_t)msg_id;
    return 4;
}

/* Salta le opzioni e trova il payload. false se il messaggio è malformato. */
static bool find_payload(const uint8_t *in, uint16_t len, uint16_t pos, const uint8_t **payload, uint16_t *plen)
{
    *payload = 0; *plen = 0;
    while (pos < len) {
        uint8_t b = in[pos++];
        if (b == 0xFFu) {
            if (pos >= len) return false;                      /* marker senza payload: vietato */
            *payload = in + pos; *plen = (uint16_t)(len - pos);
            return true;
        }
        uint16_t delta = b >> 4, olen = b & 0x0Fu;
        if (delta == 15u || olen == 15u) return false;
        if (delta == 13u) { if (pos >= len) return false; pos++; }
        else if (delta == 14u) { if (pos + 1u >= len) return false; pos += 2; }
        if (olen == 13u) { if (pos >= len) return false; olen = (uint16_t)(in[pos++] + 13u); }
        else if (olen == 14u) { if (pos + 1u >= len) return false; olen = (uint16_t)(((uint16_t)in[pos] << 8 | in[pos + 1]) + 269u); pos += 2; }
        if ((uint32_t)pos + olen > len) return false;
        pos = (uint16_t)(pos + olen);
    }
    return true;                                               /* nessun payload */
}

coap_rx_t coap_parse(const uint8_t *in, uint16_t len, uint16_t msg_id, const uint8_t token[4],
                     const uint8_t **payload, uint16_t *plen, uint16_t *rx_msg_id)
{
    *payload = 0; *plen = 0;
    if (len < 4u || (in[0] >> 6) != 1u) return COAP_RX_INVALID;
    uint8_t type = (uint8_t)((in[0] >> 4) & 3u), tkl = (uint8_t)(in[0] & 0x0Fu), code = in[1];
    uint16_t mid = (uint16_t)(((uint16_t)in[2] << 8) | in[3]);
    *rx_msg_id = mid;
    if (tkl > 8u || len < 4u + tkl) return COAP_RX_INVALID;

    if (type == COAP_TYPE_RST) return (mid == msg_id) ? COAP_RX_RESET : COAP_RX_OTHER;
    if (type == COAP_TYPE_ACK && code == 0u) return (mid == msg_id) ? COAP_RX_EMPTY_ACK : COAP_RX_OTHER;

    /* da qui in poi è una risposta: deve avere il nostro token */
    if (tkl != 4u || memcmp(in + 4, token, 4) != 0) return COAP_RX_OTHER;
    if (type == COAP_TYPE_ACK && mid != msg_id) return COAP_RX_OTHER;
    if (!find_payload(in, len, (uint16_t)(4u + tkl), payload, plen)) return COAP_RX_INVALID;

    uint8_t cls = (uint8_t)(code >> 5);
    if (cls == 4u || cls == 5u) return COAP_RX_ERROR;
    if (cls != 2u) return COAP_RX_INVALID;
    if (type == COAP_TYPE_ACK) return COAP_RX_RESPONSE;
    return COAP_RX_SEPARATE;                                  /* CON o NON con risposta */
}
