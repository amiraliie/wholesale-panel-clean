import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { listEndUsers } from '../services/order.service.js';
import {
  deleteEndUser,
  renewEndUser,
  setEndUserPayment,
  updateEndUser,
} from '../services/end-user.service.js';
import { AppError } from '../middleware/error.middleware.js';
import type { AuthenticatedRequest } from '../types/index.js';

export const endUsersRoutes = Router();

endUsersRoutes.use(authMiddleware);

function getCustomerId(req: AuthenticatedRequest) {
  if (req.user?.role !== 'wholesale' || !req.user.wholesaleCustomerId) {
    throw new AppError(403, 'این عملیات فقط برای مشتری عمده مجاز است', 'FORBIDDEN');
  }

  return req.user.wholesaleCustomerId;
}

const renewSchema = z.object({
  planId: z.string().uuid().optional(),
  customDays: z.coerce.number().int().min(0).max(3650).optional(),
  customGB: z.coerce.number().min(0).max(100000).optional(),
}).refine((value) => {
  if (value.planId) return true;
  return Number(value.customDays || 0) > 0 || Number(value.customGB || 0) > 0;
}, {
  message: 'برای تمدید باید پلن یا روز/حجم دلخواه وارد شود',
});

const updateSchema = z.object({
  addDays: z.coerce.number().int().min(0).max(3650).optional(),
  addTrafficGB: z.coerce.number().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

const paymentSchema = z.object({
  paid: z.boolean(),
  note: z.string().max(500).optional(),
});

endUsersRoutes.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerId = req.user?.role === 'wholesale' ? req.user.wholesaleCustomerId : undefined;
  res.json({ ok: true, data: await listEndUsers(customerId || undefined) });
}));

endUsersRoutes.post('/:id/renew', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerId = getCustomerId(req);
  const input = renewSchema.parse(req.body);
  const result = await renewEndUser(customerId, String(req.params.id), input);
  res.json({ ok: true, data: result });
}));

endUsersRoutes.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerId = getCustomerId(req);
  const input = updateSchema.parse(req.body);
  const result = await updateEndUser(customerId, String(req.params.id), input);
  res.json({ ok: true, data: result });
}));

endUsersRoutes.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerId = getCustomerId(req);
  const result = await deleteEndUser(customerId, String(req.params.id));
  res.json({ ok: true, data: result });
}));

endUsersRoutes.patch('/:id/payment', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const customerId = getCustomerId(req);
  const input = paymentSchema.parse(req.body);
  const result = await setEndUserPayment(customerId, String(req.params.id), input);
  res.json({ ok: true, data: result });
}));
