#include "packet.h"
#include "bytes.h"
#include "sha256.h"
#include <string.h>

static void sign(const uint8_t key[DEVICE_KEY_LEN], const uint8_t *msg, uint16_t len, uint8_t out[PKT_HMAC_LEN])
{
    uint8_t full[32];
    hmac_sha256(key, DEVICE_KEY_LEN, msg, len, full);
    memcpy(out, full, PKT_HMAC_LEN);
}

/* confronto a tempo costante */
static bool same(const uint8_t *a, const uint8_t *b, uint8_t n)
{
    uint8_t d = 0;
    for (uint8_t i = 0; i < n; i++) d |= (uint8_t)(a[i] ^ b[i]);
    return d == 0u;
}

static void put_u64(uint8_t *p, uint64_t v) { put_u32(p, (uint32_t)v); put_u32(p + 4, (uint32_t)(v >> 32)); }
static uint64_t get_u64(const uint8_t *p) { return (uint64_t)get_u32(p) | ((uint64_t)get_u32(p + 4) << 32); }

static void put_health(uint8_t *p, const health_t *h)
{
    put_u16(p + 0, h->batt_mv);
    p[2] = (uint8_t)h->rsrp_dbm;
    p[3] = (uint8_t)h->snr_db;
    p[4] = h->csq;
    p[5] = h->last_reset;
    put_u16(p + 6, h->reset_count);
    p[8] = h->modem_fails;
    put_u16(p + 9, h->lost_records);
    put_u16(p + 11, h->cfg_rejected);
}

static void get_health(const uint8_t *p, health_t *h)
{
    h->batt_mv = get_u16(p + 0);
    h->rsrp_dbm = (int8_t)p[2];
    h->snr_db = (int8_t)p[3];
    h->csq = p[4];
    h->last_reset = p[5];
    h->reset_count = get_u16(p + 6);
    h->modem_fails = p[8];
    h->lost_records = get_u16(p + 9);
    h->cfg_rejected = get_u16(p + 11);
}

uint16_t packet_encode_uplink(const uplink_t *u, const uint8_t key[DEVICE_KEY_LEN], uint8_t *out)
{
    uint8_t n = (u->n > PKT_MAX_RECORDS) ? (uint8_t)PKT_MAX_RECORDS : u->n;
    out[0] = PKT_PROTO_VER;
    out[1] = PKT_TYPE_DATA;
    put_u64(out + 2, u->imei);
    put_u16(out + 10, u->fw_ver);
    put_u16(out + 12, u->cfg_ver);
    put_health(out + 14, &u->health);
    put_u32(out + 27, u->first_seq);
    out[31] = n;
    uint16_t pos = PKT_HEADER_LEN;
    for (uint8_t i = 0; i < n; i++) {
        record_wire_pack(&u->rec[i], out + pos);
        pos = (uint16_t)(pos + REC_WIRE_SIZE);
    }
    sign(key, out, pos, out + pos);
    return (uint16_t)(pos + PKT_HMAC_LEN);
}

void packet_uplink_tag(const uint8_t *uplink, uint16_t len, uint8_t tag[4])
{
    memcpy(tag, uplink + len - PKT_HMAC_LEN, 4);
}

pkt_result_t packet_decode_uplink(const uint8_t *in, uint16_t len, const uint8_t key[DEVICE_KEY_LEN], uplink_t *u)
{
    uint8_t mac[PKT_HMAC_LEN];
    if (len < PKT_HEADER_LEN + PKT_HMAC_LEN) return PKT_ERR_LEN;
    if (in[0] != PKT_PROTO_VER || in[1] != PKT_TYPE_DATA) return PKT_ERR_TYPE;
    uint8_t n = in[31];
    if (n > PKT_MAX_RECORDS || len != (uint16_t)(PKT_HEADER_LEN + n * REC_WIRE_SIZE + PKT_HMAC_LEN)) return PKT_ERR_LEN;
    sign(key, in, (uint16_t)(len - PKT_HMAC_LEN), mac);
    if (!same(mac, in + len - PKT_HMAC_LEN, PKT_HMAC_LEN)) return PKT_ERR_HMAC;
    u->imei = get_u64(in + 2);
    u->fw_ver = get_u16(in + 10);
    u->cfg_ver = get_u16(in + 12);
    get_health(in + 14, &u->health);
    u->first_seq = get_u32(in + 27);
    u->n = n;
    for (uint8_t i = 0; i < n; i++)
        record_wire_unpack(in + PKT_HEADER_LEN + (uint16_t)i * REC_WIRE_SIZE, u->first_seq + i, &u->rec[i]);
    return PKT_OK;
}

uint16_t packet_encode_downlink(const downlink_t *d, const uint8_t key[DEVICE_KEY_LEN], uint8_t *out)
{
    uint8_t cl = (d->cfg_len > PKT_MAX_CFG_TLV) ? (uint8_t)PKT_MAX_CFG_TLV : d->cfg_len;
    out[0] = PKT_PROTO_VER;
    out[1] = PKT_TYPE_ACK;
    memcpy(out + 2, d->req_tag, 4);
    put_u32(out + 6, d->acked_seq);
    put_u32(out + 10, d->server_time);
    out[14] = d->flags;
    put_u16(out + 15, d->cfg_ver);
    out[17] = cl;
    memcpy(out + 18, d->cfg, cl);
    uint16_t pos = (uint16_t)(18u + cl);
    sign(key, out, pos, out + pos);
    return (uint16_t)(pos + PKT_HMAC_LEN);
}

pkt_result_t packet_decode_downlink(const uint8_t *in, uint16_t len, const uint8_t key[DEVICE_KEY_LEN],
                                    const uint8_t expected_tag[4], downlink_t *d)
{
    uint8_t mac[PKT_HMAC_LEN];
    if (len < 18u + PKT_HMAC_LEN) return PKT_ERR_LEN;
    if (in[0] != PKT_PROTO_VER || in[1] != PKT_TYPE_ACK) return PKT_ERR_TYPE;
    uint8_t cl = in[17];
    if (cl > PKT_MAX_CFG_TLV || len != (uint16_t)(18u + cl + PKT_HMAC_LEN)) return PKT_ERR_LEN;
    sign(key, in, (uint16_t)(len - PKT_HMAC_LEN), mac);
    if (!same(mac, in + len - PKT_HMAC_LEN, PKT_HMAC_LEN)) return PKT_ERR_HMAC;
    if (!same(in + 2, expected_tag, 4)) return PKT_ERR_TAG;
    memcpy(d->req_tag, in + 2, 4);
    d->acked_seq = get_u32(in + 6);
    d->server_time = get_u32(in + 10);
    d->flags = in[14];
    d->cfg_ver = get_u16(in + 15);
    d->cfg_len = cl;
    memcpy(d->cfg, in + 18, cl);
    return PKT_OK;
}
