import bcrypt from 'bcryptjs';
import { env } from '../config/env';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: string | null = null;

/** Dipakai saat email tidak ditemukan agar waktu respons login tetap setara. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await bcrypt.hash('catatku-dummy-password', env.BCRYPT_COST);
  await bcrypt.compare(password, dummyHash);
}
