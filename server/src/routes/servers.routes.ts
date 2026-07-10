import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  createServer,
  listServers,
  removeServer,
  syncInbounds,
  testServerConnection,
  updateServer,
} from '../services/server.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export const serversRoutes = Router();

serversRoutes.use(authMiddleware);

serversRoutes.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({ ok: true, data: await listServers(req.user) });
}));

serversRoutes.post('/', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.status(201).json({ ok: true, data: await createServer(req.body) });
}));

serversRoutes.patch('/:id', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await updateServer(String(req.params.id), req.body) });
}));

serversRoutes.post('/:id/test', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await testServerConnection(String(req.params.id)) });
}));

serversRoutes.post('/:id/sync-inbounds', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await syncInbounds(String(req.params.id)) });
}));

serversRoutes.delete('/:id', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await removeServer(String(req.params.id)) });
}));
