#include "persist.h"
#include "../drivers/eeprom24c08.h"
#include "../core/crc.h"
#include "../core/bytes.h"
#include <string.h>

#define ADDR_ID      0x000u
#define ADDR_CFG_A   0x040u
#define ADDR_CFG_B   0x080u
#define ADDR_CFG_OK  0x0C0u
#define ADDR_ST0     0x100u
#define ADDR_ST1     0x110u
#define ID_MAGIC0    'V'
#define ID_MAGIC1    '3'

bool persist_load_identity(identity_t *id)
{
    uint8_t b[28];
    if (!eeprom_read(ADDR_ID, b, sizeof b)) return false;
    if (b[0] != (uint8_t)ID_MAGIC0 || b[1] != (uint8_t)ID_MAGIC1) return false;
    if (crc16_ccitt(b, 26) != get_u16(b + 26)) return false;
    id->imei = (uint64_t)get_u32(b + 2) | ((uint64_t)get_u32(b + 6) << 32);
    memcpy(id->key, b + 10, DEVICE_KEY_LEN);
    return true;
}

bool persist_save_identity(const identity_t *id)
{
    uint8_t b[28];
    b[0] = (uint8_t)ID_MAGIC0; b[1] = (uint8_t)ID_MAGIC1;
    put_u32(b + 2, (uint32_t)id->imei);
    put_u32(b + 6, (uint32_t)(id->imei >> 32));
    memcpy(b + 10, id->key, DEVICE_KEY_LEN);
    put_u16(b + 26, crc16_ccitt(b, 26));
    return eeprom_write(ADDR_ID, b, sizeof b);
}

bool persist_load_config(config_t *c)
{
    uint8_t b[CONFIG_BLOB_SIZE];
    if (eeprom_read(ADDR_CFG_A, b, sizeof b) && config_unpack(b, c)) return true;
    if (eeprom_read(ADDR_CFG_B, b, sizeof b) && config_unpack(b, c)) return true;
    return false;
}

bool persist_save_config(const config_t *c)
{
    uint8_t b[CONFIG_BLOB_SIZE];
    config_pack(c, b);
    bool a = eeprom_write(ADDR_CFG_A, b, sizeof b);
    bool bb = eeprom_write(ADDR_CFG_B, b, sizeof b);
    return a && bb;
}

bool persist_load_good_config(config_t *c)
{
    uint8_t b[CONFIG_BLOB_SIZE];
    return eeprom_read(ADDR_CFG_OK, b, sizeof b) && config_unpack(b, c);
}

bool persist_save_good_config(const config_t *c)
{
    uint8_t b[CONFIG_BLOB_SIZE];
    config_pack(c, b);
    return eeprom_write(ADDR_CFG_OK, b, sizeof b);
}

/* slot di stato: acked(4) reset(2) rejected(2) gen(2) crc(2) = 12 byte */
static bool read_slot(uint16_t addr, pstate_t *s)
{
    uint8_t b[12];
    if (!eeprom_read(addr, b, sizeof b)) return false;
    if (crc16_ccitt(b, 10) != get_u16(b + 10)) return false;
    s->acked_seq = get_u32(b);
    s->reset_count = get_u16(b + 4);
    s->cfg_rejected = get_u16(b + 6);
    s->generation = get_u16(b + 8);
    return true;
}

bool persist_load_state(pstate_t *s)
{
    pstate_t a, b;
    bool va = read_slot(ADDR_ST0, &a), vb = read_slot(ADDR_ST1, &b);
    if (!va && !vb) return false;
    if (va && vb) *s = ((int16_t)(uint16_t)(a.generation - b.generation) > 0) ? a : b;
    else *s = va ? a : b;
    return true;
}

bool persist_save_state(pstate_t *s)
{
    uint8_t b[12];
    s->generation++;
    put_u32(b, s->acked_seq);
    put_u16(b + 4, s->reset_count);
    put_u16(b + 6, s->cfg_rejected);
    put_u16(b + 8, s->generation);
    put_u16(b + 10, crc16_ccitt(b, 10));
    /* slot alternati: generazione pari -> slot 0, dispari -> slot 1 */
    return eeprom_write((s->generation & 1u) ? ADDR_ST1 : ADDR_ST0, b, sizeof b);
}
