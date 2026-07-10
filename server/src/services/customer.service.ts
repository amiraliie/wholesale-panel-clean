import { transaction, query } from '../db/pool.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../middleware/error.middleware.js';

function optionalNumber(value: any) {
  if (value === undefined || value === null || value === '') return undefined;
  return Number(value);
}

function optionalArray(value: any) {
  return Array.isArray(value) ? value : undefined;
}

export async function listCustomers() {
  const res = await query<any>(`
    SELECT
      wc.*,
      u.username,
      u.email,
      u.role,
      u.is_active AS user_is_active,
      COALESCE(w.balance,0) AS wallet_balance,
      COALESCE((
        SELECT COUNT(*)::int
        FROM end_users eu
        WHERE eu.wholesale_customer_id = wc.id
          AND (eu.deleted_at IS NULL)
      ),0) AS end_users_count,
      COALESCE((
        SELECT COUNT(*)::int
        FROM orders o
        WHERE o.wholesale_customer_id = wc.id
      ),0) AS orders_count
    FROM wholesale_customers wc
    JOIN users u ON u.id = wc.user_id
    LEFT JOIN wallets w ON w.wholesale_customer_id = wc.id
    ORDER BY wc.created_at DESC
  `);

  return res.rows;
}

export async function getCustomerById(customerId: string) {
  const res = await query<any>(`
    SELECT
      wc.*,
      u.username,
      u.email,
      u.role,
      u.is_active AS user_is_active,
      COALESCE(w.balance,0) AS wallet_balance,
      COALESCE((
        SELECT COUNT(*)::int
        FROM end_users eu
        WHERE eu.wholesale_customer_id = wc.id
          AND (eu.deleted_at IS NULL)
      ),0) AS end_users_count,
      COALESCE((
        SELECT COUNT(*)::int
        FROM orders o
        WHERE o.wholesale_customer_id = wc.id
      ),0) AS orders_count
    FROM wholesale_customers wc
    JOIN users u ON u.id = wc.user_id
    LEFT JOIN wallets w ON w.wholesale_customer_id = wc.id
    WHERE wc.id = $1
  `, [customerId]);

  const row = res.rows[0];
  if (!row) throw new AppError(404, 'مشتری پیدا نشد', 'CUSTOMER_NOT_FOUND');
  return row;
}

export async function createCustomer(input: any) {
  return transaction(async (client) => {
    const hash = await hashPassword(input.password);

    const u = await client.query(
      `INSERT INTO users (username,email,password_hash,role,is_active)
       VALUES ($1,$2,$3,$4,true)
       RETURNING *`,
      [input.username, input.email, hash, 'wholesale'],
    );

    const user = u.rows[0];

    const c = await client.query(
      `INSERT INTO wholesale_customers (
        user_id,
        company_name,
        phone,
        min_balance,
        credit_limit,
        daily_order_limit,
        monthly_order_limit,
        notes,
        allowed_server_ids,
        allowed_inbound_ids,
        allowed_plan_ids,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid[],$10::uuid[],$11::uuid[],true)
      RETURNING *`,
      [
        user.id,
        input.companyName ?? null,
        input.phone ?? null,
        input.minBalance ?? 0,
        input.creditLimit ?? 0,
        input.dailyOrderLimit ?? 100,
        input.monthlyOrderLimit ?? 3000,
        input.notes ?? null,
        input.allowedServerIds ?? [],
        input.allowedInboundIds ?? [],
        input.allowedPlanIds ?? [],
      ],
    );

    const customer = c.rows[0];

    await client.query(
      'INSERT INTO wallets (wholesale_customer_id, balance) VALUES ($1, 0)',
      [customer.id],
    );

    return { ...customer, user };
  });
}

export async function updateCustomer(customerId: string, input: any) {
  return transaction(async (client) => {
    const current = await client.query(
      `SELECT wc.*, u.id AS user_id
       FROM wholesale_customers wc
       JOIN users u ON u.id = wc.user_id
       WHERE wc.id = $1`,
      [customerId],
    );

    const row = current.rows[0];
    if (!row) throw new AppError(404, 'مشتری پیدا نشد', 'CUSTOMER_NOT_FOUND');

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    await client.query(
      `UPDATE users
       SET
         username = COALESCE($2, username),
         email = COALESCE($3, email),
         password_hash = COALESCE($4, password_hash),
         updated_at = NOW()
       WHERE id = $1`,
      [
        row.user_id,
        input.username ?? null,
        input.email ?? null,
        passwordHash ?? null,
      ],
    );

    await client.query(
      `UPDATE wholesale_customers
       SET
         company_name = COALESCE($2, company_name),
         phone = COALESCE($3, phone),
         min_balance = COALESCE($4, min_balance),
         credit_limit = COALESCE($5, credit_limit),
         daily_order_limit = COALESCE($6, daily_order_limit),
         monthly_order_limit = COALESCE($7, monthly_order_limit),
         notes = COALESCE($8, notes),
         allowed_server_ids = COALESCE($9::uuid[], allowed_server_ids),
         allowed_inbound_ids = COALESCE($10::uuid[], allowed_inbound_ids),
         allowed_plan_ids = COALESCE($11::uuid[], allowed_plan_ids),
         updated_at = NOW()
       WHERE id = $1`,
      [
        customerId,
        input.companyName ?? null,
        input.phone ?? null,
        optionalNumber(input.minBalance) ?? null,
        optionalNumber(input.creditLimit) ?? null,
        optionalNumber(input.dailyOrderLimit) ?? null,
        optionalNumber(input.monthlyOrderLimit) ?? null,
        input.notes ?? null,
        optionalArray(input.allowedServerIds) ?? null,
        optionalArray(input.allowedInboundIds) ?? null,
        optionalArray(input.allowedPlanIds) ?? null,
      ],
    );

    return getCustomerById(customerId);
  });
}

export async function updateCustomerStatus(customerId: string, input: { isActive: boolean; disabledReason?: string }) {
  return transaction(async (client) => {
    const current = await client.query(
      `SELECT wc.*, u.id AS user_id
       FROM wholesale_customers wc
       JOIN users u ON u.id = wc.user_id
       WHERE wc.id = $1`,
      [customerId],
    );

    const row = current.rows[0];
    if (!row) throw new AppError(404, 'مشتری پیدا نشد', 'CUSTOMER_NOT_FOUND');

    await client.query(
      `UPDATE wholesale_customers
       SET is_active = $2,
           disabled_reason = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [
        customerId,
        input.isActive,
        input.isActive ? null : (input.disabledReason || 'حساب شما توسط مدیر غیرفعال شده است'),
      ],
    );

    await client.query(
      `UPDATE users
       SET is_active = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [row.user_id, input.isActive],
    );

    return getCustomerById(customerId);
  });
}

export async function deleteCustomer(customerId: string, options: { force?: boolean } = {}) {
  return transaction(async (client) => {
    const current = await client.query(
      `SELECT wc.*, u.id AS user_id
       FROM wholesale_customers wc
       JOIN users u ON u.id = wc.user_id
       WHERE wc.id = $1`,
      [customerId],
    );

    const row = current.rows[0];
    if (!row) throw new AppError(404, 'مشتری پیدا نشد', 'CUSTOMER_NOT_FOUND');

    const counts = await client.query(
      `SELECT
        COALESCE((SELECT COUNT(*)::int FROM orders WHERE wholesale_customer_id = $1), 0) AS orders_count,
        COALESCE((SELECT COUNT(*)::int FROM invoices WHERE wholesale_customer_id = $1), 0) AS invoices_count,
        COALESCE((SELECT COUNT(*)::int FROM end_users WHERE wholesale_customer_id = $1 AND deleted_at IS NULL), 0) AS end_users_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM end_users
          WHERE wholesale_customer_id = $1
            AND deleted_at IS NULL
            AND expiry_time > NOW()
            AND COALESCE(traffic_used, 0) < COALESCE(traffic_limit, 0)
            AND COALESCE(status, 'active') NOT IN ('expired', 'limited')
        ), 0) AS active_remaining_end_users_count`,
      [customerId],
    );

    const ordersCount = Number(counts.rows[0]?.orders_count || 0);
    const invoicesCount = Number(counts.rows[0]?.invoices_count || 0);
    const endUsersCount = Number(counts.rows[0]?.end_users_count || 0);
    const activeRemainingEndUsersCount = Number(counts.rows[0]?.active_remaining_end_users_count || 0);

    if (activeRemainingEndUsersCount > 0) {
      throw new AppError(
        409,
        `این مشتری ${activeRemainingEndUsersCount} کاربر فعال دارد که هنوز حجم و تاریخ آن تمام نشده است. حذف کامل انجام نشد.`,
        'CUSTOMER_HAS_ACTIVE_END_USERS',
      );
    }

    const hasHistory = ordersCount > 0 || invoicesCount > 0 || endUsersCount > 0;

    if (hasHistory && !options.force) {
      throw new AppError(
        409,
        `این مشتری ${ordersCount} سفارش، ${invoicesCount} فاکتور و ${endUsersCount} کاربر قبلی دارد. برای حذف کامل باید تایید مجدد انجام شود.`,
        'CUSTOMER_DELETE_REQUIRES_CONFIRMATION',
      );
    }

    const walletRes = await client.query<any>(
      'SELECT id FROM wallets WHERE wholesale_customer_id = $1',
      [customerId],
    );

    const orderRes = await client.query<any>(
      'SELECT id FROM orders WHERE wholesale_customer_id = $1',
      [customerId],
    );

    const walletIds = walletRes.rows.map((item) => item.id);
    const orderIds = orderRes.rows.map((item) => item.id);

    await client.query(
      `DELETE FROM invoices
       WHERE wholesale_customer_id = $1
          OR order_id = ANY($2::uuid[])`,
      [customerId, orderIds],
    );

    await client.query(
      `DELETE FROM wallet_transactions
       WHERE wallet_id = ANY($1::uuid[])
          OR order_id = ANY($2::uuid[])
          OR created_by = $3`,
      [walletIds, orderIds, row.user_id],
    );

    await client.query(
      'DELETE FROM orders WHERE wholesale_customer_id = $1',
      [customerId],
    );

    await client.query(
      'DELETE FROM end_users WHERE wholesale_customer_id = $1',
      [customerId],
    );

    await client.query(
      'DELETE FROM customer_specific_prices WHERE wholesale_customer_id = $1',
      [customerId],
    );

    await client.query(
      'DELETE FROM wallets WHERE wholesale_customer_id = $1',
      [customerId],
    );

    await client.query(
      `DELETE FROM audit_logs
       WHERE user_id = $1
          OR entity_id = $2`,
      [row.user_id, customerId],
    );

    await client.query(
      'DELETE FROM refresh_sessions WHERE user_id = $1',
      [row.user_id],
    );

    await client.query(
      'DELETE FROM users WHERE id = $1',
      [row.user_id],
    );

    return {
      deleted: true,
      force: Boolean(options.force),
      ordersDeleted: ordersCount,
      invoicesDeleted: invoicesCount,
      endUsersDeleted: endUsersCount,
    };
  });
}

