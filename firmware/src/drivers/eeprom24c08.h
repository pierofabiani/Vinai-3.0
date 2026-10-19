/* eeprom24c08.h — EEPROM AT24C08C, 1 KB in 4 blocchi da 256 byte (I2C 0x50..0x53), pagine da 16 byte. */
#ifndef EEPROM24C08_H
#define EEPROM24C08_H
#include <stdint.h>
#include <stdbool.h>

#define EEPROM_SIZE 1024u

bool eeprom_read(uint16_t addr, uint8_t *buf, uint16_t len);
bool eeprom_write(uint16_t addr, const uint8_t *buf, uint16_t len);   /* rilegge e verifica */

#endif
