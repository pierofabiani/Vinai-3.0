# Vinai 3.0

Centraline meteo per la vigna, piattaforma web e modelli di previsione delle malattie della vite.

Le centraline sono le schede **Hive Rev 1.1** già prodotte (PIC24FJ256GA704, modem NB-IoT SIM7020E, sensori SHT35 e LPS22HB, bagnatura fogliare capacitiva), con un firmware riscritto da zero.

## Struttura

| Cartella | Contenuto | Stato |
| --- | --- | --- |
| [`firmware/`](firmware/) | firmware della centralina, in C, con test sul PC | struttura e moduli core scritti e testati; parte legata alla scheda da completare al banco |
| [`server/`](server/) | ricezione dei pacchetti CoAP, API, console di gestione (TypeScript) | P2: ingest, accesso (Better Auth), aziende e inviti, API della console |
| [`packages/protocol/`](packages/protocol/) | codec del protocollo in TypeScript, verificato sui vettori del firmware | P1: completo |
| [`app/`](app/) | PWA per gli utenti e console (TypeScript, React) | P2: accesso, inviti, console (flotta, scheda, laboratorio, aziende, utenti), installazione da QR; aspetto provvisorio fino a P3 |
| [`models/`](models/) | modelli delle malattie e AI (Python) | da iniziare, con l'agronomo |
| [`infra/`](infra/) | server, backup, monitoraggio | da iniziare |
| [`docs/`](docs/) | architettura, piano, note di decisione | avviato |

## Documenti di riferimento

- [Architettura delle centraline e del backend](https://claude.ai/code/artifact/f68cf574-fe3f-4ea8-aa41-1021d73c7e07)
- [Piano di progetto](https://claude.ai/code/artifact/828d4781-d888-48a0-ba60-3518f99d7e18)
- [Piattaforma: come la costruiamo](docs/piattaforma.md)
- [Note di decisione](docs/decisioni/)

## Avvio rapido (piattaforma)

Servono Node.js 22, pnpm (`corepack enable`) e Docker.

```
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` avvia il database (PostgreSQL + TimescaleDB + PostGIS su `127.0.0.1:5442`), api, porta CoAP e worker, e la web app su http://localhost:5173.

Primo accesso: in `.env` metti la tua email in `BOOTSTRAP_ADMIN_EMAIL`, apri `/accesso`, chiedi il collegamento e leggilo con `pnpm --filter @vinai/server posta` (in sviluppo le email non partono). Dati di prova per la console:

```
pnpm --filter @vinai/server sim --stations 20 --days 3 --imei-base 992000000000000
pnpm --filter @vinai/server seed:demo --imei-base 992000000000000
```

Per il design si usa la skill [Impeccable](https://github.com/pbakaus/impeccable), già nel repository in `.claude/skills/`. Per attivarne gli hook sul proprio computer: `npx impeccable install --providers=claude --scope=project`.

## Test

```
make -C firmware test   # firmware
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # piattaforma
pnpm --filter @vinai/app e2e   # nel browser, con pnpm dev acceso
```

Ogni modifica deve passare i test prima di essere unita (vedi `.github/workflows/`).
