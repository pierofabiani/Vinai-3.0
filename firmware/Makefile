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

# Compilazione per il PIC con XC16 (Mac: installare XC16 da Microchip, poi `make pic`).
# Il percorso del compilatore cambia con la versione: si può passare a mano, es. XC16=/Applications/microchip/xc16/v2.10/bin/xc16-gcc
# NON ANCORA PROVATO: la prima compilazione mostrerà gli errori da completare nel driver (TODO(fase 1)).
XC16    ?= xc16-gcc
PIC_CPU = 24FJ256GA704
PIC_SRC = $(wildcard src/core/*.c) $(wildcard src/drivers/*.c) $(wildcard src/app/*.c) src/hal/pic24/hal_pic24.c
PIC_FLAGS = -mcpu=$(PIC_CPU) -Os -Wall -Wextra -I src -I src/hal

pic: build/pic/hive3.elf
	@echo "Compilato: build/pic/hive3.elf (il .hex si genera con xc16-bin2hex, da verificare)"

build/pic/hive3.elf: $(PIC_SRC)
	@mkdir -p build/pic
	$(XC16) $(PIC_FLAGS) -o $@ $^

clean:
	rm -rf build

.PHONY: test vectors pic clean
