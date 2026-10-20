# Accesso con Better Auth, aziende e inviti in tabelle nostre

Data: 2026-10-19 · Stato: decisa

## Contesto

La P2 richiede accesso senza password (collegamento via email e passkey), aziende con ruoli e inviti, una console per l'amministratore e i tecnici. La nota 0007 proponeva Better Auth anche per le aziende (plugin organization).

## Decisione

- **Better Auth 1.7 solo per l'autenticazione**: collegamento via email (15 minuti), passkey (`@better-auth/passkey`, origine = `APP_URL`), sessioni di 30 giorni, ruolo globale nel campo `role` (`user`, `tecnico`, `admin`). Password disattivate.
- **Aziende, ruoli e inviti in tabelle nostre** (`organization`, `membership`, `invitation`). Con il plugin organization chi invita deve essere membro dell'azienda: l'amministratore sarebbe finito "titolare" in tutte. Ruoli per azienda: titolare, agronomo, collaboratore, ospite. Un agronomo può appartenere a più aziende.
- **Registrazione chiusa.** Riceve un collegamento solo chi ha già un account, un invito valido o è il primo amministratore (`BOOTSTRAP_ADMIN_EMAIL`, finché non esiste un admin). La risposta è la stessa in ogni caso: non si rivela chi ha un account. Al primo accesso gli inviti validi si accettano da soli.
- **Inviti**: token casuale nel collegamento, nel database solo l'impronta SHA-256; scadenza 7 giorni; un nuovo invito alla stessa persona sostituisce il vecchio. L'amministratore invita qualsiasi ruolo; il titolare solo agronomo, collaboratore e ospite.
- **Tecnici e amministratori** non appartengono a un'azienda: l'account lo crea l'amministratore dalla console.
- **Chiave della centralina**: generata alla registrazione in laboratorio, mostrata una sola volta (con il file di programmazione), poi solo rigenerabile dall'amministratore. L'IMEI si controlla con la cifra di Luhn.
- **Posta di sviluppo**: con `MAILER=dev` le email finiscono nella tabella `dev_outbox` (console › Posta di prova, oppure `pnpm --filter @vinai/server posta`).
- **Registro delle azioni** (`audit_log`) per ogni operazione della console e per gli inviti accettati.

## Conseguenze

Le tabelle di Better Auth sono nella migrazione 0002, generata con `server/src/auth/gen-sql.ts`: ad ogni aggiornamento di Better Auth va rigenerata e confrontata. I permessi per azienda si controllano nel nostro codice (`server/src/api/guards.ts`), coperti dai test dell'api. Il plugin organization resta un'opzione se un giorno servissero team o permessi più fini.
