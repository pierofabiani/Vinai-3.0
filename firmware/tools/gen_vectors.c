/*
 * gen_vectors.c — Vettori d'oro del protocollo, generati dal codice del firmware.
 *
 * Scrive su stdout un JSON con pacchetti uplink e downlink firmati, datagrammi
 * CoAP e casi di configurazione TLV. Il server TypeScript (packages/protocol)
 * deve leggere e riprodurre questi byte esattamente: se packet.h cambia e il
 * server no, i test del server falliscono.
 *
 * Uso: make -C firmware vectors   (rigenera packages/protocol/vectors/firmware.json)
 * Tutto è deterministico: nessun dato casuale, nessuna data corrente.
 */
#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include "../src/core/packet.h"
#include "../src/core/coap.h"
#include "../src/core/config.h"

static int first_item;

static void hex(const char *key, const uint8_t *b, uint16_t n)
{
    printf("\"%s\":\"", key);
    for (uint16_t i = 0; i < n; i++) printf("%02x", b[i]);
    printf("\"");
}

static void sep(void) { if (!first_item) printf(",\n"); first_item = 0; }

static void make_key(uint8_t key[DEVICE_KEY_LEN], uint8_t seed)
{
    for (uint8_t i = 0; i < DEVICE_KEY_LEN; i++) key[i] = (uint8_t)(seed + i * 17u);
}

static void print_record(const record_t *r)
{
    printf("{\"seq\":%" PRIu32 ",\"time\":%" PRIu32 ",\"temp_dC\":%d,\"hum_dPct\":%u,\"press_dhPa\":%u,"
           "\"wet_raw\":%u,\"wet_min\":%u,\"flags\":%u}",
           r->seq, r->time, r->temp_dC, r->hum_dPct, r->press_dhPa, r->wet_raw, r->wet_min, r->flags);
}

static void print_health(const health_t *h)
{
    printf("{\"batt_mv\":%u,\"rsrp_dbm\":%d,\"snr_db\":%d,\"csq\":%u,\"last_reset\":%u,\"reset_count\":%u,"
           "\"modem_fails\":%u,\"lost_records\":%u,\"cfg_rejected\":%u}",
           h->batt_mv, h->rsrp_dbm, h->snr_db, h->csq, h->last_reset, h->reset_count,
           h->modem_fails, h->lost_records, h->cfg_rejected);
}

/* Record sintetici ma plausibili: 10 minuti di intervallo, giornata di primavera. */
static void fill_records(uplink_t *u, uint8_t n, uint32_t t0)
{
    u->n = n;
    for (uint8_t i = 0; i < n; i++) {
        record_t *r = &u->rec[i];
        r->seq = u->first_seq + i;
        r->time = t0 + (uint32_t)i * 600u;
        r->temp_dC = (int16_t)(85 + (int)i * 7 - (int)(i * i) / 3);
        r->hum_dPct = (uint16_t)(920 - i * 11u);
        r->press_dhPa = (uint16_t)(10132 - i);
        r->wet_raw = (uint16_t)(1300 + i * 23u);
        r->wet_min = (uint8_t)((i < 5u) ? 10u : (i < 8u ? 4u : 0u));
        r->flags = 0;
    }
}

static void emit_uplink(const char *name, const uplink_t *u, uint8_t key_seed, uint16_t msg_id)
{
    uint8_t key[DEVICE_KEY_LEN], out[PKT_MAX_UPLINK], tag[4], dgram[PKT_MAX_UPLINK_COAP];
    make_key(key, key_seed);
    uint16_t len = packet_encode_uplink(u, key, out);
    packet_uplink_tag(out, len, tag);
    const uint8_t token[4] = { 0xA1, 0xB2, (uint8_t)(msg_id >> 8), (uint8_t)msg_id };
    uint16_t dlen = coap_build_post(msg_id, token, out, len, dgram, sizeof dgram);

    sep();
    printf("{\"name\":\"%s\",", name);
    hex("key", key, DEVICE_KEY_LEN);
    printf(",\"imei\":\"%" PRIu64 "\",\"fw_ver\":%u,\"cfg_ver\":%u,\"health\":", u->imei, u->fw_ver, u->cfg_ver);
    print_health(&u->health);
    printf(",\"first_seq\":%" PRIu32 ",\"records\":[", u->first_seq);
    for (uint8_t i = 0; i < u->n; i++) { if (i) printf(","); print_record(&u->rec[i]); }
    printf("],");
    hex("payload", out, len);
    printf(",");
    hex("tag", tag, 4);
    printf(",\"coap\":{\"msg_id\":%u,", msg_id);
    hex("token", token, 4);
    printf(",");
    hex("datagram", dgram, dlen);
    printf("}}");
}

static void emit_downlink(const char *name, const downlink_t *d, uint8_t key_seed)
{
    uint8_t key[DEVICE_KEY_LEN], out[PKT_MAX_DOWNLINK];
    make_key(key, key_seed);
    uint16_t len = packet_encode_downlink(d, key, out);
    sep();
    printf("{\"name\":\"%s\",", name);
    hex("key", key, DEVICE_KEY_LEN);
    printf(",");
    hex("req_tag", d->req_tag, 4);
    printf(",\"acked_seq\":%" PRIu32 ",\"server_time\":%" PRIu32 ",\"flags\":%u,\"cfg_ver\":%u,",
           d->acked_seq, d->server_time, d->flags, d->cfg_ver);
    hex("cfg", d->cfg, d->cfg_len);
    printf(",");
    hex("payload", out, len);
    printf("}");
}

static void print_config(const config_t *c)
{
    printf("{\"version\":%u,\"interval_min\":%u,\"send_every\":%u,\"wet_sample_s\":%u,\"wet_threshold\":%u,"
           "\"wet_hyst\":%u,\"wet_polarity\":%u,\"server_ip\":\"%u.%u.%u.%u\",\"server_port\":%u,"
           "\"quiet_start_h\":%u,\"quiet_end_h\":%u,\"alert_frost_dC\":%d,\"low_batt_mv\":%u,"
           "\"apn\":\"%s\",\"bands\":[",
           c->version, c->interval_min, c->send_every, c->wet_sample_s, c->wet_threshold, c->wet_hyst,
           c->wet_polarity, c->server_ip[0], c->server_ip[1], c->server_ip[2], c->server_ip[3], c->server_port,
           c->quiet_start_h, c->quiet_end_h, c->alert_frost_dC, c->low_batt_mv, c->apn);
    int k = 0;
    for (uint8_t i = 0; i < CFG_BANDS_MAX; i++) if (c->bands[i]) { if (k++) printf(","); printf("%u", c->bands[i]); }
    printf("],\"plmn\":%" PRIu32 "}", c->plmn);
}

static void emit_config(const char *name, const uint8_t *tlv, uint8_t len, uint16_t version)
{
    config_t c;
    config_defaults(&c);
    c.server_ip[0] = 10; c.server_ip[1] = 0; c.server_ip[2] = 0; c.server_ip[3] = 1;  /* come dopo il laboratorio */
    cfg_result_t r = config_apply_tlv(&c, tlv, len, version);
    sep();
    printf("{\"name\":\"%s\",", name);
    hex("tlv", tlv, len);
    printf(",\"version\":%u,\"result\":\"%s\"", version, r == CFG_OK ? "ok" : (r == CFG_ERR_FORMAT ? "format" : "range"));
    if (r == CFG_OK) { printf(",\"config\":"); print_config(&c); }
    printf("}");
}

int main(void)
{
    printf("{\"generator\":\"firmware/tools/gen_vectors.c\",\"pkt_proto_ver\":%u,\n", PKT_PROTO_VER);

    /* configurazione di fabbrica (con l'IP che il laboratorio scrive nella EEPROM) */
    config_t def;
    config_defaults(&def);
    def.server_ip[0] = 10; def.server_ip[1] = 0; def.server_ip[2] = 0; def.server_ip[3] = 1;
    printf("\"config_defaults\":");
    print_config(&def);
    printf(",\n\"uplinks\":[\n");

    first_item = 1;
    uplink_t u;
    memset(&u, 0, sizeof u);
    u.imei = 869951031234567ull; u.fw_ver = 0x0300; u.cfg_ver = 0;
    u.health = (health_t){ 4410, -97, 6, 18, 1, 3, 0, 0, 0 };
    u.first_seq = 1; fill_records(&u, 6, 216000000u);
    emit_uplink("sei record, primo invio", &u, 0x11, 0x0101);

    u.first_seq = 4242; fill_records(&u, PKT_MAX_RECORDS, 216100000u);
    u.health = (health_t){ 3980, -113, -3, 7, 4, 12, 2, 5, 7 };
    u.cfg_ver = 6;
    emit_uplink("trenta record, arretrato, configurazione 7 rifiutata", &u, 0x11, 0x0102);

    u.first_seq = 77; u.n = 0;
    u.health = (health_t){ 3150, -125, -10, 99, 2, 65535, 255, 65535, 0 };
    emit_uplink("solo salute, valori estremi", &u, 0x22, 0xFFFE);

    memset(&u, 0, sizeof u);
    u.imei = 351234567890123ull; u.fw_ver = 0x0301; u.cfg_ver = 3;
    u.health = (health_t){ 4500, -80, 12, 25, 0, 0, 0, 0, 0 };
    u.first_seq = 0xFFFFFFF0u; fill_records(&u, 2, 300000000u);
    u.rec[0].temp_dC = REC_TEMP_FAULT; u.rec[0].flags = RECF_TEMP_FAULT;
    u.rec[1].temp_dC = -153; u.rec[1].hum_dPct = REC_U16_FAULT; u.rec[1].flags = RECF_HUM_FAULT | RECF_LOW_BATT;
    u.rec[1].press_dhPa = REC_U16_FAULT; u.rec[1].flags |= RECF_PRESS_FAULT | RECF_TIME_UNSYNC;
    emit_uplink("sensori guasti, gelo, sequenza alta", &u, 0x33, 0x0000);

    printf("\n],\n\"downlinks\":[\n");
    first_item = 1;
    downlink_t d;
    memset(&d, 0, sizeof d);
    const uint8_t tag1[4] = { 0xDE, 0xAD, 0xBE, 0xEF };
    memcpy(d.req_tag, tag1, 4);
    d.acked_seq = 6; d.server_time = 216003700u; d.flags = 0; d.cfg_ver = 0; d.cfg_len = 0;
    emit_downlink("conferma senza configurazione", &d, 0x11);

    const uint8_t tlv1[] = { CFG_TAG_INTERVAL, 1, 15, CFG_TAG_SEND_EVERY, 1, 4, CFG_TAG_WET_THRESH, 2, 0xDC, 0x05,
                             CFG_TAG_FROST, 2, 0xF6, 0xFF, CFG_TAG_APN, 9, 'i','o','t','.','t','e','s','t','1',
                             CFG_TAG_BANDS, 2, 20, 8, CFG_TAG_PLMN, 4, 0x52, 0x56, 0x00, 0x00 };
    d.acked_seq = 4271; d.server_time = 216200000u; d.flags = DL_FLAG_FW_AVAILABLE; d.cfg_ver = 8;
    memcpy(d.cfg, tlv1, sizeof tlv1); d.cfg_len = (uint8_t)sizeof tlv1;
    emit_downlink("conferma con configurazione e firmware disponibile", &d, 0x11);

    d.acked_seq = 0xFFFFFFF1u; d.server_time = 0xFFFFFFFFu; d.flags = 0; d.cfg_ver = 65535; d.cfg_len = 0;
    emit_downlink("valori massimi", &d, 0x33);

    printf("\n],\n\"configs\":[\n");
    first_item = 1;
    emit_config("modifica tutti i parametri", tlv1, (uint8_t)sizeof tlv1, 8);
    const uint8_t tlv2[] = { CFG_TAG_SERVER, 6, 46, 101, 7, 9, 0x33, 0x16, CFG_TAG_QUIET, 2, 22, 5,
                             CFG_TAG_WET_SAMPLE, 2, 0x1E, 0x00, CFG_TAG_WET_HYST, 2, 0x32, 0x00, CFG_TAG_WET_POL, 1, 1,
                             CFG_TAG_LOW_BATT, 2, 0xE4, 0x0C };
    emit_config("server, silenzio notturno, bagnatura, batteria", tlv2, (uint8_t)sizeof tlv2, 9);
    const uint8_t tlv_empty[1] = { 0 };
    emit_config("vuota", tlv_empty, 0, 10);
    const uint8_t bad_interval[] = { CFG_TAG_INTERVAL, 1, 0 };
    emit_config("intervallo zero rifiutato", bad_interval, 3, 11);
    const uint8_t bad_band[] = { CFG_TAG_INTERVAL, 1, 5, CFG_TAG_BANDS, 1, 7 };
    emit_config("banda non supportata rifiuta tutto", bad_band, 6, 12);
    const uint8_t bad_apn[] = { CFG_TAG_APN, 4, 'a', ',', 'b', 'c' };
    emit_config("APN con virgola", bad_apn, 6, 13);
    const uint8_t bad_quiet[] = { CFG_TAG_QUIET, 2, 22, CFG_NO_HOUR };
    emit_config("silenzio con una sola ora", bad_quiet, 4, 14);
    const uint8_t bad_tag[] = { 99, 1, 0 };
    emit_config("tag sconosciuto", bad_tag, 3, 15);
    const uint8_t truncated[] = { CFG_TAG_WET_THRESH, 2, 0x10 };
    emit_config("TLV troncato", truncated, 3, 16);
    const uint8_t bad_plmn[] = { CFG_TAG_PLMN, 4, 0x39, 0x30, 0x00, 0x00 };   /* 12345 ok */
    emit_config("operatore forzato a 5 cifre", bad_plmn, 6, 17);
    const uint8_t short_plmn[] = { CFG_TAG_PLMN, 4, 0xE7, 0x03, 0x00, 0x00 };  /* 999: troppo corto */
    emit_config("operatore troppo corto", short_plmn, 6, 18);

    printf("\n]}\n");
    return 0;
}
