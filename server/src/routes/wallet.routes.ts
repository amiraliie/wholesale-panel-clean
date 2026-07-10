import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { creditWallet, getWallet, listWalletTransactions } from '../services/wallet.service.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../middleware/error.middleware.js';

export const walletRoutes = Router();

walletRoutes.use(authMiddleware);

walletRoutes.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.user?.wholesaleCustomerId) {
    throw new AppError(400, 'حساب عمده‌فروش یافت نشد', 'CUSTOMER_REQUIRED');
  }

  res.json({ ok: true, data: await getWallet(req.user.wholesaleCustomerId) });
}));

walletRoutes.get('/transactions', asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.user?.wholesaleCustomerId) {
    throw new AppError(400, 'حساب عمده‌فروش یافت نشد', 'CUSTOMER_REQUIRED');
  }

  res.json({ ok: true, data: await listWalletTransactions(req.user.wholesaleCustomerId) });
}));

walletRoutes.post('/customers/:customerId/credit', requireRole('super_admin', 'admin'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const input = z.object({
    amount: z.coerce.number().int().positive(),
    description: z.string().min(1).default('شارژ کیف پول'),
  }).parse(req.body);

  res.json({
    ok: true,
    data: await creditWallet(String(req.params.customerId), input.amount, input.description, req.user!.id),
  });
}));
