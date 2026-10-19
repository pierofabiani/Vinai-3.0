/* lps22hb.h — ST LPS22HB (pressione), I2C 0x5C (SA0 a massa: il vecchio firmware usa 0xB8/0xB9). */
#ifndef LPS22HB_H
#define LPS22HB_H
#include <stdint.h>
#include <stdbool.h>

#define LPS22HB_ADDR 0x5Cu

bool lps22hb_init(void);                      /* verifica WHO_AM_I e imposta il modo one-shot */
bool lps22hb_measure(uint16_t *press_dhPa);   /* misura singola, timeout 100 ms */

#endif
