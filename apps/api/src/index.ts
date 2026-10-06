import { createApp } from './app';
import { env } from './config/env';
import { startScheduler } from './jobs/scheduler';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const server = createApp().listen(env.PORT, () => {
  logger.info(`Catatku API berjalan di http://localhost:${env.PORT}`);
});
const stopScheduler = startScheduler();

function shutdown(signal: string) {
  logger.info({ signal }, 'Mematikan server');
  stopScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
