import { describe, expect, it } from 'vitest';
import { formatNotificationTime } from './notifications';

const NOW = new Date('2026-10-07T12:00:00+07:00').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('formatNotificationTime', () => {
  it('waktu relatif untuk notifikasi baru', () => {
    expect(formatNotificationTime(ago(20_000), NOW)).toBe('Baru saja');
    expect(formatNotificationTime(ago(5 * 60_000), NOW)).toBe('5 menit yang lalu');
    expect(formatNotificationTime(ago(3 * 3_600_000), NOW)).toBe('3 jam yang lalu');
    expect(formatNotificationTime(ago(26 * 3_600_000), NOW)).toBe('kemarin');
    expect(formatNotificationTime(ago(3 * 86_400_000), NOW)).toBe('3 hari yang lalu');
  });

  it('tanggal pendek setelah seminggu', () => {
    expect(formatNotificationTime(ago(10 * 86_400_000), NOW)).toBe('27 Sep');
  });
});
