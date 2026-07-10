import { z } from 'zod';

const uuidArray = z.array(z.string().uuid()).optional();

export const createCustomerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  minBalance: z.coerce.number().int().min(0).default(0),
  creditLimit: z.coerce.number().int().min(0).default(0),
  dailyOrderLimit: z.coerce.number().int().min(0).default(100),
  monthlyOrderLimit: z.coerce.number().int().min(0).default(3000),
  notes: z.string().optional(),
  allowedServerIds: uuidArray,
  allowedInboundIds: uuidArray,
  allowedPlanIds: uuidArray,
});

export const updateCustomerSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  companyName: z.string().optional(),
  phone: z.string().optional(),
  minBalance: z.coerce.number().int().min(0).optional(),
  creditLimit: z.coerce.number().int().min(0).optional(),
  dailyOrderLimit: z.coerce.number().int().min(0).optional(),
  monthlyOrderLimit: z.coerce.number().int().min(0).optional(),
  notes: z.string().optional(),
  allowedServerIds: uuidArray,
  allowedInboundIds: uuidArray,
  allowedPlanIds: uuidArray,
});

export const customerStatusSchema = z.object({
  isActive: z.boolean(),
  disabledReason: z.string().optional(),
});
