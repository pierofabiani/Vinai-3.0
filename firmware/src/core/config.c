#include "config.h"
#include "bytes.h"
#include "crc.h"
#include <string.h>

void config_defaults(config_t *c)
{
    memset(c, 0, sizeof *c);
    c->version        = 0;
    c->interval_min   = 10;
    c->send_every     = 6;        /* un invio all'ora */
    c->wet_sample_s   = 60;
    c->wet_threshold  = 1500;     /* DA TARARE al banco con il sensore reale */
    c->wet_hyst       = 40;
    c->wet_polarity   = 0;
    c->server_ip[0] = 0; c->server_ip[1] = 0; c->server_ip[2] = 0; c->server_ip[3] = 0; /* fissato in laboratorio */
    c->server_port    = 5683;     /* porta standard CoAP */
    c->quiet_start_h  = CFG_NO_HOUR;
    c->quiet_end_h    = CFG_NO_HOUR;
    c->alert_frost_dC = 10;       /* +1,0 °C */
    c->low_batt_mv    = 3300;     /* DA TARARE: 3 AA alcaline */
    strcpy(c->apn, "iot.1nce.net");
    c->bands[0] = 8; c->bands[1] = 20;   /* bande NB-IoT usate in Italia */
    c->plmn = 0;
}

static bool band_ok(uint8_t b)
{
    /* bande NB-IoT supportate dal SIM7020E (versione europea) e comuni in Europa */
    static const uint8_t ok[] = { 1, 3, 5, 8, 20, 28 };
    for (uint8_t i = 0; i < sizeof ok; i++) if (ok[i] == b) return true;
    return false;
}

static bool apn_ok(const char *a)
{
    size_t n = strlen(a);
    if (n < 1u || n > CFG_APN_MAX) return false;
    for (size_t i = 0; i < n; i++) {
        char ch = a[i];
        if (ch < 0x21 || ch > 0x7E || ch == '"' || ch == '\\' || ch == ',') return false;
    }
    return true;
}

bool config_net_equal(const config_t *a, const config_t *b)
{
    return strcmp(a->apn, b->apn) == 0 && memcmp(a->bands, b->bands, CFG_BANDS_MAX) == 0 && a->plmn == b->plmn;
}

void config_copy_net(config_t *dst, const config_t *src)
{
    memcpy(dst->apn, src->apn, sizeof dst->apn);
    memcpy(dst->bands, src->bands, CFG_BANDS_MAX);
    dst->plmn = src->plmn;
}

static bool hour_ok(uint8_t h) { return h < 24u || h == CFG_NO_HOUR; }

bool config_valid(const config_t *c)
{
    if (c->interval_min < 1u || c->interval_min > 60u) return false;
    if (c->send_every < 1u || c->send_every > 30u) return false;
    if (c->wet_sample_s < 15u || c->wet_sample_s > 600u) return false;
    if (c->wet_threshold > 4095u || c->wet_hyst > 1000u) return false;
    if (c->wet_polarity > 1u) return false;
    if (c->server_port == 0u) return false;
    if (!hour_ok(c->quiet_start_h) || !hour_ok(c->quiet_end_h)) return false;
    if ((c->quiet_start_h == CFG_NO_HOUR) != (c->quiet_end_h == CFG_NO_HOUR)) return false;
    if (c->low_batt_mv < 2000u || c->low_batt_mv > 5000u) return false;
    if (c->apn[CFG_APN_MAX] != 0 || !apn_ok(c->apn)) return false;
    if (c->bands[0] == 0u) return false;                 /* almeno una banda */
    for (uint8_t i = 0; i < CFG_BANDS_MAX; i++) {
        if (c->bands[i] == 0u) {                         /* dopo uno zero solo zeri */
            for (uint8_t j = i; j < CFG_BANDS_MAX; j++) if (c->bands[j] != 0u) return false;
            break;
        }
        if (!band_ok(c->bands[i])) return false;
    }
    if (c->plmn != 0u && (c->plmn < 10000u || c->plmn > 999999u)) return false;  /* MCC+MNC: 5 o 6 cifre */
    return true;
}

cfg_result_t config_apply_tlv(config_t *c, const uint8_t *tlv, uint8_t len, uint16_t new_version)
{
    config_t n = *c;
    uint8_t i = 0;
    while (i < len) {
        if ((uint8_t)(len - i) < 2u) return CFG_ERR_FORMAT;
        uint8_t tag = tlv[i], l = tlv[i + 1];
        const uint8_t *v = &tlv[i + 2];
        if ((uint16_t)i + 2u + l > len) return CFG_ERR_FORMAT;
        switch (tag) {
        case CFG_TAG_INTERVAL:   if (l != 1u) return CFG_ERR_FORMAT; n.interval_min = v[0]; break;
        case CFG_TAG_SEND_EVERY: if (l != 1u) return CFG_ERR_FORMAT; n.send_every = v[0]; break;
        case CFG_TAG_WET_SAMPLE: if (l != 2u) return CFG_ERR_FORMAT; n.wet_sample_s = get_u16(v); break;
        case CFG_TAG_WET_THRESH: if (l != 2u) return CFG_ERR_FORMAT; n.wet_threshold = get_u16(v); break;
        case CFG_TAG_WET_HYST:   if (l != 2u) return CFG_ERR_FORMAT; n.wet_hyst = get_u16(v); break;
        case CFG_TAG_WET_POL:    if (l != 1u) return CFG_ERR_FORMAT; n.wet_polarity = v[0]; break;
        case CFG_TAG_SERVER:     if (l != 6u) return CFG_ERR_FORMAT;
                                 memcpy(n.server_ip, v, 4); n.server_port = get_u16(v + 4); break;
        case CFG_TAG_QUIET:      if (l != 2u) return CFG_ERR_FORMAT; n.quiet_start_h = v[0]; n.quiet_end_h = v[1]; break;
        case CFG_TAG_FROST:      if (l != 2u) return CFG_ERR_FORMAT; n.alert_frost_dC = (int16_t)get_u16(v); break;
        case CFG_TAG_LOW_BATT:   if (l != 2u) return CFG_ERR_FORMAT; n.low_batt_mv = get_u16(v); break;
        case CFG_TAG_APN:        if (l < 1u || l > CFG_APN_MAX) return CFG_ERR_FORMAT;
                                 memset(n.apn, 0, sizeof n.apn); memcpy(n.apn, v, l); break;
        case CFG_TAG_BANDS:      if (l < 1u || l > CFG_BANDS_MAX) return CFG_ERR_FORMAT;
                                 memset(n.bands, 0, CFG_BANDS_MAX); memcpy(n.bands, v, l); break;
        case CFG_TAG_PLMN:       if (l != 4u) return CFG_ERR_FORMAT; n.plmn = get_u32(v); break;
        default: return CFG_ERR_FORMAT;
        }
        i = (uint8_t)(i + 2u + l);
    }
    if (!config_valid(&n)) return CFG_ERR_RANGE;
    n.version = new_version;
    *c = n;
    return CFG_OK;
}

/* Layout EEPROM (64 byte):
 * 0 ver(2) 2 interval 3 send_every 4 wet_sample(2) 6 thr(2) 8 hyst(2) 10 pol
 * 11 ip(4) 15 port(2) 17 qs 18 qe 19 frost(2) 21 lowbatt(2)
 * 23 apn(30, terminato da zero) 53 bande(4) 57 plmn(4) 61 riservato 62 crc(2) */
void config_pack(const config_t *c, uint8_t out[CONFIG_BLOB_SIZE])
{
    memset(out, 0, CONFIG_BLOB_SIZE);
    put_u16(out + 0, c->version);
    out[2] = c->interval_min;
    out[3] = c->send_every;
    put_u16(out + 4, c->wet_sample_s);
    put_u16(out + 6, c->wet_threshold);
    put_u16(out + 8, c->wet_hyst);
    out[10] = c->wet_polarity;
    memcpy(out + 11, c->server_ip, 4);
    put_u16(out + 15, c->server_port);
    out[17] = c->quiet_start_h;
    out[18] = c->quiet_end_h;
    put_u16(out + 19, (uint16_t)c->alert_frost_dC);
    put_u16(out + 21, c->low_batt_mv);
    memcpy(out + 23, c->apn, CFG_APN_MAX + 1u);
    memcpy(out + 53, c->bands, CFG_BANDS_MAX);
    put_u32(out + 57, c->plmn);
    put_u16(out + 62, crc16_ccitt(out, 62));
}

bool config_unpack(const uint8_t in[CONFIG_BLOB_SIZE], config_t *c)
{
    if (crc16_ccitt(in, 62) != get_u16(in + 62)) return false;
    config_t n;
    memset(&n, 0, sizeof n);
    n.version = get_u16(in + 0);
    n.interval_min = in[2];
    n.send_every = in[3];
    n.wet_sample_s = get_u16(in + 4);
    n.wet_threshold = get_u16(in + 6);
    n.wet_hyst = get_u16(in + 8);
    n.wet_polarity = in[10];
    memcpy(n.server_ip, in + 11, 4);
    n.server_port = get_u16(in + 15);
    n.quiet_start_h = in[17];
    n.quiet_end_h = in[18];
    n.alert_frost_dC = (int16_t)get_u16(in + 19);
    n.low_batt_mv = get_u16(in + 21);
    memcpy(n.apn, in + 23, CFG_APN_MAX + 1u);
    memcpy(n.bands, in + 53, CFG_BANDS_MAX);
    n.plmn = get_u32(in + 57);
    if (!config_valid(&n)) return false;
    *c = n;
    return true;
}
