/*
 * packet.h — Formato dei messaggi tra centralina e server (payload CoAP).
 *
 * UPLINK (centralina -> server), POST confermabile su /m
 *   0  proto_ver   u8   = 1
 *   1  msg_type    u8   = 0x01 dati
 *   2  imei        u64  (le 15 cifre come numero)
 *  10  fw_ver      u16
 *  12  cfg_ver     u16
 *  14  salute      13 byte (vedi health_t)
 *  27  first_seq   u32
 *  31  n           u8   (0..PKT_MAX_RECORDS; 0 = solo salute)
 *  32  record      n x 14 byte
 *  ..  hmac        8 byte (HMAC-SHA256 troncato, su tutto ciò che precede)
 *
 * DOWNLINK (server -> centralina), risposta CoAP 2.04 allegata all'ACK
 *   0  proto_ver   u8   = 1
 *   1  msg_type    u8   = 0x81 conferma
 *   2  req_tag     4 byte = primi 4 byte dell'HMAC dell'uplink (lega risposta e richiesta)
 *   6  acked_seq   u32  ultima sequenza salvata nel database
 *  10  server_time u32  s dal 2020-01-01 UTC
 *  14  flags       u8   bit0 = firmware nuovo disponibile
 *  15  cfg_ver     u16
 *  17  cfg_len     u8
 *  18  cfg TLV     cfg_len byte
 *  ..  hmac        8 byte
 *
 * Tutti i campi multibyte sono little endian.
 */
#ifndef PACKET_H
#define PACKET_H

#include <stdint.h>
#include <stdbool.h>
#include "record.h"

#define PKT_PROTO_VER       1u
#define PKT_TYPE_DATA       0x01u
#define PKT_TYPE_ACK        0x81u
#define PKT_HMAC_LEN        8u
#define PKT_HEADER_LEN      32u
#define PKT_MAX_RECORDS     30u
#define PKT_MAX_UPLINK      (PKT_HEADER_LEN + PKT_MAX_RECORDS * REC_WIRE_SIZE + PKT_HMAC_LEN)  /* 460 */
#define PKT_MAX_UPLINK_COAP (PKT_MAX_UPLINK + 13u)  /* + intestazione CoAP (COAP_OVERHEAD) */
#define PKT_MAX_CFG_TLV     64u
#define PKT_MAX_DOWNLINK    (18u + PKT_MAX_CFG_TLV + PKT_HMAC_LEN)
#define DEVICE_KEY_LEN      16u

typedef struct {
    uint16_t batt_mv;
    int8_t   rsrp_dbm;       /* potenza del segnale ricevuto, -140..-44 */
    int8_t   snr_db;
    uint8_t  csq;            /* AT+CSQ grezzo, 99 = sconosciuto */
    uint8_t  last_reset;     /* RESET_* di hal.h */
    uint16_t reset_count;
    uint8_t  modem_fails;    /* tentativi falliti dall'ultimo invio riuscito */
    uint16_t lost_records;   /* record sovrascritti prima dell'invio (dall'avvio) */
    uint16_t cfg_rejected;   /* ultima versione di configurazione rifiutata o annullata, 0 = nessuna */
} health_t;

typedef struct {
    uint64_t imei;
    uint16_t fw_ver;
    uint16_t cfg_ver;
    health_t health;
    uint32_t first_seq;
    uint8_t  n;
    record_t rec[PKT_MAX_RECORDS];
} uplink_t;

typedef struct {
    uint8_t  req_tag[4];
    uint32_t acked_seq;
    uint32_t server_time;
    uint8_t  flags;
    uint16_t cfg_ver;
    uint8_t  cfg_len;
    uint8_t  cfg[PKT_MAX_CFG_TLV];
} downlink_t;

#define DL_FLAG_FW_AVAILABLE 0x01u

/* Codifica l'uplink e lo firma. Ritorna la lunghezza; out deve essere PKT_MAX_UPLINK. */
uint16_t packet_encode_uplink(const uplink_t *u, const uint8_t key[DEVICE_KEY_LEN], uint8_t *out);

/* Decodifica e verifica firma e req_tag. */
typedef enum { PKT_OK = 0, PKT_ERR_LEN, PKT_ERR_TYPE, PKT_ERR_HMAC, PKT_ERR_TAG } pkt_result_t;
pkt_result_t packet_decode_downlink(const uint8_t *in, uint16_t len, const uint8_t key[DEVICE_KEY_LEN],
                                    const uint8_t expected_tag[4], downlink_t *d);

/* Lato server / test: decodifica dell'uplink e codifica del downlink. */
pkt_result_t packet_decode_uplink(const uint8_t *in, uint16_t len, const uint8_t key[DEVICE_KEY_LEN], uplink_t *u);
uint16_t     packet_encode_downlink(const downlink_t *d, const uint8_t key[DEVICE_KEY_LEN], uint8_t *out);

/* Tag della richiesta: primi 4 byte dell'HMAC dell'uplink appena codificato. */
void packet_uplink_tag(const uint8_t *uplink, uint16_t len, uint8_t tag[4]);

#endif
