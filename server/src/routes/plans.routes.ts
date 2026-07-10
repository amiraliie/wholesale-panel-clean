import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  createPlanSchema,
  planStatusSchema,
  updatePlanSchema,
} from '../validators/plan.schema.js';
import {
  createPlan,
  deletePlan,
  listPlans,
  setPlanStatus,
  updatePlan,
} from '../services/pricing.service.js';

export const plansRoutes = Router();

plansRoutes.use(authMiddleware);

plansRoutes.get('/', asyncHandler(async (_req, res) => {
  res.json({ ok: true, data: await listPlans() });
}));

plansRoutes.post('/', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const input = createPlanSchema.parse(req.body);
  res.status(201).json({ ok: true, data: await createPlan(input) });
}));

plansRoutes.patch('/:id', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const input = updatePlanSchema.parse(req.body);
  res.json({ ok: true, data: await updatePlan(String(req.params.id), input) });
}));

plansRoutes.patch('/:id/status', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const input = planStatusSchema.parse(req.body);
  res.json({ ok: true, data: await setPlanStatus(String(req.params.id), input.isActive) });
}));

plansRoutes.delete('/:id', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await deletePlan(String(req.params.id)) });
}));
