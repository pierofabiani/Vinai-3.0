/* test_core.c — test dei moduli portabili: CRC, SHA/HMAC, record, registro, config, pacchetti, bagnatura. */
#include "test.h"
#include "hal_host/sim.h"
#include "../src/core/crc.h"
#include "../src/core/sha256.h"
#include "../src/core/record.h"
#include "../src/core/logstore.h"
#include "../src/core/config.h"
#include "../src/core/packet.h"
#include "../src/core/wetness.h"
#include "../src/core/coap.h"
#include <string.h>

static void test_crc(void)
{
    const uint8_t s[] = "123456789";
    CHECK_EQ(crc16_ccitt(s, 9), 0x29B1);           /* valore di riferimento CCITT-FALSE */
    const uint8_t sh[] = { 0xBE, 0xEF };
    CHECK_EQ(crc8_sensirion(sh, 2), 0x92);          /* esempio del datasheet Sensirion */
}

static void hex(const uint8_t *b, int n, char *out) { for (int i = 0; i < n; i++) sprintf(out + 2*i, "%02x", b[i]); }

static void test_sha_hmac(void)
{
    uint8_t out[32]; char h[65];
    sha256_ctx_t c;
    sha256_init(&c); sha256_update(&c, (const uint8_t *)"abc", 3); sha256_final(&c, out);
    hex(out, 32, h);
    CHECK(strcmp(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") == 0);

    /* messaggio lungo 2 blocchi */
    const char *m = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    sha256_init(&c); sha256_update(&c, (const uint8_t *)m, strlen(m)); sha256_final(&c, out);
    hex(out, 32, h);
    CHECK(strcmp(h, "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1") == 0);

    /* RFC 4231, test case 2 */
    hmac_sha256((const uint8_t *)"Jefe", 4, (const uint8_t *)"what do ya want for nothing?", 28, out);
    hex(out, 32, h);
    CHECK(strcmp(h, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843") == 0);
}

static record_t mk(uint32_t t, int16_t temp)
{
    record_t r; memset(&r, 0, sizeof r);
    r.time = t; r.temp_dC = temp; r.hum_dPct = 655; r.press_dhPa = 10132; r.wet_raw = 1800; r.wet_min = 7; r.flags = 0;
    return r;
}

static void test_record(void)
{
    uint8_t b[REC_SIZE]; record_t r = mk(1000, -53), q;
    r.seq = 42;
    record_pack(&r, b);
    CHECK(record_unpack(b, &q));
    CHECK_EQ(q.seq, 42); CHECK_EQ(q.temp_dC, -53); CHECK_EQ(q.wet_min, 7);
    b[5] ^= 1;                               /* un bit rovinato */
    CHECK(!record_unpack(b, &q));
    memset(b, 0xFF, sizeof b);
    CHECK(record_slot_erased(b));
    CHECK(!record_unpack(b, &q));
}

static void test_logstore_basic(void)
{
    sim_reset_all();
    logstore_init();
    CHECK_EQ(logstore_last_seq(), 0);
    for (uint32_t i = 1; i <= 250; i++) { record_t r = mk(i * 600, (int16_t)i); CHECK(logstore_append(&r)); CHECK_EQ(r.seq, i); }
    record_t q;
    CHECK(logstore_get(1, &q));   CHECK_EQ(q.temp_dC, 1);
    CHECK(logstore_get(250, &q)); CHECK_EQ(q.temp_dC, 250);
    CHECK(!logstore_get(251, &q));

    /* dopo un reset il registro si ricostruisce dalla sola flash */
    logstore_init();
    CHECK_EQ(logstore_last_seq(), 250);
    CHECK_EQ(logstore_first_seq(), 1);
    record_t r = mk(999999, 77); CHECK(logstore_append(&r)); CHECK_EQ(r.seq, 251);
}

static void test_logstore_wrap(void)
{
    sim_reset_all();
    logstore_init();
    uint16_t cap = logstore_capacity();
    uint32_t total = (uint32_t)cap * 3u;            /* tre giri completi */
    for (uint32_t i = 1; i <= total; i++) { record_t r = mk(i, (int16_t)(i & 0x7FFF)); CHECK(logstore_append(&r)); }
    CHECK_EQ(logstore_last_seq(), total);
    /* almeno 'cap' record più recenti devono essere tutti leggibili */
    uint32_t ok = 0; record_t q;
    for (uint32_t s = total - cap + 1u; s <= total; s++) if (logstore_get(s, &q) && q.seq == s) ok++;
    CHECK_EQ(ok, cap);
    CHECK(logstore_first_seq() <= total - cap + 1u);
    CHECK(!logstore_get(1, &q));                    /* i più vecchi sono stati sovrascritti */
    logstore_init();
    CHECK_EQ(logstore_last_seq(), total);
    /* usura: ogni pagina cancellata circa 3 volte, non di più */
    uint32_t maxe = 0; for (uint16_t p = 0; p < SIM_PAGE_COUNT; p++) if (sim_flash_erase_count(p) > maxe) maxe = sim_flash_erase_count(p);
    CHECK(maxe <= 4u);
}

static void test_logstore_power_cut(void)
{
    sim_reset_all();
    logstore_init();
    for (uint32_t i = 1; i <= 100; i++) { record_t r = mk(i, 1); logstore_append(&r); }

    /* corrente via a metà del record 101 (dopo 2 unità su 5) */
    sim_flash_power_cut_after(2);
    record_t r = mk(101, 1);
    logstore_append(&r);                 /* la scrittura fallisce a metà */
    CHECK(sim_flash_power_was_cut());

    /* riavvio */
    sim_power_restore();
    logstore_init();
    CHECK_EQ(logstore_last_seq(), 100);  /* il 100 è salvo, il 101 non esiste */
    record_t q;
    for (uint32_t s = 1; s <= 100; s++) CHECK(logstore_get(s, &q));
    /* il registro continua a funzionare saltando lo slot rovinato */
    for (uint32_t i = 0; i < 300; i++) { record_t x = mk(200 + i, 2); CHECK(logstore_append(&x)); }
    CHECK_EQ(logstore_last_seq(), 400);
    CHECK(logstore_get(101, &q)); CHECK_EQ(q.time, 200);   /* il nuovo 101 */
    CHECK(logstore_get(400, &q)); CHECK_EQ(q.time, 499);
    logstore_init();
    CHECK_EQ(logstore_last_seq(), 400);

    /* taglio durante la prima scrittura di una pagina appena cancellata */
    uint16_t spp = (uint16_t)(SIM_PAGE_SIZE / REC_SIZE);
    while ((logstore_last_seq() % spp) != 0u) { record_t x = mk(1, 3); logstore_append(&x); }
    uint32_t before = logstore_last_seq();
    sim_flash_power_cut_after(0);
    record_t y = mk(2, 3); logstore_append(&y);
    sim_power_restore();
    logstore_init();
    CHECK(logstore_last_seq() >= before);
    record_t z = mk(3, 3); CHECK(logstore_append(&z));
    CHECK(logstore_get(z.seq, &q));
}

static void test_config(void)
{
    config_t c; config_defaults(&c);
    c.server_ip[0] = 10; c.server_port = 5683;
    CHECK(config_valid(&c));

    uint8_t ok_tlv[] = { CFG_TAG_INTERVAL, 1, 15, CFG_TAG_SEND_EVERY, 1, 4, CFG_TAG_FROST, 2, 0xF6, 0xFF };
    CHECK_EQ(config_apply_tlv(&c, ok_tlv, sizeof ok_tlv, 7), CFG_OK);
    CHECK_EQ(c.interval_min, 15); CHECK_EQ(c.send_every, 4); CHECK_EQ(c.alert_frost_dC, -10); CHECK_EQ(c.version, 7);

    /* un valore fuori range: TUTTO rifiutato, niente applicato a metà */
    uint8_t bad[] = { CFG_TAG_SEND_EVERY, 1, 9, CFG_TAG_INTERVAL, 1, 0 };
    CHECK_EQ(config_apply_tlv(&c, bad, sizeof bad, 8), CFG_ERR_RANGE);
    CHECK_EQ(c.send_every, 4); CHECK_EQ(c.version, 7);

    uint8_t trunc[] = { CFG_TAG_WET_SAMPLE, 2, 60 };
    CHECK_EQ(config_apply_tlv(&c, trunc, sizeof trunc, 9), CFG_ERR_FORMAT);
    uint8_t unk[] = { 99, 1, 0 };
    CHECK_EQ(config_apply_tlv(&c, unk, sizeof unk, 9), CFG_ERR_FORMAT);

    /* rete: APN, bande, operatore */
    uint8_t net_ok[] = { CFG_TAG_APN, 2, 'e', 'm', CFG_TAG_BANDS, 2, 20, 8, CFG_TAG_PLMN, 4, 0xC2, 0x56, 0x00, 0x00 };
    CHECK_EQ(config_apply_tlv(&c, net_ok, sizeof net_ok, 10), CFG_OK);
    CHECK(strcmp(c.apn, "em") == 0); CHECK_EQ(c.bands[0], 20); CHECK_EQ(c.bands[1], 8); CHECK_EQ(c.bands[2], 0);
    CHECK_EQ(c.plmn, 22210);
    uint8_t apn_quote[] = { CFG_TAG_APN, 3, 'a', '"', 'b' };          /* romperebbe il comando AT */
    CHECK_EQ(config_apply_tlv(&c, apn_quote, sizeof apn_quote, 11), CFG_ERR_RANGE);
    uint8_t band_bad[] = { CFG_TAG_BANDS, 1, 7 };                      /* banda non NB-IoT */
    CHECK_EQ(config_apply_tlv(&c, band_bad, sizeof band_bad, 11), CFG_ERR_RANGE);
    uint8_t plmn_bad[] = { CFG_TAG_PLMN, 4, 0x39, 0x05, 0, 0 };        /* 1337: non è un MCC+MNC */
    CHECK_EQ(config_apply_tlv(&c, plmn_bad, sizeof plmn_bad, 11), CFG_ERR_RANGE);
    CHECK(strcmp(c.apn, "em") == 0); CHECK_EQ(c.version, 10);         /* niente applicato a metà */
    config_t dflt; config_defaults(&dflt);
    CHECK(strcmp(dflt.apn, "iot.1nce.net") == 0);
    CHECK(!config_net_equal(&c, &dflt));
    config_copy_net(&c, &dflt);
    CHECK(config_net_equal(&c, &dflt));

    uint8_t blob[CONFIG_BLOB_SIZE]; config_t d;
    config_pack(&c, blob);
    CHECK(config_unpack(blob, &d));
    uint8_t blob2[CONFIG_BLOB_SIZE]; config_pack(&d, blob2);
    CHECK(memcmp(blob, blob2, sizeof blob) == 0);     /* andata e ritorno identici */
    CHECK_EQ(d.interval_min, 15); CHECK_EQ(d.alert_frost_dC, -10); CHECK_EQ(d.server_ip[0], 10);
    blob[3] ^= 0x10;
    CHECK(!config_unpack(blob, &d));
}

static const uint8_t KEY[16] = { 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16 };

static void test_packet(void)
{
    uplink_t u, v; memset(&u, 0, sizeof u);
    u.imei = 868333032047462ull; u.fw_ver = 0x0300; u.cfg_ver = 7;
    u.health.batt_mv = 4210; u.health.rsrp_dbm = -112; u.health.snr_db = 3; u.health.csq = 18;
    u.health.reset_count = 2; u.health.lost_records = 0;
    u.first_seq = 1000; u.n = PKT_MAX_RECORDS;
    for (int i = 0; i < (int)PKT_MAX_RECORDS; i++) { u.rec[i] = mk(50000u + 600u * (uint32_t)i, (int16_t)(-40 + i)); }
    uint8_t buf[PKT_MAX_UPLINK];
    uint16_t len = packet_encode_uplink(&u, KEY, buf);
    CHECK_EQ(len, 460);
    CHECK(len <= 512);
    CHECK_EQ(packet_decode_uplink(buf, len, KEY, &v), PKT_OK);
    CHECK_EQ(v.imei, 868333032047462ull);
    CHECK_EQ(v.health.rsrp_dbm, -112);
    CHECK_EQ(v.rec[29].seq, 1029);
    CHECK_EQ(v.rec[0].temp_dC, -40);

    uint8_t key2[16]; memcpy(key2, KEY, 16); key2[0] ^= 1;
    CHECK_EQ(packet_decode_uplink(buf, len, key2, &v), PKT_ERR_HMAC);   /* chiave sbagliata */
    buf[40] ^= 1;
    CHECK_EQ(packet_decode_uplink(buf, len, KEY, &v), PKT_ERR_HMAC);    /* dato alterato */
    buf[40] ^= 1;

    /* risposta del server */
    uint8_t tag[4]; packet_uplink_tag(buf, len, tag);
    downlink_t d, e; memset(&d, 0, sizeof d);
    memcpy(d.req_tag, tag, 4); d.acked_seq = 1029; d.server_time = 123456; d.cfg_ver = 8;
    d.cfg[0] = CFG_TAG_INTERVAL; d.cfg[1] = 1; d.cfg[2] = 5; d.cfg_len = 3;
    uint8_t dl[PKT_MAX_DOWNLINK];
    uint16_t dlen = packet_encode_downlink(&d, KEY, dl);
    CHECK_EQ(packet_decode_downlink(dl, dlen, KEY, tag, &e), PKT_OK);
    CHECK_EQ(e.acked_seq, 1029); CHECK_EQ(e.cfg_len, 3); CHECK_EQ(e.cfg[2], 5);
    uint8_t other[4] = { 0, 0, 0, 0 };
    CHECK_EQ(packet_decode_downlink(dl, dlen, KEY, other, &e), PKT_ERR_TAG);  /* risposta vecchia o di un altro invio */
}

static void test_wetness(void)
{
    wetness_acc_t a; wetness_init(&a);
    uint16_t avg; uint8_t mins; bool fault;
    /* polarità 0: bagnato quando la lettura scende sotto 1500 (isteresi 40) */
    for (int i = 0; i < 4; i++) wetness_add(&a, true, 2000, 1500, 40, 0);   /* asciutto */
    for (int i = 0; i < 6; i++) wetness_add(&a, true, 1300, 1500, 40, 0);   /* bagnato */
    wetness_close(&a, 600, &avg, &mins, &fault);
    CHECK_EQ(mins, 6); CHECK(!fault); CHECK_EQ(avg, (4*2000 + 6*1300) / 10);

    /* attorno alla soglia non oscilla: resta bagnato finché non supera soglia+isteresi */
    wetness_add(&a, true, 1520, 1500, 40, 0);
    wetness_add(&a, true, 1480, 1500, 40, 0);
    wetness_add(&a, true, 1530, 1500, 40, 0);
    wetness_close(&a, 180, &avg, &mins, &fault);
    CHECK_EQ(mins, 3);
    wetness_add(&a, true, 1600, 1500, 40, 0);   /* oltre 1540: asciutto */
    wetness_close(&a, 60, &avg, &mins, &fault);
    CHECK_EQ(mins, 0);
    /* campioni irregolari: 11 campioni in 10 minuti, metà bagnati -> 5 minuti */
    for (int i = 0; i < 11; i++) wetness_add(&a, true, (i % 2) ? 2000 : 1000, 1500, 40, 0);
    wetness_close(&a, 600, &avg, &mins, &fault);
    CHECK_EQ(mins, 5);

    /* sensore guasto */
    for (int i = 0; i < 5; i++) wetness_add(&a, false, 0, 1500, 40, 0);
    wetness_close(&a, 60, &avg, &mins, &fault);
    CHECK(fault); CHECK_EQ(avg, 0xFFFF);
}

static void test_coap(void)
{
    const uint8_t tok[4] = { 0xDE, 0xAD, 0xBE, 0xEF };
    const uint8_t pl[5] = { 1, 2, 3, 4, 5 };
    uint8_t m[64];
    uint16_t n = coap_build_post(0x1234, tok, pl, 5, m, sizeof m);
    CHECK_EQ(n, 5 + COAP_OVERHEAD);
    CHECK_EQ(m[0], 0x44); CHECK_EQ(m[1], 0x02); CHECK_EQ(m[2], 0x12); CHECK_EQ(m[3], 0x34);
    CHECK_EQ(m[12], 0xFF);

    /* risposta allegata 2.04 con payload */
    uint8_t r[] = { 0x64, 0x44, 0x12, 0x34, 0xDE, 0xAD, 0xBE, 0xEF, 0xFF, 9, 8, 7 };
    const uint8_t *p; uint16_t pn, mid;
    CHECK_EQ(coap_parse(r, sizeof r, 0x1234, tok, &p, &pn, &mid), COAP_RX_RESPONSE);
    CHECK_EQ(pn, 3); CHECK_EQ(p[0], 9);
    /* stesso messaggio con msg id diverso: non è la nostra risposta */
    CHECK_EQ(coap_parse(r, sizeof r, 0x9999, tok, &p, &pn, &mid), COAP_RX_OTHER);
    /* token diverso */
    const uint8_t tok2[4] = { 0, 0, 0, 0 };
    CHECK_EQ(coap_parse(r, sizeof r, 0x1234, tok2, &p, &pn, &mid), COAP_RX_OTHER);
    /* ACK vuoto, poi risposta separata CON da confermare */
    uint8_t e[] = { 0x60, 0x00, 0x12, 0x34 };
    CHECK_EQ(coap_parse(e, sizeof e, 0x1234, tok, &p, &pn, &mid), COAP_RX_EMPTY_ACK);
    uint8_t sep[] = { 0x44, 0x44, 0x77, 0x01, 0xDE, 0xAD, 0xBE, 0xEF, 0xFF, 5 };
    CHECK_EQ(coap_parse(sep, sizeof sep, 0x1234, tok, &p, &pn, &mid), COAP_RX_SEPARATE);
    CHECK_EQ(mid, 0x7701);
    uint8_t ack[4]; CHECK_EQ(coap_build_ack(mid, ack), 4); CHECK_EQ(ack[0], 0x60); CHECK_EQ(ack[3], 0x01);
    /* errore del server 5.00 */
    uint8_t err[] = { 0x64, 0xA0, 0x12, 0x34, 0xDE, 0xAD, 0xBE, 0xEF };
    CHECK_EQ(coap_parse(err, sizeof err, 0x1234, tok, &p, &pn, &mid), COAP_RX_ERROR);
    /* messaggi rovinati */
    uint8_t bad1[] = { 0x64, 0x44, 0x12 };
    CHECK_EQ(coap_parse(bad1, sizeof bad1, 0x1234, tok, &p, &pn, &mid), COAP_RX_INVALID);
    uint8_t bad2[] = { 0x64, 0x44, 0x12, 0x34, 0xDE, 0xAD, 0xBE, 0xEF, 0xFF };
    CHECK_EQ(coap_parse(bad2, sizeof bad2, 0x1234, tok, &p, &pn, &mid), COAP_RX_INVALID);
    /* un pacchetto dati completo entra in 512 byte */
    CHECK(PKT_MAX_UPLINK + COAP_OVERHEAD <= 512u);
    /* file per la verifica con una libreria CoAP indipendente */
    FILE *f = fopen("build/coap_sample.bin", "wb"); if (f) { fwrite(m, 1, n, f); fclose(f); }
}

void run_core_tests(void)
{
    RUN(test_coap);
    RUN(test_crc);
    RUN(test_sha_hmac);
    RUN(test_record);
    RUN(test_logstore_basic);
    RUN(test_logstore_wrap);
    RUN(test_logstore_power_cut);
    RUN(test_config);
    RUN(test_packet);
    RUN(test_wetness);
}
