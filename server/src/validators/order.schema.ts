import { z } from 'zod';

const createOrderBaseSchema = z.object({
  planId: z.string().uuid(),
  serverId: z.string().uuid(),

  // سازگاری با کلاینت‌های قدیمی
  inboundId: z.string().uuid().optional(),

  inboundIds: z
    .array(z.string().uuid())
    .min(1)
    .max(30)
    .optional(),

  email: z
    .string()
    .trim()
    .min(3)
    .max(100),

  idempotencyKey: z
    .string()
    .max(255)
    .optional(),
}).superRefine((value, ctx) => {
  if (
    !value.inboundId &&
    (!value.inboundIds || value.inboundIds.length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['inboundIds'],
      message: 'حداقل یک اینباند باید انتخاب شود',
    });
  }
});

export const createOrderSchema =
  createOrderBaseSchema.transform((value) => {
    const inboundIds = [
      ...new Set(
        value.inboundIds?.length
          ? value.inboundIds
          : value.inboundId
            ? [value.inboundId]
            : [],
      ),
    ];

    return {
      ...value,
      inboundIds,
    };
  });

export type CreateOrderInput =
  z.infer<typeof createOrderSchema>;
