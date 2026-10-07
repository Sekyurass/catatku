import type { CategoryDTO, WalletDTO } from '@catatku/shared';
import { describe, expect, it } from 'vitest';
import { toSampleValues } from './quickTextSample';

const wallets = [
  { id: 'w1', name: 'Tunai', type: 'CASH' },
  { id: 'w2', name: 'BCA', type: 'BANK' },
] as WalletDTO[];
const categories = [{ id: 'c1', name: 'Makan', type: 'EXPENSE' }] as CategoryDTO[];
const ctx = { today: '2026-10-08', wallets, categories };

describe('toSampleValues', () => {
  it('memakai nama, bukan id, dan tanggal relatif', () => {
    expect(
      toSampleValues(
        {
          type: 'EXPENSE',
          amount: 25_000,
          date: '2026-10-07',
          walletId: 'w2',
          toWalletId: 'w1',
          categoryId: 'c1',
          note: ' Makan siang ',
        },
        ctx,
      ),
    ).toEqual({
      type: 'EXPENSE',
      amount: 25_000,
      dateOffset: -1,
      wallet: { name: 'BCA', type: 'BANK' },
      toWallet: null,
      category: 'Makan',
      note: 'Makan siang',
    });
  });

  it('transfer: tanpa kategori; isian kosong jadi null; lintas bulan', () => {
    expect(
      toSampleValues(
        {
          type: 'TRANSFER',
          amount: null,
          date: '2026-09-30',
          walletId: 'w1',
          toWalletId: '',
          categoryId: 'c1',
          note: '',
        },
        ctx,
      ),
    ).toMatchObject({ amount: null, dateOffset: -8, toWallet: null, category: null });
  });
});
