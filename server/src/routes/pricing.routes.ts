import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  calculatePrice,
  deleteCustomerPrice,
  listCustomerPrices,
  upsertCustomerPrice,
} from '../services/pricing.service.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../middleware/error.middleware.js';
import { upsertCustomerPriceSchema } from '../validators/pricing.schema.js';

export const pricingRoutes = Router();

pricingRoutes.use(authMiddleware);

pricingRoutes.get('/plans/:planId/calculate', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const planId = String(req.params.planId);
  const customerId = (req.query.customerId as string) || req.user?.wholesaleCustomerId;

  if (!customerId) {
    throw new AppError(400, 'شناسه مشتری لازم است', 'CUSTOMER_REQUIRED');
  }

  res.json({ ok: true, data: await calculatePrice(planId, customerId) });
}));

pricingRoutes.get('/customers/:customerId', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, data: await listCustomerPrices(String(req.params.customerId)) });
}));

pricingRoutes.put('/customers/:customerId/plans/:planId', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const input = upsertCustomerPriceSchema.parse(req.body);
  res.json({
    ok: true,
    data: await upsertCustomerPrice(
      String(req.params.customerId),
      String(req.params.planId),
      input,
    ),
  });
}));

pricingRoutes.delete('/customers/:customerId/plans/:planId', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    data: await deleteCustomerPrice(
      String(req.params.customerId),
      String(req.params.planId),
    ),
  });
}));
