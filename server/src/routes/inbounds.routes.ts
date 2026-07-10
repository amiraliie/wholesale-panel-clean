import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { listInbounds } from '../services/inbound.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export const inboundsRoutes = Router();

inboundsRoutes.use(authMiddleware);

inboundsRoutes.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({
    ok: true,
    data: await listInbounds(req.query.serverId as string | undefined, req.user),
  });
}));
