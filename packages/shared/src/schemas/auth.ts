import { z } from 'zod';

const emailSchema = z
  .string({ error: 'Email wajib diisi' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email tidak valid' }));

export const registerSchema = z.object({
  name: z
    .string({ error: 'Nama wajib diisi' })
    .trim()
    .min(1, { error: 'Nama wajib diisi' })
    .max(60, { error: 'Nama maksimal 60 karakter' }),
  email: emailSchema,
  password: z
    .string({ error: 'Kata sandi wajib diisi' })
    .min(8, { error: 'Kata sandi minimal 8 karakter' })
    .max(72, { error: 'Kata sandi maksimal 72 karakter' }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Kata sandi wajib diisi' })
    .min(1, { error: 'Kata sandi wajib diisi' }),
});
export type LoginInput = z.infer<typeof loginSchema>;
