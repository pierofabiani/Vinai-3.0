#include "record.h"
#include "bytes.h"
#include "crc.h"

/* Layout in flash (20 byte):
 *  0 seq(4) 4 time(4) 8 temp(2) 10 hum(2) 12 press(2) 14 wet_raw(2)
 * 16 wet_min(1) 17 flags(1) 18 crc16(2) */

void record_pack(const record_t *r, uint8_t out[REC_SIZE])
{
    put_u32(out + 0, r->seq);
    put_u32(out + 4, r->time);
    put_u16(out + 8, (uint16_t)r->temp_dC);
    put_u16(out + 10, r->hum_dPct);
    put_u16(out + 12, r->press_dhPa);
    put_u16(out + 14, r->wet_raw);
    out[16] = r->wet_min;
    out[17] = r->flags;
    put_u16(out + 18, crc16_ccitt(out, 18));
}

bool record_slot_erased(const uint8_t in[REC_SIZE])
{
    for (uint8_t i = 0; i < REC_SIZE; i++)
        if (in[i] != 0xFFu) return false;
    return true;
}

bool record_unpack(const uint8_t in[REC_SIZE], record_t *r)
{
    if (record_slot_erased(in)) return false;
    if (crc16_ccitt(in, 18) != get_u16(in + 18)) return false;
    r->seq        = get_u32(in + 0);
    r->time       = get_u32(in + 4);
    r->temp_dC    = (int16_t)get_u16(in + 8);
    r->hum_dPct   = get_u16(in + 10);
    r->press_dhPa = get_u16(in + 12);
    r->wet_raw    = get_u16(in + 14);
    r->wet_min    = in[16];
    r->flags      = in[17];
    return true;
}

/* Layout radio (14 byte): time(4) temp(2) hum(2) press(2) wet_raw(2) wet_min(1) flags(1) */
void record_wire_pack(const record_t *r, uint8_t out[REC_WIRE_SIZE])
{
    put_u32(out + 0, r->time);
    put_u16(out + 4, (uint16_t)r->temp_dC);
    put_u16(out + 6, r->hum_dPct);
    put_u16(out + 8, r->press_dhPa);
    put_u16(out + 10, r->wet_raw);
    out[12] = r->wet_min;
    out[13] = r->flags;
}

void record_wire_unpack(const uint8_t in[REC_WIRE_SIZE], uint32_t seq, record_t *r)
{
    r->seq        = seq;
    r->time       = get_u32(in + 0);
    r->temp_dC    = (int16_t)get_u16(in + 4);
    r->hum_dPct   = get_u16(in + 6);
    r->press_dhPa = get_u16(in + 8);
    r->wet_raw    = get_u16(in + 10);
    r->wet_min    = in[12];
    r->flags      = in[13];
}
