import { z } from 'zod';

const emailSchema = z
  .string({ error: 'Email wajib diisi' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email tidak valid' }));

const nameSchema = z
  .string({ error: 'Nama wajib diisi' })
  .trim()
  .min(1, { error: 'Nama wajib diisi' })
  .max(60, { error: 'Nama maksimal 60 karakter' });

const newPasswordSchema = z
  .string({ error: 'Kata sandi wajib diisi' })
  .min(8, { error: 'Kata sandi minimal 8 karakter' })
  .max(72, { error: 'Kata sandi maksimal 72 karakter' });

const currentPasswordSchema = z
  .string({ error: 'Kata sandi saat ini wajib diisi' })
  .min(1, { error: 'Kata sandi saat ini wajib diisi' });

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: newPasswordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Kata sandi wajib diisi' })
    .min(1, { error: 'Kata sandi wajib diisi' }),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** `currentPassword` wajib bila email berubah; dicek di server karena butuh email lama. */
export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  currentPassword: z.string().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema,
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    error: 'Kata sandi baru harus berbeda dari yang lama',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
