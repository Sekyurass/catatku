import {
  correctedFields,
  maskSensitive,
  QUICK_TEXT_SAMPLE_RETENTION_DAYS,
  type QuickTextSampleInput,
  type QuickTextValues,
  toDateString,
} from '@catatku/shared';
import { forbidden } from '../../lib/errors';
import { toDbDate } from '../../lib/money';
import { prisma } from '../../lib/prisma';

const DAY_MS = 86_400_000;

export async function getSharing(userId: string): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { shareQuickText: true },
  });
  return user.shareQuickText;
}

export async function setSharing(userId: string, enabled: boolean): Promise<boolean> {
  await prisma.user.update({ where: { id: userId }, data: { shareQuickText: enabled } });
  return enabled;
}

function maskValues(v: QuickTextValues): QuickTextValues {
  const wallet = (w: QuickTextValues['wallet']) => w && { ...w, name: maskSensitive(w.name) };
  return {
    ...v,
    wallet: wallet(v.wallet),
    toWallet: wallet(v.toWallet),
    category: v.category && maskSensitive(v.category),
    note: maskSensitive(v.note),
  };
}

/**
 * Simpan satu sampel. Tidak menyimpan userId/jam; penyamaran diulang di server karena klien
 * tidak dipercaya. Sampel tanpa koreksi tidak berguna untuk dataset, jadi diabaikan.
 */
export async function addSample(
  userId: string,
  input: QuickTextSampleInput,
  now = new Date(),
): Promise<boolean> {
  if (!(await getSharing(userId))) throw forbidden('Berbagi ketikan cepat belum diaktifkan');
  const parsed = maskValues(input.parsed);
  const final = maskValues(input.final);
  const corrected = correctedFields(parsed, final);
  if (corrected.length === 0) return false;
  await prisma.quickTextSample.create({
    data: {
      text: maskSensitive(input.text),
      parsed,
      final,
      corrected,
      createdOn: toDbDate(toDateString(now)),
      expiresAt: toDbDate(
        toDateString(new Date(now.getTime() + QUICK_TEXT_SAMPLE_RETENTION_DAYS * DAY_MS)),
      ),
    },
  });
  return true;
}

export async function purgeExpiredSamples(now = new Date()): Promise<number> {
  const { count } = await prisma.quickTextSample.deleteMany({
    where: { expiresAt: { lte: toDbDate(toDateString(now)) } },
  });
  return count;
}
