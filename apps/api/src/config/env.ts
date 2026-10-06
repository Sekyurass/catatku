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
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.BCRYPT_COST >= 12, {
    message: 'BCRYPT_COST harus >= 12 di production',
    path: ['BCRYPT_COST'],
  });

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
