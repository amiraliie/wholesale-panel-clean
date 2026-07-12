import { z } from 'zod';
export const createServerSchema = z.object({
  name: z.string().min(2), host: z.string().min(2), port: z.coerce.number().int().min(1).max(65535),
  basePath: z.string().default('/'), username: z.string().min(1), password: z.string().min(1),
  location: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional(),
  subscriptionUrl: z.string().url().optional().or(z.literal(''))
});
