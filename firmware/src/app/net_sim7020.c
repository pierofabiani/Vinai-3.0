/*
 * net_sim7020.c — net.h sul modem SIM7020E: CoAP costruito dal firmware, spedito in UDP.
 * Solo PIC (escluso dai test su PC, che usano tests/hal_host/net_host.c).
 */
#include "net.h"
#include "../drivers/sim7020.h"
#include "../core/coap.h"
#include "../core/packet.h"
#include "../hal/hal.h"
#include <string.h>

#define REGISTER_TIMEOUT  90u     /* s */

static bool    s_setup_done;
static config_t s_applied;          /* parametri di rete con cui il modem è stato configurato */
static bool    s_open;
static uint8_t s_sock;
static uint16_t s_msg_id;
static int8_t  s_rsrp = -128, s_snr = -128;
static uint8_t s_csq = 99;

static uint8_t coap_tx[PKT_MAX_UPLINK_COAP];
static uint8_t coap_rx[160];

net_result_t net_open(const config_t *cfg)
{
    if (!sim7020_power_on()) { sim7020_power_off(); return NET_MODEM_FAIL; }
    /* il modem si riconfigura alla prima accensione e quando cambiano APN, bande o operatore */
    if (!s_setup_done || !config_net_equal(cfg, &s_applied)) {
        if (!sim7020_setup_once(cfg->apn, cfg->bands, cfg->plmn)) { sim7020_power_off(); s_setup_done = false; return NET_MODEM_FAIL; }
        if (!s_setup_done) s_msg_id = (uint16_t)hal_rtc_now();   /* msg id diverso a ogni avvio */
        s_setup_done = true;
        config_copy_net(&s_applied, cfg);
    }
    if (!sim7020_wait_registered(REGISTER_TIMEOUT)) {
        /* scala di recupero: modem spento, al prossimo tentativo si ricomincia da capo */
        sim7020_power_off();
        s_setup_done = false;
        return NET_NO_NETWORK;
    }
    sim7020_signal(&s_rsrp, &s_snr, &s_csq);
    if (!sim7020_udp_open(cfg->server_ip, cfg->server_port, &s_sock)) return NET_MODEM_FAIL;
    s_open = true;
    return NET_OK;
}

net_result_t net_exchange(const uint8_t *req, uint16_t len, uint8_t *resp, uint16_t *resp_len, uint16_t resp_max)
{
    if (!s_open) return NET_MODEM_FAIL;
    uint8_t token[4];
    uint32_t r = hal_millis() ^ ((uint32_t)hal_rtc_now() << 7);
    token[0] = (uint8_t)r; token[1] = (uint8_t)(r >> 8); token[2] = (uint8_t)(r >> 16); token[3] = (uint8_t)(s_msg_id);
    uint16_t mid = ++s_msg_id;
    uint16_t n = coap_build_post(mid, token, req, len, coap_tx, sizeof coap_tx);
    if (n == 0u) return NET_MODEM_FAIL;

    uint32_t wait = COAP_ACK_TIMEOUT_MS;
    bool acked = false;                            /* ricevuto ACK vuoto: la risposta arriva a parte */
    for (uint8_t attempt = 0; attempt <= COAP_MAX_RETRANSMIT; attempt++) {
        hal_watchdog_kick();
        if (!acked && !sim7020_udp_send(s_sock, coap_tx, n)) return NET_MODEM_FAIL;
        uint32_t deadline = hal_millis() + wait;
        while ((int32_t)(hal_millis() - deadline) < 0) {
            uint16_t got = sim7020_udp_recv(s_sock, coap_rx, sizeof coap_rx, (uint16_t)(deadline - hal_millis()));
            if (got == 0u) break;
            const uint8_t *pl; uint16_t pn, rx_mid;
            coap_rx_t k = coap_parse(coap_rx, got, mid, token, &pl, &pn, &rx_mid);
            if (k == COAP_RX_EMPTY_ACK) { acked = true; continue; }
            if (k == COAP_RX_SEPARATE) {
                uint8_t ack[4];
                sim7020_udp_send(s_sock, ack, coap_build_ack(rx_mid, ack));
            }
            if (k == COAP_RX_RESPONSE || k == COAP_RX_SEPARATE) {
                if (pn > resp_max) return NET_NO_RESPONSE;
                memcpy(resp, pl, pn);
                *resp_len = pn;
                return NET_OK;
            }
            if (k == COAP_RX_ERROR || k == COAP_RX_RESET) return NET_NO_RESPONSE;
            /* COAP_RX_OTHER / INVALID: si continua ad aspettare */
        }
        wait *= 2u;
    }
    return NET_NO_RESPONSE;
}

void net_close(void)
{
    if (s_open) sim7020_udp_close(s_sock);
    s_open = false;
    /* Con il PSM il modem si addormenta da solo dopo il tempo attivo (T3324).
     * TODO(fase 1): verificare con la misura di corrente che entri davvero in PSM;
     * in caso contrario spegnerlo: sim7020_power_off(); s_setup_done = false; */
}

void net_radio_info(int8_t *rsrp, int8_t *snr, uint8_t *csq) { *rsrp = s_rsrp; *snr = s_snr; *csq = s_csq; }
