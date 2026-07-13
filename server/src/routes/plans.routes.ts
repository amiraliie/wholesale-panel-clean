import { Router } from 'express';

import { authMiddleware } from
  '../middleware/auth.middleware.js';

import { requireRole } from
  '../middleware/rbac.middleware.js';

import { asyncHandler } from
  '../utils/async-handler.js';

import {
  createPlanSchema,
  planAccessPreviewSchema,
  planStatusSchema,
  updatePlanSchema,
} from '../validators/plan.schema.js';

import {
  createPlan,
  deletePlan,
  listAvailablePlans,
  listPlans,
  previewPlanAccess,
  setPlanStatus,
  updatePlan,
} from '../services/pricing.service.js';

import type {
  AuthenticatedRequest,
} from '../types/index.js';

import { AppError } from
  '../middleware/error.middleware.js';

export const plansRoutes = Router();

plansRoutes.use(authMiddleware);

plansRoutes.get(
  '/',
  asyncHandler(
    async (
      req: AuthenticatedRequest,
      res,
    ) => {
      if (
        req.user?.role === 'wholesale'
      ) {
        const customerId =
          req.user.wholesaleCustomerId;

        if (!customerId) {
          throw new AppError(
            400,
            'حساب عمده‌فروش یافت نشد',
            'CUSTOMER_REQUIRED',
          );
        }

        const pricingMode =
          req.query.pricingMode ===
          'server'
            ? 'server'
            : 'global';

        const serverId =
          typeof req.query.serverId ===
          'string'
            ? req.query.serverId
            : undefined;

        res.json({
          ok: true,
          data:
            await listAvailablePlans(
              customerId,
              {
                serverId,
                pricingMode,
              },
            ),
        });

        return;
      }

      res.json({
        ok: true,
        data: await listPlans(),
      });
    },
  ),
);

plansRoutes.post(
  '/access-preview',
  requireRole(
    'super_admin',
    'admin',
  ),
  asyncHandler(async (req, res) => {
    const input =
      planAccessPreviewSchema.parse(
        req.body,
      );

    res.json({
      ok: true,
      data:
        await previewPlanAccess(input),
    });
  }),
);

plansRoutes.post(
  '/',
  requireRole(
    'super_admin',
    'admin',
  ),
  asyncHandler(async (req, res) => {
    const input =
      createPlanSchema.parse(req.body);

    res.status(201).json({
      ok: true,
      data: await createPlan(input),
    });
  }),
);

plansRoutes.patch(
  '/:id',
  requireRole(
    'super_admin',
    'admin',
  ),
  asyncHandler(async (req, res) => {
    const input =
      updatePlanSchema.parse(req.body);

    res.json({
      ok: true,
      data: await updatePlan(
        String(req.params.id),
        input,
      ),
    });
  }),
);

plansRoutes.patch(
  '/:id/status',
  requireRole(
    'super_admin',
    'admin',
  ),
  asyncHandler(async (req, res) => {
    const input =
      planStatusSchema.parse(req.body);

    res.json({
      ok: true,
      data: await setPlanStatus(
        String(req.params.id),
        input.isActive,
      ),
    });
  }),
);

plansRoutes.delete(
  '/:id',
  requireRole(
    'super_admin',
    'admin',
  ),
  asyncHandler(async (req, res) => {
    res.json({
      ok: true,
      data: await deletePlan(
        String(req.params.id),
      ),
    });
  }),
);
