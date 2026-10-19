/* SHA-256 compatto (FIPS 180-4), scritto per int a 16 bit: tutte le operazioni
 * sono esplicitamente su uint32_t. Pensato per pochi pacchetti all'ora. */
#include "sha256.h"
#include <string.h>

static const uint32_t K[64] = {
    0x428a2f98ul,0x71374491ul,0xb5c0fbcful,0xe9b5dba5ul,0x3956c25bul,0x59f111f1ul,0x923f82a4ul,0xab1c5ed5ul,
    0xd807aa98ul,0x12835b01ul,0x243185beul,0x550c7dc3ul,0x72be5d74ul,0x80deb1feul,0x9bdc06a7ul,0xc19bf174ul,
    0xe49b69c1ul,0xefbe4786ul,0x0fc19dc6ul,0x240ca1ccul,0x2de92c6ful,0x4a7484aaul,0x5cb0a9dcul,0x76f988daul,
    0x983e5152ul,0xa831c66dul,0xb00327c8ul,0xbf597fc7ul,0xc6e00bf3ul,0xd5a79147ul,0x06ca6351ul,0x14292967ul,
    0x27b70a85ul,0x2e1b2138ul,0x4d2c6dfcul,0x53380d13ul,0x650a7354ul,0x766a0abbul,0x81c2c92eul,0x92722c85ul,
    0xa2bfe8a1ul,0xa81a664bul,0xc24b8b70ul,0xc76c51a3ul,0xd192e819ul,0xd6990624ul,0xf40e3585ul,0x106aa070ul,
    0x19a4c116ul,0x1e376c08ul,0x2748774cul,0x34b0bcb5ul,0x391c0cb3ul,0x4ed8aa4aul,0x5b9cca4ful,0x682e6ff3ul,
    0x748f82eeul,0x78a5636ful,0x84c87814ul,0x8cc70208ul,0x90befffaul,0xa4506cebul,0xbef9a3f7ul,0xc67178f2ul
};

#define ROR(x,n) (((x) >> (n)) | ((x) << (32u - (n))))

static void transform(sha256_ctx_t *c, const uint8_t *p)
{
    uint32_t w[64], a, b, cc, d, e, f, g, h, t1, t2;
    uint8_t i;
    for (i = 0; i < 16u; i++)
        w[i] = ((uint32_t)p[4*i] << 24) | ((uint32_t)p[4*i+1] << 16) | ((uint32_t)p[4*i+2] << 8) | (uint32_t)p[4*i+3];
    for (i = 16; i < 64u; i++) {
        uint32_t s0 = ROR(w[i-15], 7) ^ ROR(w[i-15], 18) ^ (w[i-15] >> 3);
        uint32_t s1 = ROR(w[i-2], 17) ^ ROR(w[i-2], 19) ^ (w[i-2] >> 10);
        w[i] = w[i-16] + s0 + w[i-7] + s1;
    }
    a = c->state[0]; b = c->state[1]; cc = c->state[2]; d = c->state[3];
    e = c->state[4]; f = c->state[5]; g = c->state[6]; h = c->state[7];
    for (i = 0; i < 64u; i++) {
        t1 = h + (ROR(e, 6) ^ ROR(e, 11) ^ ROR(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
        t2 = (ROR(a, 2) ^ ROR(a, 13) ^ ROR(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc));
        h = g; g = f; f = e; e = d + t1; d = cc; cc = b; b = a; a = t1 + t2;
    }
    c->state[0] += a; c->state[1] += b; c->state[2] += cc; c->state[3] += d;
    c->state[4] += e; c->state[5] += f; c->state[6] += g; c->state[7] += h;
}

void sha256_init(sha256_ctx_t *c)
{
    c->state[0] = 0x6a09e667ul; c->state[1] = 0xbb67ae85ul; c->state[2] = 0x3c6ef372ul; c->state[3] = 0xa54ff53aul;
    c->state[4] = 0x510e527ful; c->state[5] = 0x9b05688cul; c->state[6] = 0x1f83d9abul; c->state[7] = 0x5be0cd19ul;
    c->bitlen_lo = 0; c->bitlen_hi = 0; c->buflen = 0;
}

void sha256_update(sha256_ctx_t *c, const uint8_t *data, size_t len)
{
    while (len--) {
        c->buf[c->buflen++] = *data++;
        if (c->buflen == 64u) {
            transform(c, c->buf);
            c->buflen = 0;
            uint32_t old = c->bitlen_lo;
            c->bitlen_lo += 512u;
            if (c->bitlen_lo < old) c->bitlen_hi++;
        }
    }
}

void sha256_final(sha256_ctx_t *c, uint8_t out[32])
{
    uint32_t lo = c->bitlen_lo + (uint32_t)c->buflen * 8u;
    uint32_t hi = c->bitlen_hi + ((lo < c->bitlen_lo) ? 1u : 0u);
    uint8_t i = c->buflen;
    c->buf[i++] = 0x80u;
    if (i > 56u) {
        while (i < 64u) c->buf[i++] = 0;
        transform(c, c->buf);
        i = 0;
    }
    while (i < 56u) c->buf[i++] = 0;
    for (uint8_t k = 0; k < 4u; k++) {
        c->buf[56 + k] = (uint8_t)(hi >> (24u - 8u * k));
        c->buf[60 + k] = (uint8_t)(lo >> (24u - 8u * k));
    }
    transform(c, c->buf);
    for (i = 0; i < 8u; i++) {
        out[4*i]   = (uint8_t)(c->state[i] >> 24);
        out[4*i+1] = (uint8_t)(c->state[i] >> 16);
        out[4*i+2] = (uint8_t)(c->state[i] >> 8);
        out[4*i+3] = (uint8_t)(c->state[i]);
    }
}

void hmac_sha256(const uint8_t *key, size_t keylen,
                 const uint8_t *msg, size_t msglen, uint8_t out[32])
{
    uint8_t k[64], pad[64], inner[32];
    sha256_ctx_t c;
    memset(k, 0, sizeof k);
    if (keylen > 64u) { sha256_init(&c); sha256_update(&c, key, keylen); sha256_final(&c, k); }
    else memcpy(k, key, keylen);

    for (uint8_t i = 0; i < 64u; i++) pad[i] = (uint8_t)(k[i] ^ 0x36u);
    sha256_init(&c); sha256_update(&c, pad, 64); sha256_update(&c, msg, msglen); sha256_final(&c, inner);
    for (uint8_t i = 0; i < 64u; i++) pad[i] = (uint8_t)(k[i] ^ 0x5cu);
    sha256_init(&c); sha256_update(&c, pad, 64); sha256_update(&c, inner, 32); sha256_final(&c, out);
}
