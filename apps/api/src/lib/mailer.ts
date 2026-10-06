import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Pesan yang "terkirim" selama tes, untuk diperiksa isinya. */
export const testOutbox: MailMessage[] = [];

function createMailer(): Mailer {
  if (env.isTest) {
    return {
      send: async (message) => {
        testOutbox.push(message);
      },
    };
  }

  if (env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
    });
    return {
      send: async (message) => {
        await transport.sendMail({ from: env.MAIL_FROM, ...message });
      },
    };
  }

  // Isi email bisa berisi tautan rahasia; hanya boleh tampil di log mesin pengembang.
  if (env.isProd) {
    return {
      send: async ({ subject }) => {
        logger.error({ subject }, 'SMTP belum dikonfigurasi; email tidak terkirim');
      },
    };
  }
  return {
    send: async ({ to, subject, text }) => {
      logger.info({ to, subject }, `Email (dev, tidak dikirim):\n${text}`);
    },
  };
}

export const mailer: Mailer = createMailer();
