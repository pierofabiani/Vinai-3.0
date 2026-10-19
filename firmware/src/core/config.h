/*
 * config.h — Parametri della centralina modificabili da remoto.
 *
 * Il server invia solo i parametri che cambiano, come TLV (tag, lunghezza,
 * valore), insieme a un nuovo numero di versione. La centralina valida TUTTI i
 * valori prima di applicarli: se uno è fuori range la configurazione intera
 * viene rifiutata e resta quella vecchia (niente stati a metà).
 */
#ifndef CONFIG_H
#define CONFIG_H

#include <stdint.h>
#include <stdbool.h>

#define CFG_NO_HOUR       0xFFu
#define CFG_ALERT_OFF     ((int16_t)-32768)
#define CFG_APN_MAX       29u
#define CFG_BANDS_MAX     4u

typedef struct {
    uint16_t version;
    uint8_t  interval_min;    /* 1..60: ogni quanto si salva una misura */
    uint8_t  send_every;      /* 1..30: misure per invio */
    uint16_t wet_sample_s;    /* 15..600: campionamento della bagnatura */
    uint16_t wet_threshold;   /* soglia grezza bagnato/asciutto */
    uint16_t wet_hyst;        /* isteresi attorno alla soglia */
    uint8_t  wet_polarity;    /* 0: bagnato se raw < soglia, 1: se raw > soglia */
    uint8_t  server_ip[4];
    uint16_t server_port;
    uint8_t  quiet_start_h;   /* ore UTC senza invii programmati, CFG_NO_HOUR = nessuna */
    uint8_t  quiet_end_h;
    int16_t  alert_frost_dC;  /* sotto questa temperatura invio immediato */
    uint16_t low_batt_mv;
    /* Rete cellulare: cambiare fornitore di SIM = nuova SIM + questi tre valori */
    char     apn[CFG_APN_MAX + 1];  /* stringa terminata da zero */
    uint8_t  bands[CFG_BANDS_MAX];  /* bande NB-IoT, 0 = posto libero; es. {8, 20, 0, 0} */
    uint32_t plmn;                  /* operatore forzato (es. 22210 = Vodafone IT), 0 = automatico */
} config_t;

/* Tag TLV del downlink */
enum {
    CFG_TAG_INTERVAL   = 1,   /* u8 */
    CFG_TAG_SEND_EVERY = 2,   /* u8 */
    CFG_TAG_WET_SAMPLE = 3,   /* u16 */
    CFG_TAG_WET_THRESH = 4,   /* u16 */
    CFG_TAG_WET_HYST   = 5,   /* u16 */
    CFG_TAG_WET_POL    = 6,   /* u8 */
    CFG_TAG_SERVER     = 7,   /* ip[4] + porta u16 */
    CFG_TAG_QUIET      = 8,   /* u8 inizio + u8 fine */
    CFG_TAG_FROST      = 9,   /* i16 */
    CFG_TAG_LOW_BATT   = 10,  /* u16 */
    CFG_TAG_APN        = 11,  /* 1..29 caratteri ASCII stampabili, senza virgolette */
    CFG_TAG_BANDS      = 12,  /* 1..4 byte, numeri di banda */
    CFG_TAG_PLMN       = 13   /* u32 (0 = scelta automatica dell'operatore) */
};

typedef enum {
    CFG_OK = 0,
    CFG_ERR_FORMAT,       /* TLV troncato o tag sconosciuto */
    CFG_ERR_RANGE         /* valore fuori dai limiti */
} cfg_result_t;

void         config_defaults(config_t *c);
bool         config_valid(const config_t *c);
/* Applica i TLV a una copia; se tutto è valido la copia diventa la nuova
 * configurazione con 'new_version'. */
cfg_result_t config_apply_tlv(config_t *c, const uint8_t *tlv, uint8_t len, uint16_t new_version);

/* true se i parametri di rete (APN, bande, operatore) coincidono. */
bool config_net_equal(const config_t *a, const config_t *b);
/* Copia in 'dst' i soli parametri di rete di 'src'. */
void config_copy_net(config_t *dst, const config_t *src);

/* Serializzazione per la EEPROM (con CRC). */
#define CONFIG_BLOB_SIZE 64u
void config_pack(const config_t *c, uint8_t out[CONFIG_BLOB_SIZE]);
bool config_unpack(const uint8_t in[CONFIG_BLOB_SIZE], config_t *c);

#endif
