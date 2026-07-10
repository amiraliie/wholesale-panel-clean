import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { env, isProduction } from './config/env.js';
import { simpleRateLimit } from './middleware/rate-limit.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { customersRoutes } from './routes/customers.routes.js';
import { walletRoutes } from './routes/wallet.routes.js';
import { plansRoutes } from './routes/plans.routes.js';
import { pricingRoutes } from './routes/pricing.routes.js';
import { serversRoutes } from './routes/servers.routes.js';
import { inboundsRoutes } from './routes/inbounds.routes.js';
import { ordersRoutes } from './routes/orders.routes.js';
import { endUsersRoutes } from './routes/end-users.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { subscriptionRoutes } from './routes/subscription.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { backupRoutes } from './routes/backup.routes.js';


function getVersionInfo() {
  const candidates = [
    resolve(process.cwd(), 'version.json'),
    resolve(process.cwd(), '..', 'version.json'),
    '/opt/wholesale-panel/version.json',
  ];

  for (const file of candidates) {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      // Try next candidate.
    }
  }

  return {
    version: process.env.APP_VERSION || 'development',
    branch: process.env.APP_BRANCH || 'unknown',
    commit: process.env.APP_COMMIT || 'unknown',
    builtAt: process.env.APP_BUILT_AT || null
  };
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(express.json({ limit: '1mb' }));
  app.use(simpleRateLimit(isProduction ? 300 : 2000));

  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'ok', time: new Date().toISOString(), app: getVersionInfo() } }));
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/plans', plansRoutes);
  app.use('/api/pricing', pricingRoutes);
  app.use('/api/servers', serversRoutes);
  app.use('/api/inbounds', inboundsRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/end-users', endUsersRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/admin/backup', backupRoutes);
  app.use('/sub', subscriptionRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
