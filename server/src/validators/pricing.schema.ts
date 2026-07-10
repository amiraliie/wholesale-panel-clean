import { z } from 'zod';

export const upsertCustomerPriceSchema = z.object({
  pricePerGB: z.coerce.number().int().min(0).optional().nullable(),
  flatPrice: z.coerce.number().int().min(0).optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
}).refine((value) => {
  const filled = [
    value.pricePerGB !== undefined && value.pricePerGB !== null,
    value.flatPrice !== undefined && value.flatPrice !== null,
    value.discountPercent !== undefined && value.discountPercent !== null,
  ].filter(Boolean).length;

  return filled <= 1;
}, {
  message: 'فقط یکی از قیمت هر گیگ، قیمت ثابت یا درصد تخفیف می‌تواند پر باشد',
});
