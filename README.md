# Vinai 3.0

Centraline meteo per la vigna, piattaforma web e modelli di previsione delle malattie della vite.

Le centraline sono le schede **Hive Rev 1.1** già prodotte (PIC24FJ256GA704, modem NB-IoT SIM7020E, sensori SHT35 e LPS22HB, bagnatura fogliare capacitiva), con un firmware riscritto da zero.

## Struttura

| Cartella | Contenuto | Stato |
| --- | --- | --- |
| [`firmware/`](firmware/) | firmware della centralina, in C, con test sul PC | struttura e moduli core scritti e testati; parte legata alla scheda da completare al banco |
| [`server/`](server/) | ricezione dei pacchetti CoAP, API, console di gestione (TypeScript) | da iniziare |
| [`app/`](app/) | PWA per gli utenti (TypeScript, React) | da iniziare, prima il design |
| [`models/`](models/) | modelli delle malattie e AI (Python) | da iniziare, con l'agronomo |
| [`infra/`](infra/) | server, backup, monitoraggio | da iniziare |
| [`docs/`](docs/) | architettura, piano, note di decisione | avviato |

## Documenti di riferimento

- [Architettura delle centraline e del backend](https://claude.ai/code/artifact/f68cf574-fe3f-4ea8-aa41-1021d73c7e07)
- [Piano di progetto](https://claude.ai/code/artifact/828d4781-d888-48a0-ba60-3518f99d7e18)
- [Note di decisione](docs/decisioni/)

## Test

```
make -C firmware test
```

Ogni modifica deve passare i test prima di essere unita (vedi `.github/workflows/`).
