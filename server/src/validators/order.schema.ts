import { z } from 'zod';
export const createOrderSchema = z.object({
  planId: z.string().uuid(), serverId: z.string().uuid(), inboundId: z.string().uuid(),
  email: z.string().email().or(z.string().min(3).max(100)), idempotencyKey: z.string().optional()
});
