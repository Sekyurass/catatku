import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

config({ quiet: true });
const testUrl = process.env.TEST_DATABASE_URL ?? '';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testUrl,
      DIRECT_URL: testUrl,
      JWT_ACCESS_SECRET: 'test-secret-yang-panjangnya-lebih-dari-32-karakter',
      BCRYPT_COST: '4',
      AUTH_RATE_LIMIT: '1000',
      FEATURE_FLAGS_FORCE: '',
    },
  },
});
