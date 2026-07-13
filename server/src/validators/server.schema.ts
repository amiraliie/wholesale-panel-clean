import { z } from 'zod';

export const serverServiceTypeSchema =
  z.enum(['direct', 'tunnel']);

export const createServerSchema = z.object({
  name: z.string().min(2).max(120),
  host: z.string().min(2).max(500),

  port: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535),

  basePath: z.string()
    .min(1)
    .max(200)
    .default('/'),

  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),

  serviceType:
    serverServiceTypeSchema.default('direct'),

  location: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),

  isActive: z.boolean().optional(),

  subscriptionUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal('')),
});
