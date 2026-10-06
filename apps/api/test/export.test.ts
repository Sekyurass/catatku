import { beforeAll, describe, expect, it } from 'vitest';
import { csvCell } from '../src/lib/csv';
import { authed, createWallet, registerUser, type TestUser } from './helpers';

let user: TestUser;

/** Isi CSV tanpa BOM, dipisah per baris. */
async function exportLines(u: TestUser, query: Record<string, string> = {}) {
  const res = await authed(u)
    .get('/api/v1/export/transactions.csv')
    .query(query)
    .buffer(true)
    .parse((r, cb) => {
      let data = '';
      r.setEncoding('utf8');
      r.on('data', (chunk: string) => (data += chunk));
      r.on('end', () => cb(null, data));
    });
  const text = res.body as string;
  return {
    res,
    text,
    lines: text
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n'),
  };
}

beforeAll(async () => {
  user = await registerUser();
  const cash = await createWallet(user, { name: 'Tunai' });
  const bank = await createWallet(user, { name: 'BCA', type: 'BANK', initialBalance: 1_000_000 });
  const post = (body: Record<string, unknown>) =>
    authed(user).post('/api/v1/transactions').send(body).expect(201);
  await post({
    type: 'EXPENSE',
    amount: 25_000,
    walletId: cash.id,
    categoryId: 'cat_makan',
    date: '2026-09-03',
    note: 'Nasi "padang", pedas',
  });
  await post({
    type: 'INCOME',
    amount: 5_000_000,
    walletId: bank.id,
    categoryId: 'cat_gaji',
    date: '2026-09-25',
    note: '=HYPERLINK("http://jahat")',
  });
  await authed(user)
    .post('/api/v1/transactions/transfer')
    .send({ fromWalletId: bank.id, toWalletId: cash.id, amount: 200_000, date: '2026-10-01' })
    .expect(201);
});

describe('GET /export/transactions.csv', () => {
  it('mengunduh CSV UTF-8 ber-BOM sebagai lampiran', async () => {
    const { res, text, lines } = await exportLines(user);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="catatku-transaksi-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(lines[0]).toBe('Tanggal,Jenis,Kategori,Dompet,Dompet lawan,Jumlah,Catatan');
    // 1 pengeluaran + 1 pemasukan + 2 sisi transfer, urut terbaru dulu.
    expect(lines).toHaveLength(5);
  });

  it('jumlah bertanda, transfer menyebut dompet lawan, teks di-escape', async () => {
    const { lines } = await exportLines(user);
    expect(lines).toContain('2026-10-01,Transfer keluar,,BCA,Tunai,-200000,');
    expect(lines).toContain('2026-10-01,Transfer masuk,,Tunai,BCA,200000,');
    expect(lines).toContain('2026-09-03,Pengeluaran,Makan,Tunai,,-25000,"Nasi ""padang"", pedas"');
    // Formula dinetralkan dengan awalan kutip satu.
    expect(lines).toContain(
      `2026-09-25,Pemasukan,Gaji,BCA,,5000000,"'=HYPERLINK(""http://jahat"")"`,
    );
  });

  it('mengikuti filter yang sama dengan riwayat', async () => {
    const { lines } = await exportLines(user, { type: 'EXPENSE' });
    expect(lines).toHaveLength(2);
    const ranged = await exportLines(user, { from: '2026-09-20', to: '2026-09-30' });
    expect(ranged.lines.slice(1).every((l) => l.startsWith('2026-09-25'))).toBe(true);
  });

  it('menolak rentang tanggal terbalik', async () => {
    const res = await authed(user)
      .get('/api/v1/export/transactions.csv')
      .query({ from: '2026-10-01', to: '2026-09-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.to).toBeDefined();
  });

  it('pengguna lain hanya mendapat header tanpa data', async () => {
    const stranger = await registerUser();
    const { lines } = await exportLines(stranger);
    expect(lines).toEqual(['Tanggal,Jenis,Kategori,Dompet,Dompet lawan,Jumlah,Catatan']);
  });

  it('wajib login', async () => {
    const res = await authed({ ...user, token: 'bukan-token' }).get(
      '/api/v1/export/transactions.csv',
    );
    expect(res.status).toBe(401);
  });
});

describe('csvCell', () => {
  it.each([
    ['biasa', 'biasa'],
    ['a,b', '"a,b"'],
    ['baris\nbaru', '"baris\nbaru"'],
    ['+62812', "'+62812"],
    ['-diskon', "'-diskon"],
    ['@sum', "'@sum"],
  ])('%j → %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('angka negatif tidak diberi awalan', () => {
    expect(csvCell(-25_000)).toBe('-25000');
  });
});
