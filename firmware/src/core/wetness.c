#include "wetness.h"
#include "record.h"

void wetness_init(wetness_acc_t *a)
{
    a->sum_raw = 0;
    a->samples = 0;
    a->wet_samples = 0;
    a->faults = 0;
    a->is_wet = false;
}

void wetness_add(wetness_acc_t *a, bool ok, uint16_t raw,
                 uint16_t threshold, uint16_t hyst, uint8_t polarity)
{
    if (!ok) { a->faults++; return; }

    /* "wet_side" = quanto la lettura è dalla parte del bagnato, con segno */
    int32_t d = (int32_t)raw - (int32_t)threshold;
    if (polarity == 0u) d = -d;               /* bagnato quando raw scende */

    if (a->is_wet) { if (d < -(int32_t)hyst) a->is_wet = false; }
    else           { if (d >  (int32_t)hyst) a->is_wet = true;  }

    a->sum_raw += raw;
    a->samples++;
    if (a->is_wet) a->wet_samples++;
}

void wetness_close(wetness_acc_t *a, uint32_t interval_s,
                   uint16_t *raw_avg, uint8_t *wet_min, bool *fault)
{
    if (a->samples == 0u) {
        *raw_avg = REC_U16_FAULT;
        *wet_min = 0;
        *fault = true;
    } else {
        *raw_avg = (uint16_t)(a->sum_raw / a->samples);
        uint32_t secs = interval_s * a->wet_samples / a->samples;
        uint32_t mins = (secs + 30u) / 60u;
        *wet_min = (uint8_t)(mins > 255u ? 255u : mins);
        /* guasto se più di metà delle letture è fallita */
        *fault = (a->faults > a->samples);
    }
    a->sum_raw = 0;
    a->samples = 0;
    a->wet_samples = 0;
    a->faults = 0;
}
