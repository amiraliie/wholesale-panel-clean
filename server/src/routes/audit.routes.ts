import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { listAuditLogs } from '../services/audit.service.js';

export const auditRoutes = Router();

auditRoutes.use(authMiddleware, requireRole('super_admin', 'admin'));

auditRoutes.get('/', asyncHandler(async (req, res) => {
  const logs = await listAuditLogs({
    search: req.query.search as string | undefined,
    action: req.query.action as string | undefined,
    entityType: req.query.entityType as string | undefined,
    userId: req.query.userId as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    limit: req.query.limit as string | undefined,
  });

  res.json({ ok: true, data: logs });
}));
