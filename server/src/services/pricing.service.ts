import { query, transaction } from '../db/pool.js';
import { AppError } from '../middleware/error.middleware.js';

function optionalNumber(value: any) {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
}

export async function listPlans(activeOnly = false) {
  const res = await query<any>(`
    SELECT
      p.*,
      COALESCE((SELECT COUNT(*)::int FROM end_users eu WHERE eu.plan_id = p.id AND eu.deleted_at IS NULL), 0) AS end_users_count,
      COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.plan_id = p.id), 0) AS orders_count
    FROM plans p
    ${activeOnly ? 'WHERE p.is_active=true' : ''}
    ORDER BY p.traffic_gb ASC
  `);

  return res.rows;
}

export async function getPlanById(planId: string) {
  const res = await query<any>(`
    SELECT
      p.*,
      COALESCE((SELECT COUNT(*)::int FROM end_users eu WHERE eu.plan_id = p.id AND eu.deleted_at IS NULL), 0) AS end_users_count,
      COALESCE((SELECT COUNT(*)::int FROM orders o WHERE o.plan_id = p.id), 0) AS orders_count
    FROM plans p
    WHERE p.id = $1
  `, [planId]);

  const plan = res.rows[0];
  if (!plan) throw new AppError(404, 'پلن یافت نشد', 'PLAN_NOT_FOUND');

  return plan;
}

export async function createPlan(input: any) {
  const res = await query<any>(
    `INSERT INTO plans (
      name,
      description,
      traffic_gb,
      duration_days,
      base_price,
      price_per_gb,
      ip_limit,
      is_active
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      input.name,
      input.description ?? null,
      input.trafficGB,
      input.durationDays,
      input.basePrice,
      input.pricePerGB,
      input.ipLimit ?? 1,
      input.isActive ?? true,
    ],
  );

  return getPlanById(res.rows[0].id);
}

export async function updatePlan(planId: string, input: any) {
  await query(
    `UPDATE plans
     SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      traffic_gb = COALESCE($4, traffic_gb),
      duration_days = COALESCE($5, duration_days),
      base_price = COALESCE($6, base_price),
      price_per_gb = COALESCE($7, price_per_gb),
      ip_limit = COALESCE($8, ip_limit),
      is_active = COALESCE($9, is_active),
      updated_at = NOW()
     WHERE id = $1`,
    [
      planId,
      input.name ?? null,
      input.description ?? null,
      optionalNumber(input.trafficGB) ?? null,
      optionalNumber(input.durationDays) ?? null,
      optionalNumber(input.basePrice) ?? null,
      optionalNumber(input.pricePerGB) ?? null,
      optionalNumber(input.ipLimit) ?? null,
      input.isActive ?? null,
    ],
  );

  return getPlanById(planId);
}

export async function setPlanStatus(planId: string, isActive: boolean) {
  await query(
    `UPDATE plans
     SET is_active = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [planId, isActive],
  );

  return getPlanById(planId);
}

export async function deletePlan(planId: string) {
  return transaction(async (client) => {
    const planRes = await client.query('SELECT * FROM plans WHERE id=$1', [planId]);
    const plan = planRes.rows[0];

    if (!plan) throw new AppError(404, 'پلن یافت نشد', 'PLAN_NOT_FOUND');

    const usage = await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM end_users WHERE plan_id=$1) AS end_users_count,
        (SELECT COUNT(*)::int FROM orders WHERE plan_id=$1) AS orders_count,
        (SELECT COUNT(*)::int FROM customer_specific_prices WHERE plan_id=$1) AS custom_prices_count`,
      [planId],
    );

    const endUsersCount = Number(usage.rows[0]?.end_users_count || 0);
    const ordersCount = Number(usage.rows[0]?.orders_count || 0);
    const customPricesCount = Number(usage.rows[0]?.custom_prices_count || 0);

    if (endUsersCount > 0 || ordersCount > 0 || customPricesCount > 0) {
      throw new AppError(
        400,
        'این پلن در سفارش‌ها، کاربران یا قیمت‌گذاری اختصاصی استفاده شده و قابل حذف کامل نیست. می‌توانید آن را غیرفعال کنید.',
        'PLAN_HAS_HISTORY',
      );
    }

    await client.query('DELETE FROM plans WHERE id=$1', [planId]);

    return { deleted: true };
  });
}

export async function calculatePrice(planId: string, customerId: string) {
  const planRes = await query<any>('SELECT * FROM plans WHERE id=$1 AND is_active=true', [planId]);
  const plan = planRes.rows[0];

  if (!plan) throw new AppError(404, 'پلن یافت نشد', 'PLAN_NOT_FOUND');

  const customRes = await query<any>(
    'SELECT * FROM customer_specific_prices WHERE wholesale_customer_id=$1 AND plan_id=$2',
    [customerId, planId],
  );

  const cp = customRes.rows[0];

  let finalPrice = Number(plan.base_price);
  let pricePerGb = Number(plan.price_per_gb);

  if (cp?.flat_price != null) {
    finalPrice = Number(cp.flat_price);
  } else if (cp?.price_per_gb != null) {
    pricePerGb = Number(cp.price_per_gb);
    finalPrice = Number(plan.traffic_gb) * pricePerGb;
  }

  if (cp?.discount_percent != null) {
    finalPrice = Math.round(finalPrice * (1 - Number(cp.discount_percent) / 100));
  }

  return { plan, finalPrice, pricePerGb };
}

export async function listCustomerPrices(customerId: string) {
  const customerRes = await query<any>(
    `SELECT wc.*, u.username, u.email
     FROM wholesale_customers wc
     JOIN users u ON u.id = wc.user_id
     WHERE wc.id = $1`,
    [customerId],
  );

  const customer = customerRes.rows[0];

  if (!customer) {
    throw new AppError(404, 'مشتری یافت نشد', 'CUSTOMER_NOT_FOUND');
  }

  const plansRes = await query<any>(
    `SELECT
      p.*,
      cp.id AS customer_price_id,
      cp.price_per_gb AS custom_price_per_gb,
      cp.flat_price AS custom_flat_price,
      cp.discount_percent AS custom_discount_percent
    FROM plans p
    LEFT JOIN customer_specific_prices cp
      ON cp.plan_id = p.id
     AND cp.wholesale_customer_id = $1
    ORDER BY p.traffic_gb ASC`,
    [customerId],
  );

  const rows = plansRes.rows.map((row: any) => {
    let finalPrice = Number(row.base_price);
    let pricePerGb = Number(row.price_per_gb);

    if (row.custom_flat_price != null) {
      finalPrice = Number(row.custom_flat_price);
    } else if (row.custom_price_per_gb != null) {
      pricePerGb = Number(row.custom_price_per_gb);
      finalPrice = Number(row.traffic_gb) * pricePerGb;
    }

    if (row.custom_discount_percent != null) {
      finalPrice = Math.round(finalPrice * (1 - Number(row.custom_discount_percent) / 100));
    }

    return {
      ...row,
      final_price: finalPrice,
      final_price_per_gb: pricePerGb,
      has_custom_price: row.customer_price_id != null,
    };
  });

  return { customer, plans: rows };
}

export async function upsertCustomerPrice(customerId: string, planId: string, input: any) {
  const customerRes = await query<any>('SELECT id FROM wholesale_customers WHERE id=$1', [customerId]);
  if (!customerRes.rows[0]) {
    throw new AppError(404, 'مشتری یافت نشد', 'CUSTOMER_NOT_FOUND');
  }

  const planRes = await query<any>('SELECT id FROM plans WHERE id=$1', [planId]);
  if (!planRes.rows[0]) {
    throw new AppError(404, 'پلن یافت نشد', 'PLAN_NOT_FOUND');
  }

  const pricePerGB = input.pricePerGB ?? null;
  const flatPrice = input.flatPrice ?? null;
  const discountPercent = input.discountPercent ?? null;

  if (pricePerGB == null && flatPrice == null && discountPercent == null) {
    await query(
      'DELETE FROM customer_specific_prices WHERE wholesale_customer_id=$1 AND plan_id=$2',
      [customerId, planId],
    );

    return { deleted: true };
  }

  const res = await query<any>(
    `INSERT INTO customer_specific_prices (
      wholesale_customer_id,
      plan_id,
      price_per_gb,
      flat_price,
      discount_percent
    )
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (wholesale_customer_id, plan_id)
    DO UPDATE SET
      price_per_gb = EXCLUDED.price_per_gb,
      flat_price = EXCLUDED.flat_price,
      discount_percent = EXCLUDED.discount_percent,
      updated_at = NOW()
    RETURNING *`,
    [customerId, planId, pricePerGB, flatPrice, discountPercent],
  );

  return res.rows[0];
}

export async function deleteCustomerPrice(customerId: string, planId: string) {
  await query(
    'DELETE FROM customer_specific_prices WHERE wholesale_customer_id=$1 AND plan_id=$2',
    [customerId, planId],
  );

  return { deleted: true };
}
