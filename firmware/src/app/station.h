/*
 * station.h — Logica della centralina: quando campionare, misurare, inviare.
 *
 * Uso (vedi main_pic.c):
 *     station_init();
 *     for (;;) { uint32_t s = station_step(); hal_rtc_alarm_in(s); hal_sleep(); }
 *
 * station_step() esegue tutto ciò che è scaduto e ritorna i secondi fino al
 * prossimo evento. Non conosce l'hardware: usa solo hal.h, i driver e net.h,
 * quindi gira identica nella simulazione su PC.
 */
#ifndef STATION_H
#define STATION_H

#include <stdint.h>
#include <stdbool.h>
#include "../core/config.h"

#define FW_VERSION  0x0300u     /* 3.0 */

void     station_init(void);
uint32_t station_step(void);

/* Osservabilità per test e diagnostica */
typedef struct {
    uint32_t acked_seq;
    uint32_t last_seq;
    uint16_t lost_records;
    uint8_t  modem_fails;
    bool     provisioned;
    bool     time_synced;
    uint32_t sends_ok, sends_failed;
} station_status_t;
void station_get_status(station_status_t *s);
const config_t *station_config(void);

#endif
