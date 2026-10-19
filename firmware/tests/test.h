/* test.h — micro framework di test, nessuna dipendenza. */
#ifndef TEST_H
#define TEST_H
#include <stdio.h>

extern int t_fail, t_pass;
#define CHECK(cond) do { if (cond) t_pass++; else { t_fail++; \
    printf("  FALLITO %s:%d  %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a == _b) t_pass++; else { t_fail++; \
    printf("  FALLITO %s:%d  %s == %s  (%lld != %lld)\n", __FILE__, __LINE__, #a, #b, _a, _b); } } while (0)
#define RUN(fn) do { printf("- %s\n", #fn); fn(); } while (0)

#endif
