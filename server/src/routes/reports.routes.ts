import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { getReportSummary } from '../services/report.service.js';

export const reportsRoutes = Router();

reportsRoutes.use(authMiddleware, requireRole('super_admin', 'admin'));

reportsRoutes.get('/summary', asyncHandler(async (_req, res) => {
  res.json({ ok: true, data: await getReportSummary() });
}));
