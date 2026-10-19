/* sim.h — Controllo della simulazione hardware usata dai test su PC. */
#ifndef SIM_H
#define SIM_H
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#define SIM_PAGE_SIZE   2048u     /* byte utili per pagina (1024 istruzioni x 2 byte) */
#define SIM_PAGE_COUNT  24u       /* 48 KB di registro */

void sim_reset_all(void);                 /* stato iniziale: flash vergine, ora 0 */

/* Flash */
void sim_flash_power_cut_after(int32_t units); /* taglio dopo N unità da 4 byte; -1 = mai */
void sim_power_restore(void);                  /* "riavvio": la flash torna scrivibile */
bool sim_flash_power_was_cut(void);
uint32_t sim_flash_erase_count(uint16_t page);

/* Tempo */
void sim_set_time(uint32_t epoch2020);        /* ora vera = orologio della centralina */
void sim_set_rtc_wrong(uint32_t rtc);         /* l'orologio della centralina riparte da 'rtc' (es. pile tolte) */
uint32_t sim_true_time(void);
void sim_advance(uint32_t seconds);            /* secondi veri */
void sim_advance_rtc(uint32_t seconds);        /* secondi dell'orologio della centralina */
void sim_set_rtc_rate(double rate);            /* 1.10 = l'orologio corre il 10% più veloce */

/* Sensori */
void sim_set_env(int16_t temp_dC, uint16_t hum_dPct, uint16_t press_dhPa);
void sim_set_sht35_present(bool present);
void sim_set_lps22_present(bool present);
void sim_set_wet_raw(uint16_t raw);
void sim_set_battery(uint16_t mv);

/* EEPROM 24C08 */
void sim_eeprom_corrupt(uint16_t addr);

/* Rete: il "server" simulato riceve i pacchetti dal driver di rete simulato */
typedef bool (*sim_server_fn)(const uint8_t *req, uint16_t len, uint8_t *resp, uint16_t *resp_len);
void sim_set_server(sim_server_fn fn);
void sim_set_network_up(bool up);
void sim_set_drop_responses(bool drop);   /* il server salva ma la risposta si perde */
uint32_t sim_packets_sent(void);
void sim_set_accepted_apn(const char *apn);   /* la rete accetta solo questo APN; "" = qualunque */
void sim_net_reset(void);

/* Modem finto per il driver AT: risponde OK a ogni comando e registra quelli ricevuti */
void sim_uart_reset(void);
const char *sim_uart_tx_log(void);

#endif
