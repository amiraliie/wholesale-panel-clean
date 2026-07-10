import { Router, raw } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../middleware/error.middleware.js';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);

export const backupRoutes = Router();

backupRoutes.use(authMiddleware, requireRole('super_admin'));

backupRoutes.get('/download', asyncHandler(async (_req, res) => {
  const fileName = `wholesale-panel-${new Date().toISOString().replace(/[:.]/g, '-')}.backup`;
  const tmpFile = path.join(os.tmpdir(), fileName);

  await execFileAsync('pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--dbname',
    env.DATABASE_URL,
    '--file',
    tmpFile,
  ]);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  res.download(tmpFile, fileName, async () => {
    await fs.rm(tmpFile, { force: true });
  });
}));

backupRoutes.post('/restore', raw({ type: 'application/octet-stream', limit: '512mb' }), asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError(400, 'فایل بکاپ معتبر نیست', 'INVALID_BACKUP_FILE');
  }

  const tmpFile = path.join(os.tmpdir(), `wholesale-panel-restore-${Date.now()}.backup`);
  await fs.writeFile(tmpFile, req.body);

  try {
    await execFileAsync('pg_restore', ['--list', tmpFile]);

    await execFileAsync('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--dbname',
      env.DATABASE_URL,
      tmpFile,
    ]);

    res.json({ ok: true, data: { restored: true } });
  } finally {
    await fs.rm(tmpFile, { force: true });
  }
}));
