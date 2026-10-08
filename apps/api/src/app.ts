import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { installTimeZoneResolver } from './lib/userZone';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createV1Router, type V1Options } from './routes/v1';

export function createApp(opts: V1Options = {}) {
  installTimeZoneResolver();
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  // Impor CSV mengirim isi file utuh (maks. 1 MB, membengkak saat di-escape JSON).
  app.use('/api/v1/imports', express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok', uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/api/v1', createV1Router(opts));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
