import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { seedDefaults } from '../src/db/defaults';

export default async function setup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL belum diisi di apps/api/.env (lihat .env.example).');
  }
  if (url === process.env.DATABASE_URL || url === process.env.DIRECT_URL) {
    throw new Error('TEST_DATABASE_URL tidak boleh sama dengan database dev.');
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await seedDefaults(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
