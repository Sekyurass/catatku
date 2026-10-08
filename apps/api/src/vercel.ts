import { createApp } from './app';

/**
 * Entri Vercel: app Express tanpa listen() dan tanpa node-cron. Job latar dipicu dari luar lewat
 * /api/v1/cron/* (lihat docs/rencana-deploy-vercel.md).
 */
export default createApp();
