import 'dotenv/config';
import { RESET_LINK_TTL_MINUTES } from '@catatku/shared';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET minimal 32 karakter'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    FEATURE_FLAGS_FORCE: z.string().default(''),
    /** Alamat aplikasi web untuk tautan di email. Default: origin CORS pertama. */
    APP_URL: z.url().optional(),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    MAIL_FROM: z.string().default('Catatku <no-reply@catatku.local>'),
    SCHEDULER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(RESET_LINK_TTL_MINUTES),
    /** Kunci Web Push (`npx web-push generate-vapid-keys`). Kosong = push nonaktif, lonceng tetap jalan. */
    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)/, 'VAPID_SUBJECT harus diawali mailto: atau https://')
      .default('mailto:admin@catatku.local'),
    /**
     * Penyimpanan lampiran (S3-compatible: Supabase Storage, Cloudflare R2, MinIO). Kosong = fitur
     * lampiran nonaktif. Bucket harus privat; berkas hanya dibuka lewat tautan bertanda tangan.
     */
    STORAGE_S3_ENDPOINT: z.union([z.url(), z.literal('')]).default(''),
    STORAGE_S3_REGION: z.string().default('auto'),
    STORAGE_S3_BUCKET: z.string().default(''),
    STORAGE_S3_ACCESS_KEY_ID: z.string().default(''),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().default(''),
    /**
     * Catat dari email bank. Alamat dasar kotak masuk; tiap pengguna mendapat varian +token
     * (mis. catatku.masuk+abc123@gmail.com). Kosong = hanya unggah .eml manual.
     */
    INBOUND_EMAIL_ADDRESS: z.union([z.email(), z.literal('')]).default(''),
    /** Rahasia untuk POST /api/v1/inbound/* (webhook Cloudflare Email Worker, cron pemicu IMAP). */
    INBOUND_EMAIL_SECRET: z
      .string()
      .refine((v) => v === '' || v.length >= 24, 'INBOUND_EMAIL_SECRET minimal 24 karakter')
      .default(''),
    /** Kotak masuk yang dibaca berkala lewat IMAP, mis. Gmail khusus Catatku + app password. */
    INBOUND_IMAP_HOST: z.string().default(''),
    INBOUND_IMAP_PORT: z.coerce.number().int().positive().default(993),
    INBOUND_IMAP_USER: z.string().default(''),
    INBOUND_IMAP_PASS: z.string().default(''),
    /** Server DNS cadangan untuk cek DKIM bila DNS sistem gagal, dipisah koma. */
    DNS_FALLBACK_SERVERS: z.string().default('1.1.1.1,8.8.8.8'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.BCRYPT_COST >= 12, {
    message: 'BCRYPT_COST harus >= 12 di production',
    path: ['BCRYPT_COST'],
  })
  .refine((env) => !env.VAPID_PUBLIC_KEY === !env.VAPID_PRIVATE_KEY, {
    message: 'VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY harus diisi berpasangan',
    path: ['VAPID_PRIVATE_KEY'],
  })
  .refine(
    (env) => {
      const set = [
        env.STORAGE_S3_ENDPOINT,
        env.STORAGE_S3_BUCKET,
        env.STORAGE_S3_ACCESS_KEY_ID,
        env.STORAGE_S3_SECRET_ACCESS_KEY,
      ].filter(Boolean).length;
      return set === 0 || set === 4;
    },
    {
      message:
        'STORAGE_S3_ENDPOINT, STORAGE_S3_BUCKET, STORAGE_S3_ACCESS_KEY_ID, dan STORAGE_S3_SECRET_ACCESS_KEY harus diisi semua (atau kosong semua)',
      path: ['STORAGE_S3_ENDPOINT'],
    },
  )
  .refine(
    (env) => {
      const set = [env.INBOUND_IMAP_HOST, env.INBOUND_IMAP_USER, env.INBOUND_IMAP_PASS].filter(
        Boolean,
      ).length;
      return set === 0 || (set === 3 && env.INBOUND_EMAIL_ADDRESS !== '');
    },
    {
      message:
        'INBOUND_IMAP_HOST, INBOUND_IMAP_USER, dan INBOUND_IMAP_PASS harus diisi semua (atau kosong semua), dan butuh INBOUND_EMAIL_ADDRESS',
      path: ['INBOUND_IMAP_HOST'],
    },
  );

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Konfigurasi environment tidak valid:\n${details}`);
}

const corsOrigins = parsed.data.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const env = {
  ...parsed.data,
  corsOrigins,
  appUrl: (parsed.data.APP_URL ?? corsOrigins[0] ?? 'http://localhost:5173').replace(/\/$/, ''),
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};
export type Env = typeof env;
