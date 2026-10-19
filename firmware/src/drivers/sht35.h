/* sht35.h — Sensirion SHT35-DIS (temperatura e umidità), I2C 0x44. */
#ifndef SHT35_H
#define SHT35_H
#include <stdint.h>
#include <stdbool.h>

#define SHT35_ADDR 0x44u

/* Misura singola ad alta ripetibilità. Controlla il CRC di entrambi i valori
 * e riprova una volta. false = sensore assente o dato corrotto. */
bool sht35_measure(int16_t *temp_dC, uint16_t *hum_dPct);

/* Conversioni (esposte per i test). */
int16_t  sht35_temp_dC(uint16_t raw);
uint16_t sht35_hum_dPct(uint16_t raw);

#endif
