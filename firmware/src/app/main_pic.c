/*
 * main_pic.c — Punto di ingresso sul PIC24FJ256GA704.
 *
 * Il PIC passa quasi tutto il tempo in Sleep. Lo sveglia l'allarme dell'RTCC
 * programmato con il tempo restituito da station_step(). Il watchdog è attivo
 * solo mentre la CPU lavora (configurazione FWDTEN "attivo solo fuori dallo
 * sleep", come nella vecchia V1.7): se il firmware si blocca, dopo pochi
 * secondi il PIC si riavvia e il registro in flash viene ricostruito.
 */
#include "../hal/hal.h"
#include "station.h"

int main(void)
{
    station_init();                 /* chiama hal_init() */
    for (;;) {
        uint32_t wait = station_step();
        if (wait > 0xFFFFu) wait = 0xFFFFu;
        hal_rtc_alarm_in((uint16_t)wait);
        hal_sleep();
    }
}
