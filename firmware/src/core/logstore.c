#include "logstore.h"
#include "../hal/hal.h"

static uint16_t s_spp;          /* slot per pagina */
static uint16_t s_total;        /* slot totali */
static uint16_t s_head;         /* prossimo slot da scrivere */
static uint16_t s_last_slot;    /* slot dell'ultimo record valido */
static uint32_t s_last_seq;     /* 0 = registro vuoto */
static uint32_t s_first_seq;

static uint32_t slot_offset(uint16_t slot)
{
    uint16_t page = (uint16_t)(slot / s_spp);
    uint16_t idx  = (uint16_t)(slot % s_spp);
    return (uint32_t)page * hal_logflash_page_size() + (uint32_t)idx * REC_SIZE;
}

static void read_slot(uint16_t slot, uint8_t buf[REC_SIZE])
{
    hal_logflash_read(slot_offset(slot), buf, REC_SIZE);
}

static uint16_t next_slot(uint16_t slot)
{
    slot++;
    return (slot >= s_total) ? 0u : slot;
}

/* Ricalcola il record più vecchio ancora leggibile. */
static void rescan_first(void)
{
    uint8_t  buf[REC_SIZE];
    record_t r;
    s_first_seq = 0;
    for (uint16_t s = 0; s < s_total; s++) {
        read_slot(s, buf);
        if (record_unpack(buf, &r) && r.seq <= s_last_seq) {
            if (s_first_seq == 0u || r.seq < s_first_seq) s_first_seq = r.seq;
        }
    }
}

void logstore_init(void)
{
    uint8_t  buf[REC_SIZE];
    record_t r;

    s_spp   = (uint16_t)(hal_logflash_page_size() / REC_SIZE);
    s_total = (uint16_t)(s_spp * hal_logflash_page_count());
    s_last_seq = 0;
    s_last_slot = 0;

    for (uint16_t s = 0; s < s_total; s++) {
        read_slot(s, buf);
        if (record_unpack(buf, &r) && r.seq > s_last_seq) {
            s_last_seq = r.seq;
            s_last_slot = s;
        }
    }
    s_head = (s_last_seq == 0u) ? 0u : next_slot(s_last_slot);
    rescan_first();
}

uint16_t logstore_capacity(void)
{
    /* una pagina è sempre "in riciclo" */
    return (uint16_t)(s_total - s_spp);
}

void logstore_bump_seq(uint32_t seq)
{
    if (seq > s_last_seq) {
        s_last_seq = seq;
        s_first_seq = 0;            /* i record precedenti non sono più consultabili */
    }
}

uint32_t logstore_last_seq(void)  { return s_last_seq; }
uint32_t logstore_first_seq(void) { return s_first_seq; }

/* Prepara s_head: se è il primo slot di una pagina la cancella; se lo slot non
 * è vergine (scrittura interrotta) passa al successivo. */
static bool prepare_head(void)
{
    uint8_t buf[REC_SIZE];
    for (uint16_t guard = 0; guard <= s_spp; guard++) {
        if ((s_head % s_spp) == 0u) {
            uint16_t page = (uint16_t)(s_head / s_spp);
            if (hal_logflash_erase_page(page) != HAL_OK) return false;
            /* i record di quella pagina non esistono più */
            if (s_first_seq != 0u) rescan_first();
            return true;
        }
        read_slot(s_head, buf);
        if (record_slot_erased(buf)) return true;
        s_head = next_slot(s_head);   /* slot rovinato: si salta */
    }
    return false;
}

bool logstore_append(record_t *r)
{
    uint8_t  buf[REC_SIZE];
    record_t check;

    for (uint8_t attempt = 0; attempt < 2u; attempt++) {
        if (!prepare_head()) return false;
        r->seq = s_last_seq + 1u;
        record_pack(r, buf);
        hal_status_t st = hal_logflash_write(slot_offset(s_head), buf, REC_SIZE);
        /* rilettura: la flash ECC non perdona */
        read_slot(s_head, buf);
        if (st == HAL_OK && record_unpack(buf, &check) && check.seq == r->seq) {
            s_last_seq = r->seq;
            s_last_slot = s_head;
            if (s_first_seq == 0u) s_first_seq = r->seq;
            s_head = next_slot(s_head);
            return true;
        }
        s_head = next_slot(s_head);    /* slot sprecato, si riprova sul successivo */
    }
    return false;
}

bool logstore_get(uint32_t seq, record_t *out)
{
    uint8_t buf[REC_SIZE];
    if (s_last_seq == 0u || seq == 0u || seq > s_last_seq) return false;
    if (s_first_seq == 0u || seq < s_first_seq) return false;

    /* Stima: i record sono consecutivi salvo slot saltati, quindi si parte
     * dalla posizione attesa e si torna indietro. */
    uint32_t back = s_last_seq - seq;
    if (back >= s_total) return false;
    uint16_t slot = (uint16_t)((s_last_slot + s_total - (uint16_t)back) % s_total);
    for (uint16_t i = 0; i < s_total; i++) {
        read_slot(slot, buf);
        if (record_unpack(buf, out) && out->seq == seq) return true;
        slot = (slot == 0u) ? (uint16_t)(s_total - 1u) : (uint16_t)(slot - 1u);
    }
    return false;
}
