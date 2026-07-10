import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { createOrderSchema } from '../validators/order.schema.js';
import { createConfig, listOrders } from '../services/order.service.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../middleware/error.middleware.js';

export const ordersRoutes = Router();
ordersRoutes.use(authMiddleware);
ordersRoutes.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerId = req.user?.role === 'wholesale' ? req.user.wholesaleCustomerId : undefined;
  res.json({ ok: true, data: await listOrders(customerId || undefined) });
}));
ordersRoutes.post('/', requireRole('wholesale'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.user?.wholesaleCustomerId) throw new AppError(400, 'حساب عمده‌فروش یافت نشد', 'CUSTOMER_REQUIRED');
  const input = createOrderSchema.parse(req.body);
  res.status(201).json({ ok: true, data: await createConfig(req.user.wholesaleCustomerId, input) });
}));
