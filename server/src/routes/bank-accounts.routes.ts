import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import type { AuthenticatedRequest } from '../types/index.js';
import {
  archiveBankAccount,
  createBankAccount,
  listBankAccounts,
  updateBankAccount,
} from '../services/wallet-topup.service.js';

export const bankAccountsRoutes = Router();

bankAccountsRoutes.use(authMiddleware);

const bankAccountFields = z.object({
  bankName: z.string().trim().min(2).max(100),
  ownerName: z.string().trim().min(2).max(150),
  cardNumber: z.string().trim().max(32).optional().nullable(),
  accountNumber: z.string().trim().max(64).optional().nullable(),
  iban: z.string().trim().max(34).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});

const createBankAccountSchema = bankAccountFields.refine(
  (value) => value.cardNumber || value.accountNumber || value.iban,
  {
    message: 'حداقل شماره کارت، شماره حساب یا شبا الزامی است',
  },
);

const updateBankAccountSchema = bankAccountFields.partial();

bankAccountsRoutes.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';

  res.json({
    ok: true,
    data: await listBankAccounts(isAdmin),
  });
}));

bankAccountsRoutes.post(
  '/',
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = createBankAccountSchema.parse(req.body);

    res.status(201).json({
      ok: true,
      data: await createBankAccount(input, req.user!.id),
    });
  }),
);

bankAccountsRoutes.patch(
  '/:id',
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = updateBankAccountSchema.parse(req.body);

    res.json({
      ok: true,
      data: await updateBankAccount(
        String(req.params.id),
        input,
        req.user!.id,
      ),
    });
  }),
);

bankAccountsRoutes.delete(
  '/:id',
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({
      ok: true,
      data: await archiveBankAccount(
        String(req.params.id),
        req.user!.id,
      ),
    });
  }),
);
