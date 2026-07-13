import { z } from 'zod';

export const planScopeSchema =
  z.enum(['global', 'server']);

const offerFields = {
  serverId: z.string().uuid().optional(),

  flatPrice: z.coerce
    .number()
    .int()
    .min(0)
    .nullable()
    .optional(),

  offerPricePerGB: z.coerce
    .number()
    .int()
    .min(0)
    .nullable()
    .optional(),

  trafficGBOverride: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),

  durationDaysOverride: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),

  ipLimitOverride: z.coerce
    .number()
    .int()
    .min(0)
    .nullable()
    .optional(),

  isOfferActive: z.boolean().optional(),

  availableFrom: z.string()
    .datetime()
    .nullable()
    .optional(),

  availableUntil: z.string()
    .datetime()
    .nullable()
    .optional(),

  allowedInboundIds: z
    .array(z.string().uuid())
    .max(100)
    .optional(),
};

export const createPlanSchema = z.object({
  name: z.string().min(2).max(255),

  description: z.string()
    .max(2000)
    .optional(),

  trafficGB: z.coerce
    .number()
    .int()
    .positive(),

  durationDays: z.coerce
    .number()
    .int()
    .positive(),

  basePrice: z.coerce
    .number()
    .int()
    .min(0),

  pricePerGB: z.coerce
    .number()
    .int()
    .min(0),

  ipLimit: z.coerce
    .number()
    .int()
    .min(0)
    .default(1),

  scope: planScopeSchema.default('global'),

  isActive: z.boolean().optional(),

  ...offerFields,
}).superRefine((value, ctx) => {
  if (
    value.scope === 'server' &&
    !value.serverId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serverId'],
      message:
        'برای پلن اختصاصی باید سرور انتخاب شود',
    });
  }

  if (
    value.scope === 'global' &&
    value.serverId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serverId'],
      message:
        'پلن عمومی نباید سرور اختصاصی داشته باشد',
    });
  }
});

export const updatePlanSchema = z.object({
  name: z.string()
    .min(2)
    .max(255)
    .optional(),

  description: z.string()
    .max(2000)
    .optional(),

  trafficGB: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  durationDays: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  basePrice: z.coerce
    .number()
    .int()
    .min(0)
    .optional(),

  pricePerGB: z.coerce
    .number()
    .int()
    .min(0)
    .optional(),

  ipLimit: z.coerce
    .number()
    .int()
    .min(0)
    .optional(),

  scope: planScopeSchema.optional(),

  isActive: z.boolean().optional(),

  ...offerFields,
}).strict();

export const planStatusSchema = z.object({
  isActive: z.boolean(),
});

export const planAccessPreviewSchema = z.object({
  planId: z.string().uuid().optional(),

  scope: planScopeSchema,

  serverId: z.string().uuid().optional(),

  allowedInboundIds: z
    .array(z.string().uuid())
    .max(100)
    .optional(),
}).superRefine((value, ctx) => {
  if (
    value.scope === 'server' &&
    !value.serverId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serverId'],
      message:
        'برای پیش‌نمایش پلن اختصاصی، سرور لازم است',
    });
  }
});
