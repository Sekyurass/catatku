import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import {
  dbErrorCode,
  RETRYABLE_OPERATIONS,
  withConnectionDefaults,
  withDbRetry,
} from './dbConnection';
import { logger } from './logger';

function createClient() {
  return new PrismaClient({
    datasourceUrl: withConnectionDefaults(env.DATABASE_URL),
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        if (!RETRYABLE_OPERATIONS.has(operation)) return query(args);
        return withDbRetry(
          () => query(args),
          (err, attempt) =>
            logger.warn(
              { code: dbErrorCode(err), model, operation, attempt },
              'Koneksi database gagal, mencoba lagi',
            ),
        );
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (!env.isProd) globalForPrisma.prisma = prisma;
