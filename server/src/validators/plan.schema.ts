import { z } from 'zod';

export const createPlanSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  trafficGB: z.coerce.number().int().positive(),
  durationDays: z.coerce.number().int().positive(),
  basePrice: z.coerce.number().int().min(0),
  pricePerGB: z.coerce.number().int().min(0),
  ipLimit: z.coerce.number().int().min(0).default(1),
  isActive: z.boolean().optional(),
});

export const updatePlanSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  trafficGB: z.coerce.number().int().positive().optional(),
  durationDays: z.coerce.number().int().positive().optional(),
  basePrice: z.coerce.number().int().min(0).optional(),
  pricePerGB: z.coerce.number().int().min(0).optional(),
  ipLimit: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const planStatusSchema = z.object({
  isActive: z.boolean(),
});
