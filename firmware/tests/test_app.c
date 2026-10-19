/* test_app.c — driver e logica della centralina, provati su giorni simulati con un server finto. */
#include "test.h"
#include "hal_host/sim.h"
#include "../src/app/station.h"
#include "../src/app/persist.h"
#include "../src/core/packet.h"
#include "../src/core/logstore.h"
#include "../src/drivers/sht35.h"
#include "../src/drivers/lps22hb.h"
#include "../src/drivers/eeprom24c08.h"
#include "../src/hal/hal.h"
#include "../src/drivers/sim7020.h"
#include <string.h>

#define DAY      86400u
#define T0       (2483u * DAY)        /* 19/10/2026 00:00 UTC, in secondi dal 2020 */
#define DB_MAX   12000u

static const uint8_t KEY[16] = { 0xA1,0xB2,0xC3,0xD4,0xE5,0xF6,0x07,0x18,0x29,0x3A,0x4B,0x5C,0x6D,0x7E,0x8F,0x90 };
static const uint64_t IMEI = 868333032047462ull;

/* ------------------------------------------------------------ server finto */
static bool     have[DB_MAX];
static record_t db[DB_MAX];
static uint32_t dup, stored, pkts, bad;
static health_t last_health;
static uint16_t reported_cfg;
static uint8_t  pend_cfg[16], pend_cfg_len;
static uint16_t pend_cfg_ver;
static uint32_t last_rx_time;
static uint16_t reported_rejected;

static bool server(const uint8_t *req, uint16_t len, uint8_t *resp, uint16_t *rl)
{
    uplink_t u;
    if (packet_decode_uplink(req, len, KEY, &u) != PKT_OK || u.imei != IMEI) { bad++; return false; }
    pkts++;
    last_rx_time = sim_true_time();
    last_health = u.health;
    reported_cfg = u.cfg_ver;
    reported_rejected = u.health.cfg_rejected;
    for (uint8_t i = 0; i < u.n; i++) {
        uint32_t s = u.rec[i].seq;
        if (s >= DB_MAX) continue;
        if (have[s]) dup++; else { have[s] = true; db[s] = u.rec[i]; stored++; }
    }
    downlink_t d; memset(&d, 0, sizeof d);
    packet_uplink_tag(req, len, d.req_tag);
    d.acked_seq = u.first_seq + u.n - 1u;          /* tutto salvato */
    d.server_time = sim_true_time();
    /* come farà il server vero: non reinvia una versione che la centralina ha rifiutato */
    if (pend_cfg_len && pend_cfg_ver != u.cfg_ver && pend_cfg_ver != u.health.cfg_rejected) {
        d.cfg_ver = pend_cfg_ver; d.cfg_len = pend_cfg_len; memcpy(d.cfg, pend_cfg, pend_cfg_len);
    } else d.cfg_ver = u.cfg_ver;
    *rl = packet_encode_downlink(&d, KEY, resp);
    return true;
}

static void server_reset(void)
{
    memset(have, 0, sizeof have); memset(db, 0, sizeof db);
    dup = stored = pkts = bad = 0; pend_cfg_len = 0; pend_cfg_ver = 0; reported_cfg = 0; last_rx_time = 0; reported_rejected = 0;
    memset(&last_health, 0, sizeof last_health);
}

/* ------------------------------------------------------------ utilità */
static void provision(void)
{
    sim_reset_all();
    server_reset();
    sim_set_server(server);
    sim_net_reset();
    identity_t id; id.imei = IMEI; memcpy(id.key, KEY, 16);
    persist_save_identity(&id);
    config_t c; config_defaults(&c);
    c.server_ip[0] = 10; c.server_ip[1] = 0; c.server_ip[2] = 0; c.server_ip[3] = 1;
    persist_save_config(&c);
    sim_set_time(T0);
}

static void run_for(uint32_t seconds)
{
    uint32_t end = sim_true_time() + seconds;
    while (sim_true_time() < end) {
        uint32_t w = station_step();               /* attesa in secondi dell'orologio della centralina */
        uint32_t left = end - sim_true_time();
        if (w < left) sim_advance_rtc(w); else sim_advance(left);
    }
}

static uint32_t db_count(uint32_t from, uint32_t to)
{
    uint32_t n = 0;
    for (uint32_t s = from; s <= to && s < DB_MAX; s++) if (have[s]) n++;
    return n;
}

/* ------------------------------------------------------------ test driver */
static void test_sht35_conversion(void)
{
    CHECK_EQ(sht35_temp_dC(0), -450);
    CHECK_EQ(sht35_temp_dC(65535), 1300);
    CHECK_EQ(sht35_hum_dPct(65535), 1000);
    /* il caso del bug storico: umidità sopra il 64% deve restare corretta */
    CHECK_EQ(sht35_hum_dPct(45000), 687);
    CHECK_EQ(sht35_hum_dPct(60000), 916);
    int16_t t; uint16_t h;
    sim_reset_all();
    sim_set_env(-87, 934, 9870);
    CHECK(sht35_measure(&t, &h));
    CHECK(t >= -88 && t <= -86); CHECK(h >= 933 && h <= 935);
    sim_set_sht35_present(false);
    CHECK(!sht35_measure(&t, &h));
}

static void test_lps22hb(void)
{
    uint16_t p;
    sim_reset_all();
    CHECK(lps22hb_init());
    sim_set_env(200, 500, 9876);
    CHECK(lps22hb_measure(&p)); CHECK_EQ(p, 9876);
    sim_set_lps22_present(false);
    CHECK(!lps22hb_measure(&p));
}

static void test_eeprom(void)
{
    sim_reset_all();
    uint8_t w[100], r[100];
    for (int i = 0; i < 100; i++) w[i] = (uint8_t)(i * 7 + 3);
    CHECK(eeprom_write(250, w, 100));           /* attraversa pagine e il confine di blocco 256 */
    CHECK(eeprom_read(250, r, 100));
    CHECK(memcmp(w, r, 100) == 0);
    CHECK(!eeprom_write(1000, w, 100));         /* oltre la fine */
}

static void test_persist(void)
{
    sim_reset_all();
    pstate_t s = { 0, 0, 0, 0 }, q;
    CHECK(!persist_load_state(&q));
    s.acked_seq = 10; persist_save_state(&s);
    s.acked_seq = 20; persist_save_state(&s);
    CHECK(persist_load_state(&q)); CHECK_EQ(q.acked_seq, 20);
    /* lo slot più recente si rovina (taglio di corrente durante la scrittura): resta il precedente */
    sim_eeprom_corrupt((s.generation & 1u) ? 0x110 : 0x100);
    CHECK(persist_load_state(&q)); CHECK_EQ(q.acked_seq, 10);
}

/* ------------------------------------------------------------ scenari */
static void scenario_normal_day(void)
{
    provision();
    station_init();
    run_for(DAY);
    station_status_t st; station_get_status(&st);
    CHECK(st.last_seq >= 143 && st.last_seq <= 145);     /* una misura ogni 10 minuti */
    CHECK_EQ(db_count(1, st.last_seq), st.last_seq - (st.acked_seq < st.last_seq ? st.last_seq - st.acked_seq : 0));
    CHECK(st.last_seq - st.acked_seq <= 6u);             /* al massimo l'ultima ora in attesa */
    CHECK_EQ(dup, 0);
    CHECK(pkts >= 24 && pkts <= 27);                     /* un invio all'ora + quello di avvio */
    CHECK_EQ(st.lost_records, 0);
    CHECK_EQ(db[10].hum_dPct, 650);
    CHECK_EQ(db[10].press_dhPa, 10132);
    CHECK_EQ(db[10].flags, 0);
}

static void scenario_outage_3_days(void)
{
    provision();
    station_init();
    run_for(DAY / 2);
    sim_set_network_up(false);
    run_for(3u * DAY);
    station_status_t st; station_get_status(&st);
    uint32_t failed = st.sends_failed;
    CHECK(failed <= 20u);                                /* attese crescenti, non un tentativo ogni 10 min */
    sim_set_network_up(true);
    run_for(DAY);
    station_get_status(&st);
    CHECK_EQ(db_count(1, st.acked_seq), st.acked_seq);  /* niente perso */
    CHECK(st.last_seq - st.acked_seq <= 6u);
    CHECK_EQ(st.lost_records, 0);
    CHECK_EQ(dup, 0);
}

static void scenario_lost_responses(void)
{
    provision();
    station_init();
    run_for(DAY / 4);
    sim_set_drop_responses(true);                        /* il server salva, le conferme si perdono */
    run_for(DAY / 4);
    sim_set_drop_responses(false);
    run_for(DAY / 2);
    station_status_t st; station_get_status(&st);
    CHECK_EQ(db_count(1, st.acked_seq), st.acked_seq);
    CHECK(dup > 0u);                                     /* reinvii avvenuti ... */
    CHECK_EQ(stored, db_count(1, DB_MAX - 1));           /* ... ma nessuna riga doppia nel database */
}

static void scenario_outage_longer_than_memory(void)
{
    provision();
    station_init();
    run_for(DAY / 2);
    sim_set_network_up(false);
    run_for(20u * DAY);                                  /* più dei ~16 giorni conservabili */
    sim_set_network_up(true);
    run_for(DAY);
    station_status_t st; station_get_status(&st);
    CHECK(st.lost_records > 0u);
    CHECK_EQ(last_health.lost_records, st.lost_records); /* il server sa quante misure mancano */
    uint32_t cap = logstore_capacity();
    CHECK_EQ(db_count(st.last_seq - cap + 200u, st.acked_seq), st.acked_seq - (st.last_seq - cap + 200u) + 1u);
    CHECK(st.last_seq - st.acked_seq <= 6u);
}

static void scenario_reboot_with_backlog(void)
{
    provision();
    station_init();
    run_for(DAY / 2);
    sim_set_network_up(false);
    run_for(DAY / 2);
    station_status_t a; station_get_status(&a);
    station_init();                                      /* reset (watchdog, pile...) con arretrato in flash */
    station_status_t b; station_get_status(&b);
    CHECK_EQ(b.last_seq, a.last_seq);                    /* il registro si ricostruisce */
    CHECK_EQ(b.acked_seq, a.acked_seq);
    sim_set_network_up(true);
    run_for(DAY / 2);
    station_status_t c; station_get_status(&c);
    CHECK_EQ(db_count(1, c.acked_seq), c.acked_seq);
    CHECK(c.last_seq - c.acked_seq <= 6u);
    CHECK_EQ(last_health.reset_count, 2);
    CHECK_EQ(dup, 0);
}

static void scenario_remote_config(void)
{
    provision();
    station_init();
    run_for(DAY / 4);
    /* il server chiede misure ogni 5 minuti e invii ogni 12 misure */
    pend_cfg[0] = CFG_TAG_INTERVAL; pend_cfg[1] = 1; pend_cfg[2] = 5;
    pend_cfg[3] = CFG_TAG_SEND_EVERY; pend_cfg[4] = 1; pend_cfg[5] = 12;
    pend_cfg_len = 6; pend_cfg_ver = 3;
    run_for(2u * 3600u);
    CHECK_EQ(station_config()->interval_min, 5);
    CHECK_EQ(station_config()->version, 3);
    CHECK_EQ(reported_cfg, 3);
    station_status_t a; station_get_status(&a);
    run_for(DAY / 4);
    station_status_t b; station_get_status(&b);
    CHECK(b.last_seq - a.last_seq >= 70u && b.last_seq - a.last_seq <= 74u);   /* 6 ore a 5 minuti = 72 */
    /* la configurazione sopravvive al reset */
    station_init();
    CHECK_EQ(station_config()->interval_min, 5);
    /* configurazione non valida: rifiutata in blocco */
    pend_cfg[0] = CFG_TAG_INTERVAL; pend_cfg[1] = 1; pend_cfg[2] = 0; pend_cfg_len = 3; pend_cfg_ver = 4;
    run_for(2u * 3600u);
    CHECK_EQ(station_config()->interval_min, 5);
    CHECK_EQ(reported_cfg, 3);                           /* il server vede che la 4 non è stata applicata */
}

static void scenario_frost_alert(void)
{
    provision();
    station_init();
    run_for(3u * 3600u + 15u * 60u);                     /* subito dopo un invio orario */
    uint32_t p0 = pkts;
    sim_set_env(5, 950, 10100);                          /* +0,5 °C: sotto la soglia di +1,0 */
    run_for(15u * 60u);
    CHECK(pkts > p0);                                    /* inviato entro 15 minuti, senza aspettare l'ora */
    uint32_t p1 = pkts;
    run_for(40u * 60u);
    CHECK(pkts - p1 <= 1u);                              /* niente raffica di invii durante la gelata */
}

static void scenario_time_sync(void)
{
    provision();
    sim_set_rtc_wrong(0);                                /* pile tolte: l'orologio riparte da zero */
    station_init();
    station_status_t st; station_get_status(&st);
    CHECK(!st.time_synced);
    run_for(DAY / 4);
    station_get_status(&st);
    CHECK(st.time_synced);
    uint32_t rtc = hal_rtc_now(), tru = sim_true_time();
    CHECK((rtc > tru ? rtc - tru : tru - rtc) <= 2u);    /* orologio allineato all'ora del server */
    CHECK(db[st.acked_seq].time >= T0);                  /* le misure recenti hanno l'ora vera */
    CHECK((db[st.acked_seq].flags & RECF_TIME_UNSYNC) == 0u);
}

static void scenario_sensor_fault(void)
{
    provision();
    sim_set_sht35_present(false);
    sim_set_wet_raw(0xFFFF);
    station_init();
    run_for(3u * 3600u);
    station_status_t st; station_get_status(&st);
    record_t r = db[st.acked_seq];
    CHECK(r.flags & RECF_TEMP_FAULT);
    CHECK(r.flags & RECF_WET_FAULT);
    CHECK_EQ(r.temp_dC, REC_TEMP_FAULT);
    CHECK_EQ(r.hum_dPct, REC_U16_FAULT);
    CHECK_EQ(r.press_dhPa, 10132);                       /* la pressione invece funziona */
}

static void scenario_leaf_wetness(void)
{
    provision();
    station_init();
    run_for(2u * 3600u + 60u);
    sim_set_wet_raw(1200);                               /* foglia bagnata (soglia 1500, polarità 0) */
    run_for(30u * 60u);
    sim_set_wet_raw(2200);                               /* asciutta */
    run_for(2u * 3600u);
    station_status_t st; station_get_status(&st);
    uint32_t wet_total = 0;
    for (uint32_t s = 1; s <= st.acked_seq; s++) wet_total += db[s].wet_min;
    if (!(wet_total >= 29u && wet_total <= 31u)) printf("    minuti bagnati misurati: %u\n", wet_total);
    CHECK(wet_total >= 29u && wet_total <= 31u);         /* 30 minuti di bagnatura misurati */
}

static void scenario_not_provisioned(void)
{
    sim_reset_all(); server_reset(); sim_set_server(server); sim_net_reset();
    sim_set_time(T0);
    station_init();                                      /* nessuna identità in EEPROM */
    run_for(DAY / 4);
    station_status_t st; station_get_status(&st);
    CHECK(!st.provisioned);
    CHECK(st.last_seq > 30u);                            /* misura comunque e conserva */
    CHECK_EQ(pkts, 0);                                   /* ma non invia nulla */
}

static void test_sim7020_parsers(void)
{
    uint8_t st, rssi, sock, buf[16]; uint16_t n;
    CHECK(sim7020_parse_cereg("+CEREG: 0,1", &st)); CHECK_EQ(st, 1);
    CHECK(sim7020_parse_cereg("+CEREG: 2,5,\"1A2B\",\"01A2B3C4\",9", &st)); CHECK_EQ(st, 5);
    CHECK(sim7020_parse_cereg("+CEREG: 2", &st)); CHECK_EQ(st, 2);       /* URC */
    CHECK(!sim7020_parse_cereg("+CSQ: 1,2", &st));
    CHECK(sim7020_parse_csq("+CSQ: 17,99", &rssi)); CHECK_EQ(rssi, 17);
    CHECK(sim7020_parse_csonmi("+CSONMI: 0,8,A1B2c3D4", &sock, buf, sizeof buf, &n));
    CHECK_EQ(sock, 0); CHECK_EQ(n, 4); CHECK_EQ(buf[0], 0xA1); CHECK_EQ(buf[2], 0xC3);
    CHECK(sim7020_parse_csonmi("+CSONMI: 1,4,\"0AFF\"", &sock, buf, sizeof buf, &n));
    CHECK_EQ(sock, 1); CHECK_EQ(n, 2); CHECK_EQ(buf[1], 0xFF);
    CHECK(!sim7020_parse_csonmi("+CSONMI: 0,4,ZZ11", &sock, buf, sizeof buf, &n));
}

static void drift_case(double rate)
{
    provision();
    sim_set_rtc_rate(rate);
    station_init();
    run_for(2u * DAY);
    station_status_t st; station_get_status(&st);
    /* misure ogni 10 minuti VERI nonostante l'orologio sbagliato: 288 in due giorni */
    if (!(st.last_seq >= 284u && st.last_seq <= 292u)) printf("    rate %.2f: %u misure\n", rate, st.last_seq);
    CHECK(st.last_seq >= 284u && st.last_seq <= 292u);
    /* gli orari salvati sono quelli veri, a meno di un minuto */
    uint32_t worst = 0;
    for (uint32_t s = 30; s <= st.acked_seq; s++) {
        if (!have[s] || !have[s - 1]) continue;
        uint32_t gap = db[s].time - db[s - 1].time;
        uint32_t err = gap > 600u ? gap - 600u : 600u - gap;
        if (err > worst) worst = err;
    }
    if (worst > 60u) printf("    rate %.2f: scarto massimo tra misure %u s\n", rate, worst);
    CHECK(worst <= 60u);
    uint32_t lag = sim_true_time() - db[st.acked_seq].time;
    CHECK(lag <= 2u * 3600u);
}

static void scenario_rtc_drift(void)
{
    drift_case(1.12);     /* orologio interno il 12% troppo veloce */
    drift_case(0.88);     /* il 12% troppo lento */
    drift_case(1.00);
}

static void test_sim7020_setup_commands(void)
{
    sim_reset_all();
    sim_uart_reset();
    const uint8_t bands[4] = { 8, 20, 0, 0 };
    CHECK(sim7020_setup_once("iot.1nce.net", bands, 0));
    const char *log = sim_uart_tx_log();
    CHECK(strstr(log, "AT+CBAND=8,20\n") != NULL);
    CHECK(strstr(log, "AT*MCGDEFCONT=\"IP\",\"iot.1nce.net\"\n") != NULL);
    CHECK(strstr(log, "AT+COPS=0\n") != NULL);
    sim_uart_reset();
    const uint8_t b2[4] = { 20, 0, 0, 0 };
    CHECK(sim7020_setup_once("em", b2, 22210));
    log = sim_uart_tx_log();
    CHECK(strstr(log, "AT+CBAND=20\n") != NULL);
    CHECK(strstr(log, "\"em\"") != NULL);
    CHECK(strstr(log, "AT+COPS=1,2,\"22210\"\n") != NULL);
}

static void scenario_bad_apn_rollback(void)
{
    provision();
    station_init();
    run_for(DAY / 4);
    station_status_t a; station_get_status(&a);
    /* qualcuno invia per errore un APN sbagliato */
    const char *bad = "apn.sbagliato";
    pend_cfg[0] = CFG_TAG_APN; pend_cfg[1] = (uint8_t)strlen(bad); memcpy(pend_cfg + 2, bad, strlen(bad));
    pend_cfg_len = (uint8_t)(2 + strlen(bad)); pend_cfg_ver = 5;
    run_for(DAY);
    station_status_t b; station_get_status(&b);
    CHECK(strcmp(station_config()->apn, "iot.1nce.net") == 0);   /* tornata alla rete che funzionava */
    CHECK_EQ(reported_rejected, 5);                              /* e il server lo sa */
    CHECK(station_config()->version != 5);
    CHECK_EQ(db_count(1, b.acked_seq), b.acked_seq);             /* nessuna misura persa */
    CHECK(b.last_seq - b.acked_seq <= 6u);
    /* il server non la reinvia e la centralina resta stabile */
    run_for(DAY);
    CHECK(strcmp(station_config()->apn, "iot.1nce.net") == 0);
    (void)a;
}

static void scenario_good_apn_change(void)
{
    provision();
    sim_set_accepted_apn("");                                    /* la rete accetta il nuovo APN */
    station_init();
    run_for(DAY / 4);
    const char *apn = "nuovo.apn";
    pend_cfg[0] = CFG_TAG_APN; pend_cfg[1] = (uint8_t)strlen(apn); memcpy(pend_cfg + 2, apn, strlen(apn));
    pend_cfg[2 + strlen(apn)] = CFG_TAG_BANDS; pend_cfg[3 + strlen(apn)] = 1; pend_cfg[4 + strlen(apn)] = 20;
    pend_cfg_len = (uint8_t)(5 + strlen(apn)); pend_cfg_ver = 6;
    run_for(DAY / 2);
    CHECK(strcmp(station_config()->apn, "nuovo.apn") == 0);
    CHECK_EQ(station_config()->bands[0], 20); CHECK_EQ(station_config()->bands[1], 0);
    CHECK_EQ(reported_cfg, 6);
    CHECK_EQ(reported_rejected, 0);
    station_init();                                              /* resta dopo un riavvio */
    CHECK(strcmp(station_config()->apn, "nuovo.apn") == 0);
    /* ora la rete accetta solo il nuovo APN: la centralina continua a funzionare */
    sim_set_accepted_apn("nuovo.apn");
    uint32_t p0 = pkts;
    run_for(DAY / 4);
    CHECK(pkts > p0);
}

void run_app_tests(void)
{
    RUN(test_sim7020_setup_commands);
    RUN(scenario_bad_apn_rollback);
    RUN(scenario_good_apn_change);
    RUN(scenario_rtc_drift);
    RUN(test_sim7020_parsers);
    RUN(test_sht35_conversion);
    RUN(test_lps22hb);
    RUN(test_eeprom);
    RUN(test_persist);
    RUN(scenario_normal_day);
    RUN(scenario_outage_3_days);
    RUN(scenario_lost_responses);
    RUN(scenario_outage_longer_than_memory);
    RUN(scenario_reboot_with_backlog);
    RUN(scenario_remote_config);
    RUN(scenario_frost_alert);
    RUN(scenario_time_sync);
    RUN(scenario_sensor_fault);
    RUN(scenario_leaf_wetness);
    RUN(scenario_not_provisioned);
}
