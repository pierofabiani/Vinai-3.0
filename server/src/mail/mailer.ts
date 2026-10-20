// Invio delle email transazionali (accesso, inviti).
// In sviluppo e in prova le email non partono: finiscono nella tabella dev_outbox, leggibili
// dalla console (Posta). In produzione si usa un server SMTP (SMTP_URL).
import nodemailer from "nodemailer";
import type { Sql } from "../lib/db.js";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** collegamento principale, mostrato a parte nella posta di sviluppo */
  link?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export function devMailer(sql: Sql, log: (m: string) => void = console.log): Mailer {
  return {
    async send(mail) {
      await sql`INSERT INTO dev_outbox (recipient, subject, body, link)
                VALUES (${mail.to.toLowerCase()}, ${mail.subject}, ${mail.text}, ${mail.link ?? null})`;
      log(`[posta] a ${mail.to}: ${mail.subject}${mail.link ? ` → ${mail.link}` : ""}`);
    },
  };
}

export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async send(mail) {
      await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
    },
  };
}
