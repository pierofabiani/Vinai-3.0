# Test su PC dei moduli portabili e della logica applicativa.
# Il firmware per il PIC si compila con MPLAB X + XC16 (vedi README.md).

CC      ?= gcc
CFLAGS  ?= -std=c99 -Wall -Wextra -Wconversion -Wno-sign-conversion -O1 -g -fsanitize=address,undefined
SRC_CORE = $(wildcard src/core/*.c)
SRC_DRV  = $(wildcard src/drivers/*.c)
# net_sim7020.c e main_pic.c parlano con il modem e il PIC reali: esclusi dai test su PC
SRC_APP  = $(filter-out src/app/net_sim7020.c src/app/main_pic.c, $(wildcard src/app/*.c))
SRC_TEST = $(wildcard tests/*.c) $(wildcard tests/hal_host/*.c)

test: build/tests
	./build/tests

build/tests: $(SRC_CORE) $(SRC_DRV) $(SRC_APP) $(SRC_TEST)
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ $^

# Vettori d'oro del protocollo per il server (packages/protocol). Rigenerare
# a ogni modifica di packet.h, record.h, coap.h o config.h e fare il commit del JSON.
VECTORS = ../packages/protocol/vectors/firmware.json
SRC_VEC = tools/gen_vectors.c src/core/packet.c src/core/record.c src/core/sha256.c src/core/crc.c src/core/coap.c src/core/config.c

vectors: build/gen_vectors
	@mkdir -p $(dir $(VECTORS))
	./build/gen_vectors | python3 -m json.tool --indent 1 > $(VECTORS)

build/gen_vectors: $(SRC_VEC)
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ $^

clean:
	rm -rf build

.PHONY: test vectors clean
