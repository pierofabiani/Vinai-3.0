/* net_host.c — rete NB-IoT simulata: inoltra i pacchetti al server simulato. */
#include "../../src/app/net.h"
#include "sim.h"
#include <string.h>

static sim_server_fn server;
static bool net_up = true, drop = false;
static uint32_t sent;
static char accepted_apn[32] = "iot.1nce.net";     /* "" = qualunque APN */

void sim_set_accepted_apn(const char *apn) { strncpy(accepted_apn, apn, sizeof accepted_apn - 1u); accepted_apn[sizeof accepted_apn - 1u] = 0; }

void sim_set_server(sim_server_fn fn) { server = fn; }
void sim_net_reset(void) { strcpy(accepted_apn, "iot.1nce.net"); net_up = true; drop = false; }
void sim_set_network_up(bool up) { net_up = up; }
void sim_set_drop_responses(bool d) { drop = d; }
uint32_t sim_packets_sent(void) { return sent; }

net_result_t net_open(const config_t *cfg)
{
    sim_advance(5);                         /* risveglio dal PSM e aggancio */
    if (!net_up) return NET_NO_NETWORK;
    if (accepted_apn[0] && strcmp(cfg->apn, accepted_apn) != 0) return NET_NO_NETWORK;  /* APN sbagliato: niente rete */
    return NET_OK;
}

net_result_t net_exchange(const uint8_t *req, uint16_t len, uint8_t *resp, uint16_t *resp_len, uint16_t resp_max)
{
    sent++;
    sim_advance(2);
    if (!net_up || !server) return NET_NO_RESPONSE;
    uint8_t tmp[512]; uint16_t tl = 0;
    if (!server(req, len, tmp, &tl)) return NET_NO_RESPONSE;
    if (drop) return NET_NO_RESPONSE;       /* il server ha salvato, la risposta si perde */
    if (tl > resp_max) return NET_NO_RESPONSE;
    memcpy(resp, tmp, tl);
    *resp_len = tl;
    return NET_OK;
}

void net_close(void) {}

void net_radio_info(int8_t *rsrp, int8_t *snr, uint8_t *csq) { *rsrp = -105; *snr = 4; *csq = 17; }
