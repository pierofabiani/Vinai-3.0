#include "station.h"
#include "persist.h"
#include "net.h"
#include "../hal/hal.h"
#include "../core/logstore.h"
#include "../core/packet.h"
#include "../core/wetness.h"
#include "../drivers/sht35.h"
#include "../drivers/lps22hb.h"
#include <string.h>

#define NEVER              0xFFFFFFFFul
#define TIME_VALID_MIN     (4ul * 365ul * 86400ul)   /* prima del 2024: orologio mai impostato */
#define BACKOFF_FIRST_MIN  10u
#define BACKOFF_MAX_MIN    360u                       /* 6 ore */
#define MAX_PACKETS_SESSION 12u                       /* 360 record per sessione, poi si continua dopo */
#define JITTER_MAX_S       300u
#define NET_FALLBACK_FAILS 3u                         /* tentativi falliti prima di tornare alla rete precedente */

static config_t      cfg;
static config_t      good_cfg;     /* ultima configurazione con cui un invio è riuscito */
static config_t      session_cfg;  /* configurazione con cui è stata aperta l'ultima sessione radio */
static identity_t    id;
static pstate_t      pst;
static wetness_acc_t wet;
static bool          provisioned, time_synced, lps_ok;
static uint8_t       last_reset, modem_fails;
static uint16_t      lost_records, backoff_min, batt_mv;
static uint8_t       since_send;
static bool          alert, frost_active;
static uint32_t      next_wet, next_rec, next_send;
static uint16_t      jitter_s;
static uint32_t      sends_ok, sends_failed;
static bool          reached_server;   /* nell'ultima sessione almeno una risposta valida */

/* buffer statici: niente allocazioni, niente stack profondo sul PIC */
static uplink_t   up;
static downlink_t dn;
static uint8_t    txbuf[PKT_MAX_UPLINK];
static uint8_t    rxbuf[PKT_MAX_DOWNLINK];

/* ---------------------------------------------------------------- orologio
 * L'RTCC potrebbe girare sull'oscillatore RC interno (dalle foto il quarzo da
 * 32 kHz sembra non montato): può sbagliare di parecchi punti percentuali.
 * Ogni risposta del server porta l'ora vera: da due sincronizzazioni si stima
 * quanto corre l'RTCC e lo si compensa in software. Con il quarzo il rapporto
 * resta 1 e la correzione è nulla.
 * Tutta la logica ragiona in "secondi veri"; solo l'attesa passata all'RTCC
 * viene convertita nei suoi secondi. */
static bool     clk_synced;
static uint32_t clk_sync_rtc;          /* lettura RTCC all'ultima sincronizzazione (= ora vera di allora) */
static uint32_t clk_ratio_q16 = 65536u; /* secondi veri per secondo RTCC, in virgola fissa 16.16 */

static uint32_t clock_now(void)
{
    uint32_t rtc = hal_rtc_now();
    if (!clk_synced || rtc < clk_sync_rtc) return rtc;
    uint64_t el = (uint64_t)(rtc - clk_sync_rtc) * clk_ratio_q16;
    return clk_sync_rtc + (uint32_t)(el >> 16);
}

static uint32_t clock_to_rtc(uint32_t true_s)
{
    uint64_t r = ((uint64_t)true_s << 16) + clk_ratio_q16 - 1u;
    return (uint32_t)(r / clk_ratio_q16);
}

/* Ritorna true se l'ora è cambiata in modo significativo. */
static bool clock_sync(uint32_t server_time)
{
    uint32_t rtc = hal_rtc_now();
    uint32_t est = clock_now();
    if (clk_synced && rtc > clk_sync_rtc && server_time > clk_sync_rtc) {
        uint32_t rtc_el = rtc - clk_sync_rtc, true_el = server_time - clk_sync_rtc;
        if (rtc_el >= 1800u) {                      /* almeno mezz'ora per una stima affidabile */
            uint64_t r = ((uint64_t)true_el << 16) / rtc_el;
            if (r >= 45875u && r <= 85197u) {       /* 0,70 .. 1,30: oltre è un errore, non una deriva */
                clk_ratio_q16 = (uint32_t)((clk_ratio_q16 + 3u * (uint32_t)r) / 4u);   /* media mobile */
            }
        }
    }
    hal_rtc_set(server_time);
    clk_sync_rtc = server_time;
    clk_synced = true;
    uint32_t diff = (server_time > est) ? server_time - est : est - server_time;
    return diff > 2u;
}

static uint32_t align_up(uint32_t t, uint32_t step) { return ((t / step) + 1u) * step; }

static bool in_quiet_hours(uint32_t now)
{
    if (cfg.quiet_start_h == CFG_NO_HOUR) return false;
    uint8_t h = (uint8_t)((now / 3600u) % 24u);
    if (cfg.quiet_start_h <= cfg.quiet_end_h) return h >= cfg.quiet_start_h && h < cfg.quiet_end_h;
    return h >= cfg.quiet_start_h || h < cfg.quiet_end_h;      /* fascia a cavallo della mezzanotte */
}

static uint32_t quiet_end(uint32_t now)
{
    uint32_t day = now - (now % 86400u);
    uint32_t t = day + (uint32_t)cfg.quiet_end_h * 3600u;
    if (t <= now) t += 86400u;
    return t;
}

static void schedule_send(uint32_t now, bool urgent)
{
    /* durante l'attesa dopo un errore gli invii normali non anticipano il tentativo */
    if (!urgent && backoff_min > 0u) return;
    uint32_t t = now + jitter_s;
    if (!urgent && in_quiet_hours(t)) t = quiet_end(now) + jitter_s;
    if (t < next_send) next_send = t;
}

static void reschedule_all(uint32_t now)
{
    next_wet = now + cfg.wet_sample_s;
    next_rec = align_up(now, (uint32_t)cfg.interval_min * 60u);
}

void station_init(void)
{
    hal_init();
    last_reset = hal_reset_reason();

    provisioned = persist_load_identity(&id);
    if (!provisioned) memset(&id, 0, sizeof id);
    if (!persist_load_config(&cfg)) config_defaults(&cfg);
    if (!persist_load_good_config(&good_cfg)) good_cfg = cfg;   /* prima accensione: vale quella del laboratorio */
    if (!persist_load_state(&pst)) { pst.acked_seq = 0; pst.reset_count = 0; pst.cfg_rejected = 0; pst.generation = 0; }
    pst.reset_count++;
    persist_save_state(&pst);

    logstore_init();
    logstore_bump_seq(pst.acked_seq);       /* sequenze sempre crescenti, anche con flash cancellata */

    lps_ok = lps22hb_init();
    wetness_init(&wet);

    clk_synced = false;
    clk_ratio_q16 = 65536u;
    uint32_t now = clock_now();
    time_synced = now >= TIME_VALID_MIN;    /* la RTCC del PIC perde l'ora senza alimentazione */
    jitter_s = (uint16_t)(id.imei % JITTER_MAX_S);
    lost_records = 0; modem_fails = 0; backoff_min = 0;
    since_send = 0; alert = false; frost_active = false; sends_ok = 0; sends_failed = 0;
    batt_mv = hal_battery_mv();

    reschedule_all(now);
    next_send = NEVER;
    schedule_send(now, true);               /* all'avvio: segnala il reset, prende ora e configurazione */
}

/* ---------------------------------------------------------------- misure */

static void sample_wetness(void)
{
    uint16_t raw = 0;
    bool ok = hal_wetness_raw(&raw) == HAL_OK;
    wetness_add(&wet, ok, raw, cfg.wet_threshold, cfg.wet_hyst, cfg.wet_polarity);
}

static void take_record(uint32_t now)
{
    record_t r;
    memset(&r, 0, sizeof r);
    r.time = now;

    hal_sensors_power(true);
    if (!sht35_measure(&r.temp_dC, &r.hum_dPct)) {
        r.temp_dC = REC_TEMP_FAULT; r.hum_dPct = REC_U16_FAULT;
        r.flags |= RECF_TEMP_FAULT | RECF_HUM_FAULT;
    }
    if (!lps_ok) lps_ok = lps22hb_init();
    if (!lps_ok || !lps22hb_measure(&r.press_dhPa)) {
        r.press_dhPa = REC_U16_FAULT; r.flags |= RECF_PRESS_FAULT; lps_ok = false;
    }
    hal_sensors_power(false);

    bool wet_fault;
    sample_wetness();                         /* un campione anche all'istante della misura */
    wetness_close(&wet, (uint32_t)cfg.interval_min * 60u, &r.wet_raw, &r.wet_min, &wet_fault);
    if (wet_fault) r.flags |= RECF_WET_FAULT;

    batt_mv = hal_battery_mv();
    if (batt_mv < cfg.low_batt_mv) r.flags |= RECF_LOW_BATT;
    if (!time_synced) r.flags |= RECF_TIME_UNSYNC;

    logstore_append(&r);   /* se la flash fallisce il record si perde, ma il ciclo continua */
    since_send++;

    /* gelata: un invio immediato all'ingresso sotto soglia, poi si riarma solo
     * quando la temperatura risale di 1 °C (niente raffiche di invii) */
    if (cfg.alert_frost_dC != CFG_ALERT_OFF && !(r.flags & RECF_TEMP_FAULT)) {
        if (!frost_active && r.temp_dC <= cfg.alert_frost_dC) {
            frost_active = true;
            alert = true;
            schedule_send(now, true);
        } else if (frost_active && r.temp_dC > cfg.alert_frost_dC + 10) {
            frost_active = false;
        }
    }
    if (since_send >= cfg.send_every) schedule_send(now, false);
}

/* ---------------------------------------------------------------- invio */

static void apply_downlink(uint32_t sent_to)
{
    if (dn.acked_seq > pst.acked_seq && dn.acked_seq <= sent_to) {
        pst.acked_seq = dn.acked_seq;
        persist_save_state(&pst);
    }
    if (dn.server_time >= TIME_VALID_MIN) {
        if (clock_sync(dn.server_time)) reschedule_all(dn.server_time);
        time_synced = true;
    }
    /* una versione già rifiutata o annullata non si riapplica: il server la vede
     * in health.cfg_rejected e deve inviarne una nuova, corretta */
    if (dn.cfg_len > 0u && dn.cfg_ver != cfg.version && dn.cfg_ver != pst.cfg_rejected) {
        config_t c = cfg;
        if (config_apply_tlv(&c, dn.cfg, dn.cfg_len, dn.cfg_ver) == CFG_OK) {
            bool timing = c.interval_min != cfg.interval_min || c.wet_sample_s != cfg.wet_sample_s;
            cfg = c;
            persist_save_config(&cfg);
            if (timing) reschedule_all(clock_now());
        } else {
            pst.cfg_rejected = dn.cfg_ver;
            persist_save_state(&pst);
        }
    }
}

/* Una sessione radio: invia tutto l'arretrato a pacchetti da 30 record. */
static bool send_session(void)
{
    if (!provisioned) return false;
    session_cfg = cfg;      /* una configurazione arrivata a sessione aperta non è ancora "collaudata" */
    net_result_t nr = net_open(&cfg);
    if (nr != NET_OK) return false;

    bool ok = true;
    for (uint8_t p = 0; p < MAX_PACKETS_SESSION; p++) {
        uint32_t last = logstore_last_seq();
        uint32_t from = pst.acked_seq + 1u;
        uint32_t first = logstore_first_seq();
        if (first != 0u && from < first) {          /* record sovrascritti prima dell'invio */
            uint32_t gap = first - from;
            lost_records = (uint16_t)((lost_records + gap > 0xFFFFu) ? 0xFFFFu : lost_records + gap);
            from = first;
        }

        memset(&up, 0, sizeof up);
        up.imei = id.imei;
        up.fw_ver = FW_VERSION;
        up.cfg_ver = cfg.version;
        up.first_seq = from;
        up.health.batt_mv = batt_mv;
        net_radio_info(&up.health.rsrp_dbm, &up.health.snr_db, &up.health.csq);
        up.health.last_reset = last_reset;
        up.health.reset_count = pst.reset_count;
        up.health.modem_fails = modem_fails;
        up.health.lost_records = lost_records;
        up.health.cfg_rejected = pst.cfg_rejected;

        uint8_t n = 0;
        for (uint32_t s = from; s <= last && n < PKT_MAX_RECORDS; s++) {
            if (logstore_get(s, &up.rec[n])) {
                n++;
            } else if (n == 0u) {
                up.first_seq = s + 1u;               /* buco in testa: si salta */
            } else {
                break;                               /* buco in mezzo: si chiude il pacchetto qui */
            }
        }
        up.n = n;
        uint32_t sent_to = (n > 0u) ? up.first_seq + n - 1u : up.first_seq - 1u;

        uint16_t len = packet_encode_uplink(&up, id.key, txbuf);
        uint8_t tag[4];
        packet_uplink_tag(txbuf, len, tag);
        uint16_t rlen = 0;
        hal_watchdog_kick();
        if (net_exchange(txbuf, len, rxbuf, &rlen, sizeof rxbuf) != NET_OK ||
            packet_decode_downlink(rxbuf, rlen, id.key, tag, &dn) != PKT_OK) {
            ok = false;
            break;
        }
        reached_server = true;
        apply_downlink(sent_to);
        if (pst.acked_seq < sent_to) { ok = false; break; }   /* il server non ha salvato tutto */
        if (pst.acked_seq >= logstore_last_seq()) break;      /* arretrato finito */
    }
    net_close();
    return ok;
}

static void do_send(uint32_t now)
{
    next_send = NEVER;
    reached_server = false;
    bool ok = send_session();
    if (!ok && reached_server) {
        /* la rete funziona (il server ha risposto), è mancato solo un pezzo:
         * niente attesa lunga e niente ritorno alla configurazione precedente */
        next_send = clock_now() + 300u;
        return;
    }
    if (ok) {
        sends_ok++;
        since_send = 0; alert = false; backoff_min = 0; modem_fails = 0;
        /* la rete funziona con questa configurazione: diventa il nuovo punto di ritorno */
        if (!config_net_equal(&session_cfg, &good_cfg) || session_cfg.version != good_cfg.version) {
            good_cfg = session_cfg;
            persist_save_good_config(&good_cfg);
        }
        if (pst.acked_seq < logstore_last_seq()) next_send = clock_now() + 60u;  /* ancora arretrato */
    } else {
        sends_failed++;
        if (modem_fails < 255u) modem_fails++;
        backoff_min = (backoff_min == 0u) ? BACKOFF_FIRST_MIN
                    : (uint16_t)((backoff_min * 2u > BACKOFF_MAX_MIN) ? BACKOFF_MAX_MIN : backoff_min * 2u);
        next_send = now + (uint32_t)backoff_min * 60u;

        /* Un cambio di APN, bande o operatore che impedisce di collegarsi non deve
         * isolare la centralina: dopo qualche tentativo si torna all'ultima
         * configurazione funzionante e si segnala la versione annullata. */
        if (modem_fails >= NET_FALLBACK_FAILS && !config_net_equal(&cfg, &good_cfg)) {
            pst.cfg_rejected = cfg.version;
            persist_save_state(&pst);
            bool timing = good_cfg.interval_min != cfg.interval_min || good_cfg.wet_sample_s != cfg.wet_sample_s;
            cfg = good_cfg;
            persist_save_config(&cfg);
            if (timing) reschedule_all(clock_now());
            modem_fails = 0; backoff_min = 0;
            next_send = now + 60u;                     /* si riprova subito con la rete che funzionava */
        }
    }
}

/* ---------------------------------------------------------------- ciclo */

uint32_t station_step(void)
{
    uint32_t now = clock_now();
    hal_watchdog_kick();

    if (now >= next_wet) {
        sample_wetness();
        next_wet += cfg.wet_sample_s;
        if (next_wet <= now) next_wet = now + cfg.wet_sample_s;   /* dopo una lunga attesa non si recupera */
    }
    if (now >= next_rec) {
        take_record(now);
        next_rec = align_up(now, (uint32_t)cfg.interval_min * 60u);
        next_wet = now + cfg.wet_sample_s;
    }
    if (now >= next_send) do_send(now);

    now = clock_now();
    uint32_t next = next_wet;
    if (next_rec < next) next = next_rec;
    if (next_send < next) next = next_send;
    return (next > now) ? clock_to_rtc(next - now) : 1u;
}

void station_get_status(station_status_t *s)
{
    s->acked_seq = pst.acked_seq;
    s->last_seq = logstore_last_seq();
    s->lost_records = lost_records;
    s->modem_fails = modem_fails;
    s->provisioned = provisioned;
    s->time_synced = time_synced;
    s->sends_ok = sends_ok;
    s->sends_failed = sends_failed;
}

const config_t *station_config(void) { return &cfg; }
