import { query } from '../db/pool.js';

export async function getReportSummary() {
  const summaryRes = await query<any>(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM wholesale_customers) AS wholesale_customers,
      (SELECT COUNT(*)::int FROM orders) AS orders,
      (SELECT COUNT(*)::int FROM orders WHERE status='completed') AS completed_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status='processing') AS processing_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status='failed') AS failed_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status='cancelled') AS cancelled_orders,
      (SELECT COUNT(*)::int FROM end_users WHERE deleted_at IS NULL) AS end_users,
      (SELECT COUNT(*)::int FROM end_users WHERE deleted_at IS NULL AND is_active=true) AS active_end_users,
      (SELECT COALESCE(SUM(total_price),0) FROM orders WHERE status='completed') AS revenue,
      (SELECT COALESCE(SUM(total_price),0) FROM orders WHERE status='completed' AND created_at >= CURRENT_DATE) AS today_revenue,
      (SELECT COALESCE(SUM(total_price),0) FROM orders WHERE status='completed' AND created_at >= date_trunc('month', NOW())) AS month_revenue,
      (SELECT COALESCE(SUM(balance),0) FROM wallets) AS wallet_total,
      (SELECT COALESCE(SUM(traffic_limit),0) FROM end_users WHERE deleted_at IS NULL) AS traffic_limit_total,
      (SELECT COALESCE(SUM(traffic_used),0) FROM end_users WHERE deleted_at IS NULL) AS traffic_used_total
  `);

  const ordersByStatusRes = await query<any>(`
    SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_price),0) AS total_price
    FROM orders
    GROUP BY status
    ORDER BY count DESC
  `);

  const dailyRevenueRes = await query<any>(`
    WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '13 days',
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS day
    )
    SELECT
      d.day,
      COALESCE(SUM(o.total_price) FILTER (WHERE o.status='completed'),0) AS revenue,
      COUNT(o.id)::int AS orders_count,
      COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_count
    FROM days d
    LEFT JOIN orders o
      ON o.created_at >= d.day
     AND o.created_at < d.day + INTERVAL '1 day'
    GROUP BY d.day
    ORDER BY d.day ASC
  `);

  const topCustomersRes = await query<any>(`
    SELECT
      wc.id,
      wc.company_name,
      u.username,
      u.email,
      COALESCE(w.balance,0) AS wallet_balance,
      COUNT(o.id)::int AS orders_count,
      COALESCE(SUM(o.total_price) FILTER (WHERE o.status='completed'),0) AS revenue,
      COALESCE((SELECT COUNT(*)::int FROM end_users eu WHERE eu.wholesale_customer_id=wc.id AND eu.deleted_at IS NULL),0) AS end_users_count
    FROM wholesale_customers wc
    JOIN users u ON u.id = wc.user_id
    LEFT JOIN wallets w ON w.wholesale_customer_id = wc.id
    LEFT JOIN orders o ON o.wholesale_customer_id = wc.id
    GROUP BY wc.id, wc.company_name, u.username, u.email, w.balance
    ORDER BY revenue DESC, orders_count DESC
    LIMIT 8
  `);

  const topPlansRes = await query<any>(`
    SELECT
      p.id,
      p.name,
      p.traffic_gb,
      p.duration_days,
      COUNT(o.id)::int AS orders_count,
      COALESCE(SUM(o.total_price) FILTER (WHERE o.status='completed'),0) AS revenue,
      COALESCE((SELECT COUNT(*)::int FROM end_users eu WHERE eu.plan_id=p.id AND eu.deleted_at IS NULL),0) AS end_users_count
    FROM plans p
    LEFT JOIN orders o ON o.plan_id = p.id
    GROUP BY p.id, p.name, p.traffic_gb, p.duration_days
    ORDER BY revenue DESC, orders_count DESC
    LIMIT 8
  `);

  const recentOrdersRes = await query<any>(`
    SELECT
      o.id,
      o.status,
      o.type,
      o.total_price,
      o.created_at,
      p.name AS plan_name,
      wc.company_name,
      u.username
    FROM orders o
    LEFT JOIN plans p ON p.id = o.plan_id
    LEFT JOIN wholesale_customers wc ON wc.id = o.wholesale_customer_id
    LEFT JOIN users u ON u.id = wc.user_id
    ORDER BY o.created_at DESC
    LIMIT 10
  `);

  return {
    summary: summaryRes.rows[0],
    ordersByStatus: ordersByStatusRes.rows,
    dailyRevenue: dailyRevenueRes.rows,
    topCustomers: topCustomersRes.rows,
    topPlans: topPlansRes.rows,
    recentOrders: recentOrdersRes.rows,
  };
}
