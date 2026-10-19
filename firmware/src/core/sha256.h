#ifndef SHA256_H
#define SHA256_H
#include <stdint.h>
#include <stddef.h>

typedef struct {
    uint32_t state[8];
    uint32_t bitlen_lo, bitlen_hi;
    uint8_t  buf[64];
    uint8_t  buflen;
} sha256_ctx_t;

void sha256_init(sha256_ctx_t *c);
void sha256_update(sha256_ctx_t *c, const uint8_t *data, size_t len);
void sha256_final(sha256_ctx_t *c, uint8_t out[32]);

/* HMAC-SHA256 completo (32 byte). Il protocollo ne usa i primi 8. */
void hmac_sha256(const uint8_t *key, size_t keylen,
                 const uint8_t *msg, size_t msglen, uint8_t out[32]);

#endif
