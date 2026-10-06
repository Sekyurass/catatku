import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { currentMonth, shiftMonth, toDateString } from '@catatku/shared';
import { type Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedDefaults } from '../src/db/defaults';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@catatku.id';
const DEMO_PASSWORD = 'demo12345';

/** PRNG deterministik agar data demo sama setiap seed. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

async function seedDemo() {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: 'Dina',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
    },
  });

  const [tunai, bca, gopay] = await Promise.all([
    prisma.wallet.create({
      data: {
        userId: user.id,
        name: 'Tunai',
        type: 'CASH',
        initialBalance: 300_000n,
        color: '#16A34A',
      },
    }),
    prisma.wallet.create({
      data: {
        userId: user.id,
        name: 'BCA',
        type: 'BANK',
        initialBalance: 2_500_000n,
        color: '#2563EB',
      },
    }),
    prisma.wallet.create({
      data: {
        userId: user.id,
        name: 'GoPay',
        type: 'EWALLET',
        initialBalance: 150_000n,
        color: '#0EA5E9',
      },
    }),
  ]);
  const kopi = await prisma.category.create({
    data: { userId: user.id, name: 'Kopi', type: 'EXPENSE', icon: 'coffee', color: '#92400E' },
  });

  const rand = rng(42);
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)]!;
  const between = (min: number, max: number, step = 1000) =>
    Math.round((min + rand() * (max - min)) / step) * step;

  const rows: Prisma.TransactionCreateManyInput[] = [];
  const add = (
    walletId: string,
    type: 'INCOME' | 'EXPENSE',
    categoryId: string,
    amount: number,
    date: string,
    note?: string,
  ) =>
    rows.push({
      userId: user.id,
      walletId,
      categoryId,
      type,
      amount: BigInt(type === 'EXPENSE' ? -amount : amount),
      date: dbDate(date),
      note: note || null,
    });
  const transfer = (fromId: string, toId: string, amount: number, date: string, note: string) => {
    const transferGroupId = randomUUID();
    const base = {
      userId: user.id,
      type: 'TRANSFER' as const,
      date: dbDate(date),
      note,
      transferGroupId,
    };
    rows.push({ ...base, walletId: fromId, amount: BigInt(-amount) });
    rows.push({ ...base, walletId: toId, amount: BigInt(amount) });
  };

  const today = toDateString();
  const thisMonth = currentMonth();
  const startMonth = shiftMonth(thisMonth, -5);
  let date = `${startMonth}-01`;

  while (date <= today) {
    const day = Number(date.slice(8));
    if (day === 25) add(bca.id, 'INCOME', 'cat_gaji', 5_000_000, date, 'Gaji bulanan');
    if (day === 1) add(bca.id, 'EXPENSE', 'cat_tagihan', 1_200_000, date, 'Bayar kos');
    if (day === 5)
      add(bca.id, 'EXPENSE', 'cat_tagihan', between(150_000, 250_000), date, 'Listrik');
    if (day === 7) add(gopay.id, 'EXPENSE', 'cat_tagihan', 100_000, date, 'Pulsa & data');
    if (day === 2 || day === 16) transfer(bca.id, tunai.id, 500_000, date, 'Tarik tunai');
    if ([3, 10, 18, 26].includes(day)) transfer(bca.id, gopay.id, 250_000, date, 'Top up GoPay');

    const meals = rand() < 0.85 ? (rand() < 0.4 ? 2 : 1) : 0;
    for (let i = 0; i < meals; i++) {
      add(
        pick([tunai.id, gopay.id]),
        'EXPENSE',
        'cat_makan',
        between(12_000, 45_000),
        date,
        pick(['Makan siang warteg', 'Nasi padang', 'GoFood', 'Bakso', 'Makan malam', '']),
      );
    }
    if (rand() < 0.35)
      add(
        pick([gopay.id, tunai.id]),
        'EXPENSE',
        'cat_transport',
        between(8_000, 35_000),
        date,
        pick(['Gojek', 'Grab', 'KRL', 'Bensin']),
      );
    if (rand() < 0.2) add(gopay.id, 'EXPENSE', kopi.id, between(18_000, 38_000), date, 'Kopi susu');
    if (rand() < 0.08)
      add(
        bca.id,
        'EXPENSE',
        'cat_belanja',
        between(50_000, 300_000),
        date,
        pick(['Indomaret', 'Shopee', 'Tokopedia']),
      );
    if (rand() < 0.05)
      add(
        bca.id,
        'EXPENSE',
        'cat_hiburan',
        between(40_000, 120_000),
        date,
        pick(['Bioskop', 'Langganan musik', 'Nonton konser']),
      );
    if (rand() < 0.02)
      add(tunai.id, 'EXPENSE', 'cat_kesehatan', between(25_000, 150_000), date, 'Apotek');
    if (day === 10 && rand() < 0.5)
      add(bca.id, 'EXPENSE', 'cat_pendidikan', between(80_000, 200_000), date, 'Buku & kursus');
    if (day === 20 && rand() < 0.3)
      add(bca.id, 'INCOME', 'cat_lainnya_masuk', between(150_000, 500_000), date, 'Freelance');

    date = addDays(date, 1);
  }

  await prisma.transaction.createMany({ data: rows });

  const budgets: Array<[string, number]> = [
    ['cat_makan', 1_500_000],
    ['cat_transport', 400_000],
    ['cat_belanja', 500_000],
    ['cat_hiburan', 200_000],
    ['cat_tagihan', 1_600_000],
    [kopi.id, 250_000],
  ];
  await prisma.budget.createMany({
    data: budgets.flatMap(([categoryId, limit]) =>
      [thisMonth, shiftMonth(thisMonth, -1)].map((month) => ({
        userId: user.id,
        categoryId,
        month,
        limitAmount: BigInt(limit),
      })),
    ),
  });

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD, transactions: rows.length };
}

async function main() {
  await seedDefaults(prisma);
  console.log('✔ Kategori default & feature flag');
  if (process.env.SEED_DEMO !== 'false') {
    const demo = await seedDemo();
    console.log(`✔ Akun demo: ${demo.email} / ${demo.password} (${demo.transactions} transaksi)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
